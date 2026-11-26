import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { appendAuditBatch } from "./audit.js";
import { PracticeAccessError } from "./practice-session.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";

const uuid = z.uuid().transform(value => value.toLowerCase());
const text = (max: number) => z.string().trim().min(1).max(max).refine(value => !value.includes("\0"));
const date = z.iso.date();
const version = z.number().int().min(0).max(2_147_483_646);

export const openFactKinds = ["customer_choice", "merchant_delivery_date", "crew_availability", "access"] as const;
export type OpenFactKind = typeof openFactKinds[number];
export type OpenFactStatus = "open" | "answered" | "cancelled" | "out_of_date";

const owner = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.enum(["customer", "builder"]) }),
  z.strictObject({ kind: z.enum(["merchant", "crew_member"]), name: text(120) }),
]);

// Each kind carries its own detail; nothing is shared between kinds.
const detail = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("customer_choice"), question: text(500), mayChangePrice: z.boolean() }),
  z.strictObject({ kind: z.literal("merchant_delivery_date"), item: text(500) }),
  z.strictObject({ kind: z.literal("crew_availability"), need: text(500) }),
  z.strictObject({ kind: z.literal("access"), need: text(500) }),
]);

const answer = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("customer_choice"), choice: text(500), mayChangePrice: z.boolean() }),
  z.strictObject({ kind: z.literal("merchant_delivery_date"), deliveryDate: date }),
  z.strictObject({ kind: z.literal("crew_availability"), available: z.boolean() }),
  z.strictObject({ kind: z.literal("access"), arrangement: text(500) }),
]);

const change = { version: z.literal("v2-open-fact-command.v1"), commandId: uuid, factId: uuid, expectedVersion: version };

export const openFactCommandV1 = z.discriminatedUnion("action", [
  z.strictObject({
    version: z.literal("v2-open-fact-command.v1"),
    action: z.literal("log"),
    commandId: uuid,
    scopeItemId: uuid.nullable(),
    planTask: z.strictObject({ quoteRevisionId: uuid, taskKey: text(200) }).nullable(),
    owner,
    neededBy: date,
    detail,
  }).refine(command => command.planTask === null || command.scopeItemId !== null),
  z.strictObject({ ...change, action: z.literal("answer"), answer }),
  z.strictObject({ ...change, action: z.literal("cancel") }),
  z.strictObject({ ...change, action: z.literal("mark_out_of_date") }),
]);

export const openFactQueryV1 = z.strictObject({
  version: z.literal("v2-open-fact-query.v1"),
  factId: uuid.optional(),
});

export type OpenFactCommand = z.input<typeof openFactCommandV1>;
export type OpenFactQuery = z.input<typeof openFactQueryV1>;
type ParsedCommand = z.output<typeof openFactCommandV1>;
type Answer = z.output<typeof answer>;

export type OpenFactReceipt = {
  factId: string;
  commandId: string;
  action: ParsedCommand["action"];
  version: number;
  status: OpenFactStatus;
  actorMembershipId: string;
  recordedAt: Date;
};

export type OpenFactChange = OpenFactReceipt & { answer: Answer | null };

export type OpenFact = {
  id: string;
  kind: OpenFactKind;
  scopeItemId: string | null;
  planTask: { quoteRevisionId: string; taskKey: string } | null;
  owner: { kind: "customer" | "builder" } | { kind: "merchant" | "crew_member"; name: string };
  neededBy: string;
  source: "builder_logged";
  detail: z.output<typeof detail>;
  status: OpenFactStatus;
  version: number;
  answer: Answer | null;
  // Chunk F decides any price change. This only says the fact should be looked at there.
  mayChangePrice: boolean;
  history: OpenFactChange[];
};

export class OpenFactError extends Error {
  constructor(readonly code: "OPEN_FACT_INVALID_QUERY" | "OPEN_FACT_INVALID_COMMAND" | "OPEN_FACT_EDITOR_REQUIRED" |
    "OPEN_FACT_REFERENCE_INVALID" | "OPEN_FACT_KIND_MISMATCH" | "OPEN_FACT_CLOSED" |
    "OPEN_FACT_VERSION_CONFLICT" | "OPEN_FACT_COMMAND_CONFLICT") {
    super(code);
  }
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => [k, canonical(v)]));
  }
  return value;
}

const digestOf = (jobId: string, command: ParsedCommand) =>
  createHash("sha256").update(JSON.stringify(canonical({ jobId, command }))).digest("hex");

type ChangeRow = {
  factId: string; commandId: string; requestDigest: string; action: ParsedCommand["action"]; expectedVersion: number;
  status: OpenFactStatus; choiceAnswer: string | null; answerMayChangePrice: boolean | null; deliveryDate: string | null;
  crewAvailable: boolean | null; accessAnswer: string | null; actorMembershipId: string; recordedAt: Date;
};

const changeColumns = `fact_id AS "factId", command_id AS "commandId", request_digest AS "requestDigest", action,
  expected_version AS "expectedVersion", status, choice_answer AS "choiceAnswer",
  answer_may_change_price AS "answerMayChangePrice", delivery_date::text AS "deliveryDate",
  crew_available AS "crewAvailable", access_answer AS "accessAnswer",
  actor_membership_id AS "actorMembershipId", recorded_at AS "recordedAt"`;

type FactRow = {
  id: string; kind: OpenFactKind; scopeItemId: string | null; planQuoteRevisionId: string | null; planTaskKey: string | null;
  ownerKind: "customer" | "merchant" | "crew_member" | "builder"; ownerName: string | null; neededBy: string;
  source: "builder_logged"; choiceQuestion: string | null; choiceMayChangePrice: boolean | null;
  deliveryItem: string | null; crewNeed: string | null; accessNeed: string | null;
};

const factColumns = `id, kind, scope_item_id AS "scopeItemId", plan_quote_revision_id AS "planQuoteRevisionId",
  plan_task_key AS "planTaskKey", owner_kind AS "ownerKind", owner_name AS "ownerName", needed_by::text AS "neededBy",
  source, choice_question AS "choiceQuestion", choice_may_change_price AS "choiceMayChangePrice",
  delivery_item AS "deliveryItem", crew_need AS "crewNeed", access_need AS "accessNeed"`;

function receipt(row: ChangeRow): OpenFactReceipt {
  return { factId: row.factId, commandId: row.commandId, action: row.action, version: row.expectedVersion + 1,
    status: row.status, actorMembershipId: row.actorMembershipId, recordedAt: row.recordedAt };
}

function answerOf(row: ChangeRow): Answer | null {
  if (row.choiceAnswer !== null) return { kind: "customer_choice", choice: row.choiceAnswer, mayChangePrice: row.answerMayChangePrice! };
  if (row.deliveryDate !== null) return { kind: "merchant_delivery_date", deliveryDate: row.deliveryDate };
  if (row.crewAvailable !== null) return { kind: "crew_availability", available: row.crewAvailable };
  if (row.accessAnswer !== null) return { kind: "access", arrangement: row.accessAnswer };
  return null;
}

function detailOf(row: FactRow): OpenFact["detail"] {
  switch (row.kind) {
    case "customer_choice": return { kind: row.kind, question: row.choiceQuestion!, mayChangePrice: row.choiceMayChangePrice! };
    case "merchant_delivery_date": return { kind: row.kind, item: row.deliveryItem! };
    case "crew_availability": return { kind: row.kind, need: row.crewNeed! };
    case "access": return { kind: row.kind, need: row.accessNeed! };
  }
}

function project(row: FactRow, changes: ChangeRow[]): OpenFact {
  const history = changes.map(change => ({ ...receipt(change), answer: answerOf(change) }));
  const current = history.at(-1)!;
  const answered = current.status === "answered" ? current.answer : null;
  return {
    id: row.id, kind: row.kind, scopeItemId: row.scopeItemId,
    planTask: row.planTaskKey === null ? null : { quoteRevisionId: row.planQuoteRevisionId!, taskKey: row.planTaskKey },
    owner: row.ownerKind === "merchant" || row.ownerKind === "crew_member"
      ? { kind: row.ownerKind, name: row.ownerName! } : { kind: row.ownerKind },
    neededBy: row.neededBy, source: row.source, detail: detailOf(row), status: current.status, version: current.version,
    answer: answered,
    mayChangePrice: row.choiceMayChangePrice === true || (answered?.kind === "customer_choice" && answered.mayChangePrice),
    history,
  };
}

export class OpenFactRepository {
  constructor(private readonly pool: Pool) {}

  read(context: VerifiedTenantContext, jobId: string, query: OpenFactQuery) {
    const parsed = openFactQueryV1.safeParse(query);
    if (!parsed.success) throw new OpenFactError("OPEN_FACT_INVALID_QUERY");
    const factId = parsed.data.factId ?? null;
    return withTenant(this.pool, context, async ({ $client }) => {
      const { rows: facts } = await $client.query<FactRow>(`
        SELECT ${factColumns} FROM app.v2_open_fact
        WHERE (tenant_id, job_id) = ($1, $2) AND ($3::uuid IS NULL OR id = $3)
        ORDER BY needed_by, id
      `, [context.tenantId, jobId, factId]);
      const { rows: changes } = await $client.query<ChangeRow>(`
        SELECT ${changeColumns} FROM app.v2_open_fact_change
        WHERE (tenant_id, job_id) = ($1, $2) AND ($3::uuid IS NULL OR fact_id = $3)
        ORDER BY fact_id, expected_version
      `, [context.tenantId, jobId, factId]);
      return facts.map(fact => project(fact, changes.filter(change => change.factId === fact.id)));
    });
  }

  async command(context: VerifiedTenantContext, jobId: string, sessionId: string, input: OpenFactCommand) {
    const parsed = openFactCommandV1.safeParse(input);
    if (!parsed.success) throw new OpenFactError("OPEN_FACT_INVALID_COMMAND");
    const command = parsed.data;
    const digest = digestOf(jobId, command);
    return withTenant(this.pool, context, async database => {
      const { $client } = database;
      const credential = createHash("sha256").update(sessionId).digest("hex");
      const { rows: [actor] } = await $client.query<{ id: string | null }>(
        "SELECT app.v2_work_plan_editor($1) AS id", [credential],
      );
      if (!actor?.id) throw new OpenFactError("OPEN_FACT_EDITOR_REQUIRED");

      const prior = await this.replay($client, context.tenantId, jobId, command.commandId, actor.id, digest);
      if (prior) return prior;

      let saved: ChangeRow | undefined;
      try {
        saved = command.action === "log"
          ? await this.log($client, context.tenantId, jobId, command, actor.id, digest)
          : await this.change($client, context.tenantId, jobId, command, actor.id, digest);
      } catch (error) {
        // An exact retry that committed after the first replay lookup moved the version or closed the fact.
        if (error instanceof OpenFactError && (error.code === "OPEN_FACT_VERSION_CONFLICT" || error.code === "OPEN_FACT_CLOSED")) {
          const raced = await this.replay($client, context.tenantId, jobId, command.commandId, actor.id, digest);
          if (raced) return raced;
        }
        throw error;
      }
      if (saved) {
        // Only a new change reaches the chain; replays return above or below without a second event.
        await this.audit(database, jobId, saved, command.action === "log" ? command.detail.kind : null);
        return receipt(saved);
      }
      // Uniqueness arbitrated a race: an exact concurrent retry replays, anything else lost.
      const raced = await this.replay($client, context.tenantId, jobId, command.commandId, actor.id, digest);
      if (raced) return raced;
      throw new OpenFactError("OPEN_FACT_VERSION_CONFLICT");
    });
  }

  // References and hashes only: no question, answer, owner name or other free text enters the chain.
  private audit(database: TenantTransaction, jobId: string, saved: ChangeRow, kind: OpenFactKind | null) {
    return appendAuditBatch(database, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${saved.actorMembershipId}`,
      eventType: `v2_open_fact.${saved.action}`, subjectType: "job", subjectRef: jobId,
      payload: { references: { commandId: saved.commandId, factId: saved.factId, factVersion: String(saved.expectedVersion + 1),
        status: saved.status, ...(kind && { kind }) }, hashes: { request: saved.requestDigest },
      classifications: { action: "operational" } } }]);
  }

  private async replay(client: PoolClient, tenantId: string, jobId: string, commandId: string, actorId: string, digest: string) {
    const { rows: [prior] } = await client.query<ChangeRow>(`
      SELECT ${changeColumns} FROM app.v2_open_fact_change WHERE (tenant_id, job_id, command_id) = ($1, $2, $3)
    `, [tenantId, jobId, commandId]);
    if (!prior) return null;
    if (prior.requestDigest !== digest || prior.actorMembershipId !== actorId) {
      throw new OpenFactError("OPEN_FACT_COMMAND_CONFLICT");
    }
    return receipt(prior);
  }

  private async log(client: PoolClient, tenantId: string, jobId: string,
    command: Extract<ParsedCommand, { action: "log" }>, actorId: string, digest: string) {
    if (command.scopeItemId !== null) {
      const { rowCount } = await client.query(`
        SELECT FROM app.scope_identity WHERE (tenant_id, job_id, id) = ($1, $2, $3) AND state <> 'retired'
      `, [tenantId, jobId, command.scopeItemId]);
      if (!rowCount) throw new OpenFactError("OPEN_FACT_REFERENCE_INVALID");
    }
    if (command.planTask !== null) {
      const { rowCount } = await client.query(`
        SELECT FROM app.v2_work_plan_task
        WHERE (tenant_id, job_id, quote_revision_id, scope_item_id, template_task_key) = ($1, $2, $3, $4, $5)
      `, [tenantId, jobId, command.planTask.quoteRevisionId, command.scopeItemId, command.planTask.taskKey]);
      if (!rowCount) throw new OpenFactError("OPEN_FACT_REFERENCE_INVALID");
    }
    const { detail: d, owner: o } = command;
    // A logged fact takes its log command's id, so an exact retry cannot create a second fact.
    await client.query(`
      INSERT INTO app.v2_open_fact (tenant_id, job_id, id, kind, scope_item_id, plan_quote_revision_id, plan_task_key,
        owner_kind, owner_name, needed_by, source, choice_question, choice_may_change_price, delivery_item, crew_need,
        access_need)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'builder_logged',$11,$12,$13,$14,$15)
      ON CONFLICT DO NOTHING
    `, [tenantId, jobId, command.commandId, d.kind, command.scopeItemId, command.planTask?.quoteRevisionId ?? null,
      command.planTask?.taskKey ?? null, o.kind, "name" in o ? o.name : null, command.neededBy,
      d.kind === "customer_choice" ? d.question : null, d.kind === "customer_choice" ? d.mayChangePrice : null,
      d.kind === "merchant_delivery_date" ? d.item : null, d.kind === "crew_availability" ? d.need : null,
      d.kind === "access" ? d.need : null]);
    const { rows: [saved] } = await client.query<ChangeRow>(`
      INSERT INTO app.v2_open_fact_change (tenant_id, job_id, fact_id, expected_version, command_id, request_digest,
        action, status, actor_membership_id)
      VALUES ($1,$2,$3,0,$3,$4,'log','open',$5)
      ON CONFLICT DO NOTHING RETURNING ${changeColumns}
    `, [tenantId, jobId, command.commandId, digest, actorId]);
    return saved;
  }

  private async change(client: PoolClient, tenantId: string, jobId: string,
    command: Exclude<ParsedCommand, { action: "log" }>, actorId: string, digest: string) {
    const { rows: [fact] } = await client.query<{ kind: OpenFactKind; version: number; status: OpenFactStatus }>(`
      SELECT f.kind, c.expected_version + 1 AS version, c.status
      FROM app.v2_open_fact f
      CROSS JOIN LATERAL (
        SELECT expected_version, status FROM app.v2_open_fact_change
        WHERE (tenant_id, job_id, fact_id) = (f.tenant_id, f.job_id, f.id)
        ORDER BY expected_version DESC LIMIT 1
      ) c
      WHERE (f.tenant_id, f.job_id, f.id) = ($1, $2, $3)
    `, [tenantId, jobId, command.factId]);
    if (!fact) throw new PracticeAccessError("NOT_FOUND");
    if (fact.version !== command.expectedVersion) throw new OpenFactError("OPEN_FACT_VERSION_CONFLICT");
    if (fact.status === "answered" || fact.status === "cancelled") throw new OpenFactError("OPEN_FACT_CLOSED");
    if (command.action === "mark_out_of_date" && fact.status === "out_of_date") throw new OpenFactError("OPEN_FACT_CLOSED");
    const a = command.action === "answer" ? command.answer : null;
    if (a && a.kind !== fact.kind) throw new OpenFactError("OPEN_FACT_KIND_MISMATCH");
    const status = { answer: "answered", cancel: "cancelled", mark_out_of_date: "out_of_date" }[command.action];
    const { rows: [saved] } = await client.query<ChangeRow>(`
      INSERT INTO app.v2_open_fact_change (tenant_id, job_id, fact_id, expected_version, command_id, request_digest,
        action, status, choice_answer, answer_may_change_price, delivery_date, crew_available, access_answer,
        actor_membership_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT DO NOTHING RETURNING ${changeColumns}
    `, [tenantId, jobId, command.factId, command.expectedVersion, command.commandId, digest, command.action, status,
      a?.kind === "customer_choice" ? a.choice : null, a?.kind === "customer_choice" ? a.mayChangePrice : null,
      a?.kind === "merchant_delivery_date" ? a.deliveryDate : null, a?.kind === "crew_availability" ? a.available : null,
      a?.kind === "access" ? a.arrangement : null, actorId]);
    return saved;
  }
}
