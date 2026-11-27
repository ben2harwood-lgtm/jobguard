import { createHash, randomBytes, randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { appendAuditBatch } from "./audit.js";
import { PracticeAccessError } from "./practice-session.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";
import { assertV2Recipient, captureV2Delivery } from "./v2-local-catcher.js";
import { OpenFactRepository, openFactCommandV1, type OpenFact, type OpenFactKind } from "./v2-open-fact-repository.js";

const uuid = z.uuid().transform(value => value.toLowerCase());
const text = (max: number) => z.string().trim().min(1).max(max).refine(value => !value.includes("\0"));
const factVersion = z.number().int().min(1).max(2_147_483_646);
// Practice only: invented .invalid addresses, lower case, as the database checks too.
const practiceEmail = z.string().max(254).regex(/^[a-z0-9][a-z0-9._+-]*@([a-z0-9-]+\.)+invalid$/u);

// What a reply may say, one field per fact kind. "other" is free text, for a
// customer choice that allows "something else" or a reply the builder pasted.
export const factReplyAnswerV1 = z.union([
  z.strictObject({ choice: text(80) }),
  z.strictObject({ other: text(500) }),
  z.strictObject({ deliveryDate: z.iso.date() }),
  z.strictObject({ available: z.boolean() }),
  z.strictObject({ arrangement: text(500) }),
]);
export type FactReplyAnswer = z.output<typeof factReplyAnswerV1>;

const command = { version: z.literal("v2-fact-reply-command.v1") };
export const factReplyCommandV1 = z.discriminatedUnion("action", [
  z.strictObject({ ...command, action: z.literal("record_recipient"), commandId: uuid,
    role: z.enum(["merchant", "crew_member"]), merchantId: uuid.nullable(), displayName: text(120).nullable(),
    contactEmail: practiceEmail, correctsId: uuid.nullable() })
    // The name is always typed; for a known merchant the database's composite foreign key
    // to app.merchant(tenant_id, id, name) refuses any name but the merchant record's own.
    .refine(input => input.displayName !== null)
    .refine(input => input.merchantId === null || input.role === "merchant"),
  z.strictObject({ ...command, action: z.literal("request"), commandId: uuid, factId: uuid,
    expectedFactVersion: factVersion,
    recipient: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("customer") }),
      z.strictObject({ kind: z.literal("recorded"), recipientId: uuid }),
    ]),
    options: z.array(text(80)).min(2).max(6).refine(labels => new Set(labels).size === labels.length).nullable(),
    allowOther: z.boolean(), expiresInDays: z.number().int().min(1).max(30) })
    .refine(input => input.options !== null || !input.allowOther),
  z.strictObject({ ...command, action: z.literal("cancel"), commandId: uuid, requestId: uuid }),
  z.strictObject({ ...command, action: z.literal("paste"), commandId: uuid, factId: uuid,
    expectedFactVersion: factVersion, answer: factReplyAnswerV1 })
    .refine(input => !("choice" in input.answer)),
  // The reply id is the replay identity, and E1's command id for the answer.
  z.strictObject({ ...command, action: z.literal("apply"), replyId: uuid, expectedFactVersion: factVersion }),
]);
export const factReplyLinkV1 = z.strictObject({ version: z.literal("v2-fact-reply-link.v1"), commandId: uuid,
  answer: factReplyAnswerV1 });
export type FactReplyCommand = z.input<typeof factReplyCommandV1>;
type Parsed = z.output<typeof factReplyCommandV1>;
type Of<A extends Parsed["action"]> = Extract<Parsed, { action: A }>;

export class FactReplyError extends Error {
  constructor(readonly code: "REPLY_INVALID_COMMAND" | "REPLY_EDITOR_REQUIRED" | "REPLY_COMMAND_CONFLICT" |
    "REPLY_RECIPIENT_MISMATCH" | "REPLY_RECIPIENT_INVALID" | "REPLY_FACT_VERSION_CONFLICT" | "REPLY_FACT_CLOSED" |
    "REPLY_OPTIONS_INVALID" | "REPLY_ANSWER_INVALID" | "REPLY_CLOSED" | "REPLY_OUT_OF_DATE" | "REPLY_LINK_REFUSED" |
    "REPLY_ALREADY_ANSWERED" | "REPLY_NOT_V2") {
    super(code);
  }
}

export type FactReplyReceipt = { action: Parsed["action"] | "receive"; id: string; replayed: boolean;
  replyPath?: string; current?: boolean; factVersion?: number };

export type ReplyLinkView = { status: "open" | "answered"; kind: OpenFactKind; recipient: "customer" | "merchant" | "crew_member";
  question: string; options: string[]; allowOther: boolean; current: boolean;
  answer: Record<string, string | boolean> | null; answeredAt: string | null };

type RecipientRow = { id: string; role: "merchant" | "crew_member"; displayName: string; merchantId: string | null;
  contactEmail: string; correctsId: string | null; requestDigest: string; recordedBy: string; recordedAt: Date; current: boolean };
type RequestRow = { id: string; factId: string; factVersion: number; recipientKind: "customer" | "merchant" | "crew_member";
  partyBindingId: string | null; customerRevisionId: string | null; recipientId: string | null; contactEmail: string;
  options: string[] | null; allowOther: boolean; expiresAt: Date; requestDigest: string; requestedBy: string;
  requestedAt: Date; cancelled: boolean; current: boolean };
type ReplyRow = { id: string; factId: string; factVersion: number; requestId: string | null;
  source: "reply_link" | "pasted_by_builder"; choice: string | null; choiceOther: boolean | null;
  deliveryDate: string | null; available: boolean | null; arrangement: string | null; requestDigest: string;
  recordedBy: string | null; receivedAt: Date; appliedVersion: number | null; appliedDigest: string | null;
  appliedBy: string | null };

export type FactReplyView = {
  facts: OpenFact[];
  customer: { email: string | null };
  recipients: Omit<RecipientRow, "requestDigest">[];
  requests: (Omit<RequestRow, "requestDigest" | "partyBindingId" | "customerRevisionId"> & {
    status: "open" | "answered" | "cancelled" | "expired" })[];
  replies: { id: string; factId: string; factVersion: number; requestId: string | null; source: ReplyRow["source"];
    answer: FactReplyAnswer; receivedAt: Date; status: "ready" | "out_of_date" | "applied" }[];
};

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => [k, canonical(v)]));
  }
  return value;
}
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const digestOf = (jobId: string, input: unknown) => sha256(JSON.stringify(canonical({ jobId, input })));

const recipientColumns = `id, role, display_name AS "displayName", merchant_id AS "merchantId",
  contact_email AS "contactEmail", corrects_id AS "correctsId", request_digest AS "requestDigest",
  recorded_by AS "recordedBy", recorded_at AS "recordedAt",
  NOT EXISTS (SELECT FROM app.v2_reply_recipient n WHERE (n.tenant_id, n.job_id, n.corrects_id) = (r.tenant_id, r.job_id, r.id)) AS current`;
const requestColumns = `r.id, r.fact_id AS "factId", r.fact_version AS "factVersion", r.recipient_kind AS "recipientKind",
  r.party_binding_id AS "partyBindingId", r.customer_revision_id AS "customerRevisionId", r.recipient_id AS "recipientId",
  r.contact_email AS "contactEmail", r.options, r.allow_other AS "allowOther", r.expires_at AS "expiresAt",
  r.request_digest AS "requestDigest", r.requested_by AS "requestedBy", r.requested_at AS "requestedAt",
  EXISTS (SELECT FROM app.v2_fact_reply_cancel c WHERE (c.tenant_id, c.job_id, c.request_id) = (r.tenant_id, r.job_id, r.id)) AS cancelled,
  app.v2_fact_reply_current(r) AS current`;
const replyColumns = `a.id, a.fact_id AS "factId", a.fact_version AS "factVersion", a.request_id AS "requestId", a.source,
  a.choice, a.choice_other AS "choiceOther", a.delivery_date::text AS "deliveryDate", a.available, a.arrangement,
  a.request_digest AS "requestDigest", a.recorded_by AS "recordedBy", a.received_at AS "receivedAt",
  p.fact_version AS "appliedVersion", p.request_digest AS "appliedDigest", p.applied_by AS "appliedBy"`;

function answerOf(row: Pick<ReplyRow, "choice" | "choiceOther" | "deliveryDate" | "available" | "arrangement">): FactReplyAnswer {
  if (row.choice !== null) return row.choiceOther ? { other: row.choice } : { choice: row.choice };
  if (row.deliveryDate !== null) return { deliveryDate: row.deliveryDate };
  if (row.available !== null) return { available: row.available };
  return { arrangement: row.arrangement! };
}

// One reply field must match the fact's kind; a choice must be a stored label.
function answerFits(kind: OpenFactKind, answer: FactReplyAnswer, options: string[] | null, allowOther: boolean) {
  switch (kind) {
    case "customer_choice": return "choice" in answer ? options?.includes(answer.choice) === true : "other" in answer && allowOther;
    case "merchant_delivery_date": return "deliveryDate" in answer;
    case "crew_availability": return "available" in answer;
    case "access": return "arrangement" in answer;
  }
}

// The E1 answer a reply becomes when the builder applies it. mayChangePrice is the fact's own flag, unchanged.
export function openFactAnswerFor(fact: { kind: OpenFactKind; mayChangePrice: boolean | null }, answer: FactReplyAnswer) {
  switch (fact.kind) {
    case "customer_choice": return { kind: fact.kind, choice: "choice" in answer ? answer.choice : (answer as { other: string }).other,
      mayChangePrice: fact.mayChangePrice === true };
    case "merchant_delivery_date": return { kind: fact.kind, deliveryDate: (answer as { deliveryDate: string }).deliveryDate };
    case "crew_availability": return { kind: fact.kind, available: (answer as { available: boolean }).available };
    case "access": return { kind: fact.kind, arrangement: (answer as { arrangement: string }).arrangement };
  }
}

export function factReplyTokenHash(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/u.test(token)) throw new FactReplyError("REPLY_LINK_REFUSED");
  return sha256(token);
}

type FactRow = { kind: OpenFactKind; ownerKind: "customer" | "merchant" | "crew_member" | "builder"; ownerName: string | null;
  mayChangePrice: boolean | null; version: number; status: string };

export class FactReplyRepository {
  private readonly openFacts: OpenFactRepository;
  constructor(private readonly pool: Pool) {
    this.openFacts = new OpenFactRepository(pool);
  }

  async read(context: VerifiedTenantContext, jobId: string): Promise<FactReplyView> {
    const facts = await this.openFacts.read(context, jobId, { version: "v2-open-fact-query.v1" });
    return withTenant(this.pool, context, async ({ $client }) => {
      const key = [context.tenantId, jobId];
      const { rows: recipients } = await $client.query<RecipientRow>(`SELECT ${recipientColumns}
        FROM app.v2_reply_recipient r WHERE (tenant_id, job_id) = ($1, $2) ORDER BY recorded_at, id`, key);
      const { rows: requests } = await $client.query<RequestRow>(`SELECT ${requestColumns}
        FROM app.v2_fact_reply_request r WHERE (tenant_id, job_id) = ($1, $2) ORDER BY requested_at, id`, key);
      const { rows: replies } = await $client.query<ReplyRow>(`SELECT ${replyColumns}
        FROM app.v2_fact_reply a LEFT JOIN app.v2_fact_reply_applied p ON (p.tenant_id, p.job_id, p.reply_id) = (a.tenant_id, a.job_id, a.id)
        WHERE (a.tenant_id, a.job_id) = ($1, $2) ORDER BY a.received_at, a.id`, key);
      const customer = await this.customer($client, context.tenantId, jobId);
      const now = Date.now();
      return {
        facts, customer: { email: customer?.email ?? null },
        recipients: recipients.map(({ requestDigest: _digest, ...row }) => row),
        requests: requests.map(({ requestDigest: _digest, partyBindingId: _binding, customerRevisionId: _revision, ...row }) => ({
          ...row, status: row.cancelled ? "cancelled" : replies.some(reply => reply.requestId === row.id) ? "answered"
            : row.expiresAt.getTime() <= now ? "expired" : "open" })),
        replies: replies.map(row => {
          const fact = facts.find(entry => entry.id === row.factId);
          const request = requests.find(entry => entry.id === row.requestId);
          const current = (request ? request.current : true) && fact?.version === row.factVersion;
          return { id: row.id, factId: row.factId, factVersion: row.factVersion, requestId: row.requestId, source: row.source,
            answer: answerOf(row), receivedAt: row.receivedAt,
            status: row.appliedVersion !== null ? "applied" : current ? "ready" : "out_of_date" };
        }),
      };
    });
  }

  async command(context: VerifiedTenantContext, jobId: string, sessionId: string, input: FactReplyCommand) {
    const parsed = factReplyCommandV1.safeParse(input);
    if (!parsed.success) throw new FactReplyError("REPLY_INVALID_COMMAND");
    const commandInput = parsed.data;
    const digest = digestOf(jobId, commandInput);
    let sent: { token: string; to: string } | undefined;
    const receipt = await withTenant(this.pool, context, async database => {
      const { $client } = database;
      // Practice only: every builder command refuses outside the V2 database (plan check condition 2).
      const { rows: [actor] } = await $client.query<{ id: string | null; v2: boolean }>(
        "SELECT app.v2_work_plan_editor($1) AS id, current_database() = 'jobguard_v2_local' AS v2", [sha256(sessionId)]);
      if (!actor?.v2) throw new FactReplyError("REPLY_NOT_V2");
      if (!actor.id) throw new FactReplyError("REPLY_EDITOR_REQUIRED");
      switch (commandInput.action) {
        case "record_recipient": return this.recordRecipient(database, context.tenantId, jobId, commandInput, actor.id, digest);
        case "request": {
          const made = await this.request(database, context.tenantId, jobId, commandInput, actor.id, digest);
          sent = made.sent;
          return made.receipt;
        }
        case "cancel": return this.cancel(database, context.tenantId, jobId, commandInput, actor.id, digest);
        case "paste": return this.paste(database, context.tenantId, jobId, commandInput, actor.id, digest);
        case "apply": return this.apply(database, context, jobId, sessionId, commandInput, actor.id, digest);
      }
    });
    // After commit, once per request: metadata to the local catcher. The token goes
    // to the builder's practice screen only, never to a log or the audit chain.
    if (!sent) return receipt;
    captureV2Delivery("v2_fact_reply_request", sent.to);
    return { ...receipt, replyPath: `/reply/${sent.token}` };
  }

  // The no-sign-in reply page. Runtime calls only the narrow owner functions;
  // the commit keeps a failed attempt for the rate limit.
  async open(token: string): Promise<ReplyLinkView> {
    const hash = factReplyTokenHash(token);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const view = (await client.query<{ view: ReplyLinkView | { status: "refused" } }>(
        "SELECT app.v2_fact_reply_open($1) AS view", [hash])).rows[0]!.view;
      await client.query("COMMIT");
      if (view.status === "refused") throw new FactReplyError("REPLY_LINK_REFUSED");
      return view as ReplyLinkView;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  async receive(token: string, input: unknown): Promise<FactReplyReceipt> {
    const hash = factReplyTokenHash(token);
    const parsed = factReplyLinkV1.safeParse(input);
    if (!parsed.success) throw new FactReplyError("REPLY_ANSWER_INVALID");
    const { commandId, answer } = parsed.data;
    const digest = sha256(JSON.stringify(canonical({ tokenHash: hash, answer })));
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      type Received = { status: "refused" | "answered" } | { status: "recorded"; replayed: boolean; replyId: string; jobId: string;
        requestId: string; factId: string; factVersion: number; current: boolean };
      let saved: Received;
      try {
        saved = (await client.query<{ saved: Received }>("SELECT app.v2_fact_reply_receive($1, $2, $3, $4::jsonb) AS saved",
          [hash, commandId, digest, JSON.stringify(answer)])).rows[0]!.saved;
      } catch (error) {
        if ((error as { code?: string }).code === "22023") throw new FactReplyError("REPLY_ANSWER_INVALID");
        throw error;
      }
      if (saved.status === "recorded" && !saved.replayed) {
        // Only the scope's one received reply may enter the chain (policy v2_fact_reply_link_audit_write, which consumes the allowance).
        await appendAuditBatch(drizzle(client) as TenantTransaction, [{ id: randomUUID(), version: "audit.v1",
          actorRef: `reply_link:${saved.requestId}`, eventType: "v2.fact_reply.received", subjectType: "job",
          subjectRef: saved.jobId, payload: { references: { commandId: saved.replyId, replyId: saved.replyId,
            requestId: saved.requestId, factId: saved.factId, factVersion: String(saved.factVersion), source: "reply_link",
            current: String(saved.current) }, hashes: { request: digest }, classifications: { action: "operational" } } }]);
        await client.query("SELECT app.v2_fact_reply_close()");
      }
      await client.query("COMMIT");
      if (saved.status === "refused") throw new FactReplyError("REPLY_LINK_REFUSED");
      if (saved.status === "answered") throw new FactReplyError("REPLY_ALREADY_ANSWERED");
      if (saved.status !== "recorded") throw new FactReplyError("REPLY_LINK_REFUSED");
      return { action: "receive", id: saved.replyId, replayed: saved.replayed, current: saved.current };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release(); }
  }

  private async customer(client: PoolClient, tenantId: string, jobId: string) {
    const { rows: [row] } = await client.query<{ bindingId: string; revisionId: string; email: string | null }>(`
      SELECT b.id AS "bindingId", b.customer_revision_id AS "revisionId", r.payload->>'email' AS email
      FROM app.job_party_current p
      JOIN app.job_party_binding b ON (b.tenant_id, b.job_id, b.id) = (p.tenant_id, p.job_id, p.binding_id)
      JOIN app.customer_revision r ON (r.tenant_id, r.id) = (b.tenant_id, b.customer_revision_id)
      WHERE (p.tenant_id, p.job_id) = ($1, $2)
    `, [tenantId, jobId]);
    return row;
  }

  private async fact(client: PoolClient, tenantId: string, jobId: string, factId: string) {
    const { rows: [fact] } = await client.query<FactRow>(`
      SELECT f.kind, f.owner_kind AS "ownerKind", f.owner_name AS "ownerName", f.choice_may_change_price AS "mayChangePrice",
        c.expected_version + 1 AS version, c.status
      FROM app.v2_open_fact f CROSS JOIN LATERAL (
        SELECT expected_version, status FROM app.v2_open_fact_change
        WHERE (tenant_id, job_id, fact_id) = (f.tenant_id, f.job_id, f.id) ORDER BY expected_version DESC LIMIT 1) c
      WHERE (f.tenant_id, f.job_id, f.id) = ($1, $2, $3)
    `, [tenantId, jobId, factId]);
    if (!fact) throw new PracticeAccessError("NOT_FOUND");
    return fact;
  }

  private checkFact(fact: FactRow, expectedVersion: number) {
    if (fact.version !== expectedVersion) throw new FactReplyError("REPLY_FACT_VERSION_CONFLICT");
    if (fact.status === "answered" || fact.status === "cancelled") throw new FactReplyError("REPLY_FACT_CLOSED");
  }

  private lock(client: PoolClient, tenantId: string, key: string) {
    return client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 2013))", [`${tenantId}:${key}`]);
  }

  private replayed(prior: { requestDigest: string; actor: string | null } | undefined, digest: string, actorId: string) {
    if (!prior) return false;
    if (prior.requestDigest !== digest || prior.actor !== actorId) throw new FactReplyError("REPLY_COMMAND_CONFLICT");
    return true;
  }

  // References and hashes only: no name, email, question, option or answer text enters the chain.
  private audit(database: TenantTransaction, actorId: string, jobId: string, eventType: string,
    references: Record<string, string>, hashes: Record<string, string>) {
    return appendAuditBatch(database, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${actorId}`,
      eventType, subjectType: "job", subjectRef: jobId, payload: { references, hashes,
        classifications: { action: "operational" } } }]);
  }

  private async recordRecipient(database: TenantTransaction, tenantId: string, jobId: string, input: Of<"record_recipient">,
    actorId: string, digest: string): Promise<FactReplyReceipt> {
    const { $client } = database;
    await this.lock($client, tenantId, `recipient:${jobId}`);
    const { rows: [prior] } = await $client.query<{ requestDigest: string; actor: string }>(`SELECT request_digest AS "requestDigest",
      recorded_by AS actor FROM app.v2_reply_recipient WHERE (tenant_id, job_id, id) = ($1, $2, $3)`, [tenantId, jobId, input.commandId]);
    if (this.replayed(prior, digest, actorId)) return { action: input.action, id: input.commandId, replayed: true };
    try { assertV2Recipient(input.contactEmail); }
    catch { throw new FactReplyError("REPLY_RECIPIENT_INVALID"); }
    const name = input.displayName!;
    if (input.correctsId !== null) {
      const { rows: [old] } = await $client.query<{ role: string; current: boolean }>(`SELECT r.role,
        NOT EXISTS (SELECT FROM app.v2_reply_recipient n WHERE (n.tenant_id, n.job_id, n.corrects_id) = (r.tenant_id, r.job_id, r.id)) AS current
        FROM app.v2_reply_recipient r WHERE (r.tenant_id, r.job_id, r.id) = ($1, $2, $3)`, [tenantId, jobId, input.correctsId]);
      if (!old || old.role !== input.role || !old.current) throw new FactReplyError("REPLY_RECIPIENT_INVALID");
    }
    try {
      await $client.query(`INSERT INTO app.v2_reply_recipient (tenant_id, job_id, id, role, display_name, merchant_id,
        contact_email, corrects_id, request_digest, recorded_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [tenantId, jobId, input.commandId, input.role, name, input.merchantId, input.contactEmail, input.correctsId, digest, actorId]);
    } catch (error) {
      // 23503: the merchant id and name do not match one merchant record of this firm.
      if ((error as { code?: string }).code === "23503") throw new FactReplyError("REPLY_RECIPIENT_INVALID");
      throw error;
    }
    await this.audit(database, actorId, jobId, "v2.reply_recipient.recorded", {
      commandId: input.commandId, recipientId: input.commandId, role: input.role,
      ...(input.merchantId && { merchantId: input.merchantId }), ...(input.correctsId && { correctsId: input.correctsId }),
    }, { request: digest, contact: sha256(input.contactEmail) });
    return { action: input.action, id: input.commandId, replayed: false };
  }

  private async request(database: TenantTransaction, tenantId: string, jobId: string, input: Of<"request">,
    actorId: string, digest: string): Promise<{ receipt: FactReplyReceipt; sent?: { token: string; to: string } }> {
    const { $client } = database;
    await this.lock($client, tenantId, `fact:${input.factId}`);
    const { rows: [prior] } = await $client.query<{ requestDigest: string; actor: string }>(`SELECT request_digest AS "requestDigest",
      requested_by AS actor FROM app.v2_fact_reply_request WHERE (tenant_id, job_id, id) = ($1, $2, $3)`,
    [tenantId, jobId, input.commandId]);
    if (this.replayed(prior, digest, actorId)) {
      return { receipt: { action: input.action, id: input.commandId, replayed: true } };
    }
    const fact = await this.fact($client, tenantId, jobId, input.factId);
    this.checkFact(fact, input.expectedFactVersion);
    if ((fact.kind === "customer_choice") !== (input.options !== null)) throw new FactReplyError("REPLY_OPTIONS_INVALID");
    let customer: Awaited<ReturnType<FactReplyRepository["customer"]>> | undefined;
    let recipient: { id: string; role: "merchant" | "crew_member"; contactEmail: string } | undefined;
    if (input.recipient.kind === "customer") {
      // A customer request uses the job's own party record, never a typed address.
      if (fact.ownerKind !== "customer") throw new FactReplyError("REPLY_RECIPIENT_MISMATCH");
      customer = await this.customer($client, tenantId, jobId);
      if (!customer?.email) throw new FactReplyError("REPLY_RECIPIENT_INVALID");
    } else {
      // A customer choice goes only to the customer; a merchant or crew fact only to that named recipient.
      if (fact.kind === "customer_choice" || (fact.ownerKind !== "merchant" && fact.ownerKind !== "crew_member")) {
        throw new FactReplyError("REPLY_RECIPIENT_MISMATCH");
      }
      const { rows: [row] } = await $client.query<RecipientRow>(`SELECT ${recipientColumns}
        FROM app.v2_reply_recipient r WHERE (tenant_id, job_id, id) = ($1, $2, $3)`, [tenantId, jobId, input.recipient.recipientId]);
      if (!row || !row.current) throw new FactReplyError("REPLY_RECIPIENT_INVALID");
      if (row.role !== fact.ownerKind || row.displayName !== fact.ownerName) throw new FactReplyError("REPLY_RECIPIENT_MISMATCH");
      recipient = row;
    }
    const to = customer?.email ?? recipient!.contactEmail;
    try { assertV2Recipient(to); if (!/\.invalid$/iu.test(to)) throw new Error("not practice"); }
    catch { throw new FactReplyError("REPLY_RECIPIENT_INVALID"); }
    const token = randomBytes(32).toString("base64url");
    await $client.query(`INSERT INTO app.v2_fact_reply_request (tenant_id, job_id, id, fact_id, fact_version, recipient_kind,
      party_binding_id, customer_revision_id, recipient_id, contact_email, options, allow_other, token_hash, expires_at,
      request_digest, requested_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,clock_timestamp() + make_interval(days => $14),$15,$16)`,
    [tenantId, jobId, input.commandId, input.factId, fact.version, customer ? "customer" : recipient!.role,
      customer?.bindingId ?? null, customer?.revisionId ?? null, recipient?.id ?? null, to,
      input.options === null ? null : JSON.stringify(input.options), input.allowOther, sha256(token), input.expiresInDays,
      digest, actorId]);
    await this.audit(database, actorId, jobId, "v2.fact_reply.requested", {
      commandId: input.commandId, requestId: input.commandId, factId: input.factId, factVersion: String(fact.version),
      recipientKind: customer ? "customer" : recipient!.role,
      ...(customer ? { partyBindingId: customer.bindingId, customerRevisionId: customer.revisionId } : { recipientId: recipient!.id }),
    }, { request: digest });
    return { receipt: { action: input.action, id: input.commandId, replayed: false }, sent: { token, to } };
  }

  private async cancel(database: TenantTransaction, tenantId: string, jobId: string, input: Of<"cancel">,
    actorId: string, digest: string): Promise<FactReplyReceipt> {
    const { $client } = database;
    await this.lock($client, tenantId, input.requestId);
    const { rows: [prior] } = await $client.query<{ requestDigest: string; actor: string }>(`SELECT request_digest AS "requestDigest",
      cancelled_by AS actor FROM app.v2_fact_reply_cancel WHERE (tenant_id, job_id, command_id) = ($1, $2, $3)`,
    [tenantId, jobId, input.commandId]);
    if (this.replayed(prior, digest, actorId)) return { action: input.action, id: input.requestId, replayed: true };
    const { rows: [request] } = await $client.query<{ cancelled: boolean; answered: boolean }>(`SELECT
      EXISTS (SELECT FROM app.v2_fact_reply_cancel c WHERE (c.tenant_id, c.job_id, c.request_id) = (r.tenant_id, r.job_id, r.id)) AS cancelled,
      EXISTS (SELECT FROM app.v2_fact_reply a WHERE (a.tenant_id, a.job_id, a.request_id) = (r.tenant_id, r.job_id, r.id)) AS answered
      FROM app.v2_fact_reply_request r WHERE (r.tenant_id, r.job_id, r.id) = ($1, $2, $3)`, [tenantId, jobId, input.requestId]);
    if (!request) throw new PracticeAccessError("NOT_FOUND");
    if (request.cancelled || request.answered) throw new FactReplyError("REPLY_CLOSED");
    await $client.query(`INSERT INTO app.v2_fact_reply_cancel (tenant_id, job_id, request_id, command_id, request_digest, cancelled_by)
      VALUES ($1,$2,$3,$4,$5,$6)`, [tenantId, jobId, input.requestId, input.commandId, digest, actorId]);
    await this.audit(database, actorId, jobId, "v2.fact_reply.cancelled",
      { commandId: input.commandId, requestId: input.requestId }, { request: digest });
    return { action: input.action, id: input.requestId, replayed: false };
  }

  // A reply the builder heard by phone or WhatsApp, typed in as received. It answers the fact version on screen.
  private async paste(database: TenantTransaction, tenantId: string, jobId: string, input: Of<"paste">,
    actorId: string, digest: string): Promise<FactReplyReceipt> {
    const { $client } = database;
    await this.lock($client, tenantId, `fact:${input.factId}`);
    const { rows: [prior] } = await $client.query<{ requestDigest: string; actor: string }>(`SELECT request_digest AS "requestDigest",
      recorded_by AS actor FROM app.v2_fact_reply WHERE (tenant_id, job_id, id) = ($1, $2, $3)`, [tenantId, jobId, input.commandId]);
    if (this.replayed(prior, digest, actorId)) return { action: input.action, id: input.commandId, replayed: true };
    const fact = await this.fact($client, tenantId, jobId, input.factId);
    this.checkFact(fact, input.expectedFactVersion);
    if (!answerFits(fact.kind, input.answer, null, true)) throw new FactReplyError("REPLY_ANSWER_INVALID");
    const a = input.answer;
    await $client.query(`INSERT INTO app.v2_fact_reply (tenant_id, job_id, id, fact_id, fact_version, source, choice,
      choice_other, delivery_date, available, arrangement, request_digest, recorded_by)
      VALUES ($1,$2,$3,$4,$5,'pasted_by_builder',$6,$7,$8,$9,$10,$11,$12)`,
    [tenantId, jobId, input.commandId, input.factId, fact.version, "other" in a ? a.other : null, "other" in a ? true : null,
      "deliveryDate" in a ? a.deliveryDate : null, "available" in a ? a.available : null,
      "arrangement" in a ? a.arrangement : null, digest, actorId]);
    await this.audit(database, actorId, jobId, "v2.fact_reply.received", { commandId: input.commandId, replyId: input.commandId,
      factId: input.factId, factVersion: String(fact.version), source: "pasted_by_builder", current: "true" }, { request: digest });
    return { action: input.action, id: input.commandId, replayed: false };
  }

  // One transaction: E1's answer, E2's applied record and its event commit together or not at all.
  private async apply(database: TenantTransaction, context: VerifiedTenantContext, jobId: string, sessionId: string,
    input: Of<"apply">, actorId: string, digest: string): Promise<FactReplyReceipt> {
    const { $client } = database;
    const tenantId = context.tenantId;
    const { rows: [found] } = await $client.query<{ requestId: string | null; factId: string }>(`SELECT request_id AS "requestId",
      fact_id AS "factId" FROM app.v2_fact_reply WHERE (tenant_id, job_id, id) = ($1, $2, $3)`, [tenantId, jobId, input.replyId]);
    if (!found) throw new PracticeAccessError("NOT_FOUND");
    // The fact lock first, as request() and paste() take it: no newer request can commit
    // between the currentness check below and the answer write. Then recordRecipient()'s lock,
    // so no recipient correction can commit there either (a correction doesn't move the fact version).
    await this.lock($client, tenantId, `fact:${found.factId}`);
    await this.lock($client, tenantId, `recipient:${jobId}`);
    await this.lock($client, tenantId, found.requestId ?? input.replyId);
    const { rows: [reply] } = await $client.query<ReplyRow>(`SELECT ${replyColumns}
      FROM app.v2_fact_reply a LEFT JOIN app.v2_fact_reply_applied p ON (p.tenant_id, p.job_id, p.reply_id) = (a.tenant_id, a.job_id, a.id)
      WHERE (a.tenant_id, a.job_id, a.id) = ($1, $2, $3)`, [tenantId, jobId, input.replyId]);
    if (reply!.appliedVersion !== null) {
      this.replayed({ requestDigest: reply!.appliedDigest!, actor: reply!.appliedBy }, digest, actorId);
      return { action: input.action, id: input.replyId, replayed: true, factVersion: reply!.appliedVersion };
    }
    const fact = await this.fact($client, tenantId, jobId, reply!.factId);
    let current = fact.version === reply!.factVersion && input.expectedFactVersion === reply!.factVersion;
    if (current && reply!.requestId !== null) {
      const { rows: [request] } = await $client.query<{ current: boolean }>(`SELECT app.v2_fact_reply_current(r) AS current
        FROM app.v2_fact_reply_request r WHERE (r.tenant_id, r.job_id, r.id) = ($1, $2, $3)`, [tenantId, jobId, reply!.requestId]);
      current = request!.current;
    }
    if (!current) throw new FactReplyError("REPLY_OUT_OF_DATE");
    const answer = openFactCommandV1.parse({ version: "v2-open-fact-command.v1", action: "answer", commandId: reply!.id,
      factId: reply!.factId, expectedVersion: reply!.factVersion, answer: openFactAnswerFor(fact, answerOf(reply!)) });
    const answered = await this.openFacts.commandIn(database, context, jobId, sessionId, answer);
    await $client.query(`INSERT INTO app.v2_fact_reply_applied (tenant_id, job_id, reply_id, fact_version, request_digest, applied_by)
      VALUES ($1,$2,$3,$4,$5,$6)`, [tenantId, jobId, reply!.id, answered.version, digest, actorId]);
    await this.audit(database, actorId, jobId, "v2.fact_reply.applied_by_builder", { commandId: reply!.id, replyId: reply!.id,
      factId: reply!.factId, factVersion: String(answered.version) }, { request: digest });
    return { action: input.action, id: input.replyId, replayed: false, factVersion: answered.version };
  }
}
