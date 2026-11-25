import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { calculateNetLine, money, parsePoundsToPence, parseQuantity } from "@jobguard/core";
import { appendAuditBatch } from "./audit.js";
import { PracticeAccessError } from "./practice-session.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

// V2-E9: an allowance for each E1 customer-choice fact. A choice over its allowance drafts one
// variation for the difference through main's variation command (run by the API layer); nothing here
// prices, approves or commits a variation. Each version row is also the intent the API layer finishes.

const uuid = z.uuid().transform(value => value.toLowerCase());
const text = (max: number) => z.string().trim().min(1).max(max).refine(value => !value.includes("\0"));
const pounds = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/u);
// Same quantity grammar as variation-command.v1, and never zero.
const quantity = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/u).refine(value => !/^0(?:\.0+)?$/u.test(value));

const allowance = z.discriminatedUnion("basis", [
  z.strictObject({ basis: z.literal("per_unit"), amount: pounds, quantity, unit: text(40) }),
  z.strictObject({ basis: z.literal("total"), amount: pounds }),
]);

export const choiceAllowanceCommandV1 = z.strictObject({
  version: z.literal("v2-choice-allowance-command.v1"),
  commandId: uuid,
  factId: uuid,
  expectedVersion: z.number().int().min(0).max(2_147_483_646),
  allowance,
  decideBy: z.iso.date(),
  chosen: z.strictObject({ item: text(500), amount: pounds }).nullable(),
});
export type ChoiceAllowanceCommand = z.input<typeof choiceAllowanceCommandV1>;
type Parsed = z.output<typeof choiceAllowanceCommandV1>;

export type ChoiceStep = "current" | "proposed" | "priced";
export type ChoiceOutcome = "withdrawn" | "kept_agreed";

export type ChoiceAllowanceVersion = {
  factId: string; version: number; commandId: string; basis: "per_unit" | "total"; allowancePence: number;
  quantity: string; unit: string; decideBy: string; chosenItem: string | null; chosenPence: number | null;
  withdrawVariationId: string | null; rejectionId: string | null; rejectionReason: "superseded_by_choice_change" | null;
  draftKind: "new" | "carried" | null; proposalId: string | null; revisionId: string | null; excessRatePence: number | null;
  actorMembershipId: string; recordedAt: Date; chosenLate: boolean;
  steps: { step: ChoiceStep; outcome: ChoiceOutcome | null }[];
};

export type ChoiceAllowanceFact = {
  factId: string; question: string; neededBy: string; factStatus: string; overdue: boolean;
  versions: ChoiceAllowanceVersion[];
};

export type ChoiceAllowanceReceipt = { factId: string; version: number; commandId: string };

export class ChoiceAllowanceError extends Error {
  constructor(readonly code: "CHOICE_ALLOWANCE_INVALID_COMMAND" | "CHOICE_ALLOWANCE_EDITOR_REQUIRED" |
    "CHOICE_ALLOWANCE_NOT_A_CHOICE" | "CHOICE_ALLOWANCE_VERSION_CONFLICT" | "CHOICE_ALLOWANCE_COMMAND_CONFLICT" |
    "CHOICE_ALLOWANCE_PENDING" | "CHOICE_ALLOWANCE_STEP_INVALID") {
    super(code);
  }
}

/** RFC 4122 version-5 id: the same inputs always give the same id. */
export function choiceUuid(namespace: string, name: string): string {
  const bytes = createHash("sha1").update(Buffer.from(namespace.replaceAll("-", ""), "hex")).update(name).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 0x0f) | 0x50;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** A version is finished once it is current and any new draft it planned is priced (or an agreed extra kept it from drafting). */
export function choiceVersionFinished(version: ChoiceAllowanceVersion): boolean {
  const current = version.steps.find(step => step.step === "current");
  if (!current) return false;
  return version.draftKind !== "new" || current.outcome === "kept_agreed" || version.steps.some(step => step.step === "priced");
}

/** The open draft a finished version leaves behind, if any. */
function effectiveDraft(version: ChoiceAllowanceVersion | undefined) {
  if (!version || version.proposalId === null) return null;
  if (version.steps.find(step => step.step === "current")?.outcome === "kept_agreed") return null;
  return { proposalId: version.proposalId, revisionId: version.revisionId! };
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => [k, canonical(v)]));
  }
  return value;
}

const versionColumns = `fact_id AS "factId", version, command_id AS "commandId", request_digest AS "requestDigest", basis,
  allowance_pence::text AS "allowancePence", quantity, unit, decide_by::text AS "decideBy", chosen_item AS "chosenItem",
  chosen_pence::text AS "chosenPence", withdraw_variation_id AS "withdrawVariationId", rejection_id AS "rejectionId",
  rejection_reason AS "rejectionReason", draft_kind AS "draftKind", proposal_id AS "proposalId", revision_id AS "revisionId",
  excess_rate_pence::text AS "excessRatePence", actor_membership_id AS "actorMembershipId", recorded_at AS "recordedAt",
  (recorded_at AT TIME ZONE 'Europe/London')::date > decide_by AND chosen_item IS NOT NULL AS "chosenLate"`;

type VersionRow = Omit<ChoiceAllowanceVersion, "steps" | "allowancePence" | "chosenPence" | "excessRatePence"> & {
  requestDigest: string; allowancePence: string; chosenPence: string | null; excessRatePence: string | null;
};

const toVersion = (row: VersionRow, steps: ChoiceAllowanceVersion["steps"]): ChoiceAllowanceVersion => {
  const { requestDigest: _digest, ...rest } = row;
  return { ...rest, allowancePence: Number(row.allowancePence), chosenPence: row.chosenPence === null ? null : Number(row.chosenPence),
    excessRatePence: row.excessRatePence === null ? null : Number(row.excessRatePence), steps };
};

export class ChoiceAllowanceRepository {
  constructor(private readonly pool: Pool) {}

  read(context: VerifiedTenantContext, jobId: string): Promise<ChoiceAllowanceFact[]> {
    return withTenant(this.pool, context, async ({ $client }) => {
      const { rows: facts } = await $client.query<{ factId: string; question: string; neededBy: string; factStatus: string;
        overdue: boolean }>(`
        SELECT f.id AS "factId", f.choice_question AS question, f.needed_by::text AS "neededBy", c.status AS "factStatus", false AS overdue
        FROM app.v2_open_fact f
        CROSS JOIN LATERAL (SELECT status FROM app.v2_open_fact_change x
          WHERE (x.tenant_id, x.job_id, x.fact_id) = (f.tenant_id, f.job_id, f.id) ORDER BY expected_version DESC LIMIT 1) c
        WHERE (f.tenant_id, f.job_id) = ($1, $2) AND f.kind = 'customer_choice'
        ORDER BY f.needed_by, f.id
      `, [context.tenantId, jobId]);
      const { rows: versions } = await $client.query<VersionRow>(`
        SELECT ${versionColumns} FROM app.v2_choice_allowance WHERE (tenant_id, job_id) = ($1, $2) ORDER BY fact_id, version
      `, [context.tenantId, jobId]);
      const { rows: steps } = await $client.query<{ factId: string; version: number; step: ChoiceStep; outcome: ChoiceOutcome | null }>(`
        SELECT fact_id AS "factId", version, step, outcome FROM app.v2_choice_allowance_step
        WHERE (tenant_id, job_id) = ($1, $2) ORDER BY fact_id, version, array_position(ARRAY['current','proposed','priced'], step)
      `, [context.tenantId, jobId]);
      const { rows: [clock] } = await $client.query<{ today: string }>(
        "SELECT (clock_timestamp() AT TIME ZONE 'Europe/London')::date::text AS today");
      return facts.map(fact => {
        const own = versions.filter(row => row.factId === fact.factId).map(row => toVersion(row,
          steps.filter(step => step.factId === row.factId && step.version === row.version).map(({ step, outcome }) => ({ step, outcome }))));
        const latest = own.at(-1);
        // A choice still undecided past its decide-by date is late.
        return { ...fact, overdue: Boolean(latest && latest.chosenItem === null && clock!.today > latest.decideBy), versions: own };
      });
    });
  }

  /** Records a new version (the intent) and its one audit event. The API layer then finishes it. */
  async set(context: VerifiedTenantContext, jobId: string, sessionId: string, input: ChoiceAllowanceCommand): Promise<ChoiceAllowanceReceipt> {
    const parsed = choiceAllowanceCommandV1.safeParse(input);
    if (!parsed.success) throw new ChoiceAllowanceError("CHOICE_ALLOWANCE_INVALID_COMMAND");
    const command = parsed.data;
    const digest = createHash("sha256").update(JSON.stringify(canonical({ jobId, command }))).digest("hex");
    return withTenant(this.pool, context, async database => {
      const { $client } = database;
      const actor = await this.editor($client, sessionId);
      const prior = await this.replay($client, context.tenantId, jobId, command.commandId, actor, digest);
      if (prior) return prior;
      const { rows: [fact] } = await $client.query<{ kind: string }>(
        "SELECT kind FROM app.v2_open_fact WHERE (tenant_id, job_id, id) = ($1, $2, $3)", [context.tenantId, jobId, command.factId]);
      if (!fact) throw new PracticeAccessError("NOT_FOUND");
      if (fact.kind !== "customer_choice") throw new ChoiceAllowanceError("CHOICE_ALLOWANCE_NOT_A_CHOICE");
      // One writer per choice at a time; a racing twin waits here, then replays or meets a version conflict.
      await $client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [`v2-choice-allowance:${context.tenantId}:${jobId}:${command.factId}`]);
      const raced = await this.replay($client, context.tenantId, jobId, command.commandId, actor, digest);
      if (raced) return raced;

      const versions = await this.versions($client, context.tenantId, jobId, command.factId);
      const latest = versions.at(-1);
      if ((latest?.version ?? 0) !== command.expectedVersion) throw new ChoiceAllowanceError("CHOICE_ALLOWANCE_VERSION_CONFLICT");
      if (latest && !choiceVersionFinished(latest)) throw new ChoiceAllowanceError("CHOICE_ALLOWANCE_PENDING");

      const version = command.expectedVersion + 1;
      const per = command.allowance.basis === "per_unit" ? command.allowance : null;
      const row = {
        basis: command.allowance.basis, allowancePence: parsePoundsToPence(command.allowance.amount),
        quantity: per ? per.quantity : "1", unit: per ? per.unit : "item",
        chosenItem: command.chosen?.item ?? null, chosenPence: command.chosen ? parsePoundsToPence(command.chosen.amount) : null,
      };
      // Per unit, the draft is the rate difference times the quantity; for a total, the difference once.
      const excess = row.chosenPence === null ? 0 : row.chosenPence - row.allowancePence;
      // The draft's amount must fit main's money limit, checked with the same exact calculation main's revise uses,
      // before anything is recorded or withdrawn.
      if (excess > 0) {
        try { calculateNetLine(parseQuantity(row.quantity), money(excess)); }
        catch { throw new ChoiceAllowanceError("CHOICE_ALLOWANCE_INVALID_COMMAND"); }
      }
      const agreedBefore = versions.some(v => v.steps.some(step => step.outcome === "kept_agreed"));
      const draft = effectiveDraft(latest);
      let plan: { withdraw: string | null; draftKind: "new" | "carried" | null; proposalId: string | null; revisionId: string | null } =
        { withdraw: null, draftKind: null, proposalId: null, revisionId: null };
      if (agreedBefore) {
        // An earlier extra was approved and no longer matched: never draft on top of it; the screen warns instead.
      } else if (draft && excess > 0 && latest!.excessRatePence === excess && latest!.quantity === row.quantity &&
        latest!.unit === row.unit && latest!.chosenItem === row.chosenItem) {
        plan = { withdraw: null, draftKind: "carried", ...draft };
      } else {
        const proposalId = excess > 0 ? choiceUuid(context.tenantId, `${command.factId}:${version}:excess`) : null;
        plan = { withdraw: draft?.proposalId ?? null, draftKind: proposalId ? "new" : null, proposalId,
          revisionId: proposalId ? choiceUuid(proposalId, "price") : null };
      }
      const { rows: [saved] } = await $client.query<VersionRow>(`
        INSERT INTO app.v2_choice_allowance (tenant_id, job_id, fact_id, version, command_id, request_digest, basis,
          allowance_pence, quantity, unit, decide_by, chosen_item, chosen_pence, withdraw_variation_id, rejection_id,
          rejection_reason, draft_kind, proposal_id, revision_id, excess_rate_pence, actor_membership_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
        RETURNING ${versionColumns}
      `, [context.tenantId, jobId, command.factId, version, command.commandId, digest, row.basis, row.allowancePence,
        row.quantity, row.unit, command.decideBy, row.chosenItem, row.chosenPence, plan.withdraw,
        plan.withdraw ? choiceUuid(plan.withdraw, "superseded") : null, plan.withdraw ? "superseded_by_choice_change" : null,
        plan.draftKind, plan.proposalId, plan.revisionId, plan.proposalId ? excess : null, actor]);
      // References and hashes only: no question, item name or amount enters the chain.
      await appendAuditBatch(database, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${actor}`,
        eventType: "v2.choice_allowance.set", subjectType: "job", subjectRef: jobId,
        payload: { references: { commandId: command.commandId, factId: command.factId, choiceVersion: String(version),
          draft: plan.draftKind ?? "none", withdraws: plan.withdraw ?? "none" }, hashes: { request: digest },
          classifications: { action: "operational" } } }]);
      return { factId: saved!.factId, version: saved!.version, commandId: saved!.commandId };
    });
  }

  /** Records one finished step of a version with its one audit event; an exact repeat records nothing. */
  async step(context: VerifiedTenantContext, jobId: string, sessionId: string,
    input: { factId: string; version: number; step: ChoiceStep; outcome: ChoiceOutcome | null }): Promise<boolean> {
    if (input.step !== "current" && input.outcome !== null) throw new ChoiceAllowanceError("CHOICE_ALLOWANCE_STEP_INVALID");
    return withTenant(this.pool, context, async database => {
      const { $client } = database;
      const actor = await this.editor($client, sessionId);
      const { rows: [target] } = await $client.query<{ commandId: string; proposalId: string | null; withdraw: string | null;
        current: string | null; hasCurrent: boolean }>(`
        SELECT a.command_id AS "commandId", a.proposal_id AS "proposalId", a.withdraw_variation_id AS withdraw,
          (SELECT coalesce(outcome, '') FROM app.v2_choice_allowance_step s WHERE (s.tenant_id, s.job_id, s.fact_id, s.version, s.step)
            = (a.tenant_id, a.job_id, a.fact_id, a.version, 'current')) AS current,
          EXISTS (SELECT FROM app.v2_choice_allowance_step s WHERE (s.tenant_id, s.job_id, s.fact_id, s.version, s.step)
            = (a.tenant_id, a.job_id, a.fact_id, a.version, 'current')) AS "hasCurrent"
        FROM app.v2_choice_allowance a WHERE (a.tenant_id, a.job_id, a.fact_id, a.version) = ($1, $2, $3, $4)
      `, [context.tenantId, jobId, input.factId, input.version]);
      if (!target) throw new PracticeAccessError("NOT_FOUND");
      if (input.step === "current" && (input.outcome !== null) !== (target.withdraw !== null)) {
        throw new ChoiceAllowanceError("CHOICE_ALLOWANCE_STEP_INVALID");
      }
      if (input.step !== "current" && (!target.hasCurrent || target.proposalId === null || target.current === "kept_agreed")) {
        throw new ChoiceAllowanceError("CHOICE_ALLOWANCE_STEP_INVALID");
      }
      const { rows: [inserted] } = await $client.query<{ outcome: ChoiceOutcome | null }>(`
        INSERT INTO app.v2_choice_allowance_step (tenant_id, job_id, fact_id, version, step, outcome, actor_membership_id)
        SELECT $1, $2, $3, $4, $5, $6, $7
        WHERE $5 <> 'priced' OR EXISTS (SELECT FROM app.v2_choice_allowance_step s
          WHERE (s.tenant_id, s.job_id, s.fact_id, s.version, s.step) = ($1, $2, $3, $4, 'proposed'))
        ON CONFLICT DO NOTHING RETURNING outcome
      `, [context.tenantId, jobId, input.factId, input.version, input.step, input.outcome, actor]);
      if (!inserted) {
        const { rows: [existing] } = await $client.query<{ outcome: ChoiceOutcome | null }>(`
          SELECT outcome FROM app.v2_choice_allowance_step WHERE (tenant_id, job_id, fact_id, version, step) = ($1, $2, $3, $4, $5)
        `, [context.tenantId, jobId, input.factId, input.version, input.step]);
        if (!existing) throw new ChoiceAllowanceError("CHOICE_ALLOWANCE_STEP_INVALID");
        if (existing.outcome !== input.outcome) throw new ChoiceAllowanceError("CHOICE_ALLOWANCE_COMMAND_CONFLICT");
        return false;
      }
      await appendAuditBatch(database, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${actor}`,
        eventType: "v2.choice_allowance.step", subjectType: "job", subjectRef: jobId,
        payload: { references: { commandId: target.commandId, factId: input.factId, choiceVersion: String(input.version),
          step: input.step, outcome: input.outcome ?? "none",
          variationId: (input.step === "current" ? target.withdraw : target.proposalId) ?? "none" },
          classifications: { action: "operational" } } }]);
      return true;
    });
  }

  private async editor(client: PoolClient, sessionId: string) {
    const credential = createHash("sha256").update(sessionId).digest("hex");
    const { rows: [actor] } = await client.query<{ id: string | null }>("SELECT app.v2_work_plan_editor($1) AS id", [credential]);
    if (!actor?.id) throw new ChoiceAllowanceError("CHOICE_ALLOWANCE_EDITOR_REQUIRED");
    return actor.id;
  }

  private async replay(client: PoolClient, tenantId: string, jobId: string, commandId: string, actor: string, digest: string) {
    const { rows: [prior] } = await client.query<{ factId: string; version: number; commandId: string; requestDigest: string;
      actorMembershipId: string }>(`
      SELECT fact_id AS "factId", version, command_id AS "commandId", request_digest AS "requestDigest",
        actor_membership_id AS "actorMembershipId"
      FROM app.v2_choice_allowance WHERE (tenant_id, job_id, command_id) = ($1, $2, $3)
    `, [tenantId, jobId, commandId]);
    if (!prior) return null;
    if (prior.requestDigest !== digest || prior.actorMembershipId !== actor) throw new ChoiceAllowanceError("CHOICE_ALLOWANCE_COMMAND_CONFLICT");
    return { factId: prior.factId, version: prior.version, commandId: prior.commandId };
  }

  private async versions(client: PoolClient, tenantId: string, jobId: string, factId: string) {
    const { rows } = await client.query<VersionRow>(`
      SELECT ${versionColumns} FROM app.v2_choice_allowance WHERE (tenant_id, job_id, fact_id) = ($1, $2, $3) ORDER BY version
    `, [tenantId, jobId, factId]);
    const { rows: steps } = await client.query<{ version: number; step: ChoiceStep; outcome: ChoiceOutcome | null }>(`
      SELECT version, step, outcome FROM app.v2_choice_allowance_step WHERE (tenant_id, job_id, fact_id) = ($1, $2, $3)
    `, [tenantId, jobId, factId]);
    return rows.map(row => toVersion(row, steps.filter(step => step.version === row.version).map(({ step, outcome }) => ({ step, outcome }))));
  }
}

