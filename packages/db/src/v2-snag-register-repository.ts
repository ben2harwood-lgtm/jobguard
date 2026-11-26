// V2-G1 (Q53): the snag register beside main's QW-4 snag list. A crew owner, which person fixed and
// checked each snag (never the same person), and "agreed to leave open at handover".
// Main's events are written by main's own routine, app.snag_record_event, in the same transaction.
import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { SnagError, snagErrorCodes, snagEventKind, type SnagErrorCode } from "@jobguard/core";
import { appendAuditBatch } from "./audit.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
import { WatchdogError } from "./watchdog.js";

const uuid = z.guid({ error: "Invalid uuid" });
const person = z.discriminatedUnion("kind", [z.strictObject({ kind: z.literal("builder") }),
  z.strictObject({ kind: z.literal("crew"), crewId: uuid })]);
export const snagOwnerCommandV1 = z.strictObject({ version: z.literal("v2-snag-owner-command.v1"), commandId: uuid, snagId: uuid,
  crewId: uuid.nullable() });
export const snagRegisterEventCommandV1 = z.strictObject({ version: z.literal("v2-snag-event-command.v1"), commandId: uuid,
  snagId: uuid, action: z.enum(["mark_fixed", "mark_checked", "reopen"]), person });
export const snagAgreedCommandV1 = z.strictObject({ version: z.literal("v2-snag-agreed-command.v1"), commandId: uuid, snagId: uuid,
  agreed: z.boolean(), note: z.string().trim().max(200).nullable() }).refine(command => !command.agreed || !!command.note);
export type SnagRegisterPerson = z.infer<typeof person>;

export class SnagRegisterError extends Error {
  constructor(readonly code: "V2_SNAG_INVALID_COMMAND" | "V2_SNAG_CHECKER_IS_FIXER" | "V2_SNAG_COMMAND_CONFLICT" |
    "V2_SNAG_CREW_UNAVAILABLE" | "V2_SNAG_NOT_FOUND" | "V2_SNAG_NOTHING_OUTSTANDING") { super(code); }
}

export type SnagRegisterPersonView = { kind: "builder" } | { kind: "crew"; crewId: string; name: string; trade: string } | { kind: "unknown" };
export type SnagRegisterEntry = {
  owner: { crewId: string; name: string; trade: string } | null;
  people: Record<number, SnagRegisterPersonView>;
  agreed: { note: string; recordedAt: string } | null;
};

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const pgCode = (error: unknown) => (error as { code?: string })?.code;
const pgMessage = (error: unknown) => (error instanceof Error ? error.message : "");

/** Main's routine refusals as main's typed codes, and this record's own. */
function refusal(error: unknown): never {
  const message = pgMessage(error);
  if (message === "V2_SNAG_CHECKER_IS_FIXER") throw new SnagRegisterError("V2_SNAG_CHECKER_IS_FIXER");
  if (message === "V2_SNAG_FIRM_MISMATCH" || message === "V2_SNAG_EVENT_MISMATCH" || pgCode(error) === "23503")
    throw new SnagRegisterError("V2_SNAG_CREW_UNAVAILABLE");
  if ((snagErrorCodes as readonly string[]).includes(message)) throw new SnagError(message as SnagErrorCode);
  if (message === "SNAG_INVALID") throw new SnagError("INVALID_SNAG_INPUT");
  if (message === "IDEMPOTENCY_CONFLICT") throw new SnagError("SNAG_COMMAND_CONFLICT");
  if (message === "JOB_NOT_LIVE") throw new WatchdogError("JOB_NOT_LIVE");
  if (message === "JOB_NOT_FOUND") throw new SnagError("SNAG_NOT_FOUND");
  throw error;
}

/** Use a pool from `practiceMaterialPool`, as `SnagRepository` does, so main's routine can check the session owns the job. */
export class SnagRegisterRepository {
  constructor(private readonly pool: Pool) {}

  private async crew(client: PoolClient, crewId: string) {
    const { rows: [row] } = await client.query<{ revision: number }>(`SELECT revision FROM app.v2_crew_contact
      WHERE crew_id = $1 AND firm_key = app.current_firm_profile_key() ORDER BY revision DESC LIMIT 1`, [crewId]);
    if (!row) throw new SnagRegisterError("V2_SNAG_CREW_UNAVAILABLE");
    return row.revision;
  }

  private async snag(client: PoolClient, tenantId: string, jobId: string, snagId: string) {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 2042))", [`snag:${tenantId}:${snagId}`]);
    const { rows: [row] } = await client.query<{ id: string }>("SELECT id FROM app.snag WHERE (tenant_id, job_id, id) = ($1, $2, $3)",
      [tenantId, jobId, snagId]);
    if (!row) throw new SnagRegisterError("V2_SNAG_NOT_FOUND");
  }

  /** One command identity across all three register records: a reused id for another kind of change is a conflict. */
  private async claim(client: PoolClient, tenantId: string, commandId: string, kind: "owner" | "event" | "agreed") {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1, 2042))", [`snag_command:${tenantId}:${commandId}`]);
    const { rows } = await client.query<{ kind: string }>(`SELECT 'owner' AS kind FROM app.v2_snag_owner WHERE (tenant_id, command_id) = ($1, $2)
      UNION ALL SELECT 'event' FROM app.v2_snag_event_person WHERE (tenant_id, command_id) = ($1, $2)
      UNION ALL SELECT 'agreed' FROM app.v2_snag_agreed WHERE (tenant_id, command_id) = ($1, $2)`, [tenantId, commandId]);
    if (rows.some(row => row.kind !== kind)) throw new SnagRegisterError("V2_SNAG_COMMAND_CONFLICT");
  }

  /** Owner and agreed changes follow main's snag commands: live jobs only. */
  private async live(client: PoolClient, jobId: string) {
    await client.query("SELECT app.require_watchdog_live($1::uuid)", [jobId]);
  }

  private audit(database: Parameters<typeof appendAuditBatch>[0], actor: string, eventType: string, jobId: string,
    references: Record<string, string>, request: string) {
    return appendAuditBatch(database, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${actor}`, eventType,
      subjectType: "job", subjectRef: jobId, payload: { references, hashes: { request }, classifications: { action: "operational" } } }]);
  }

  async setOwner(context: VerifiedTenantContext, jobId: string, actor: string, input: unknown) {
    const parsed = snagOwnerCommandV1.safeParse(input);
    if (!parsed.success) throw new SnagRegisterError("V2_SNAG_INVALID_COMMAND");
    const command = parsed.data, digest = sha256(JSON.stringify(command));
    return withTenant(this.pool, context, async database => {
      const { $client } = database;
      await this.claim($client, context.tenantId, command.commandId, "owner");
      await this.snag($client, context.tenantId, jobId, command.snagId);
      const { rows: [prior] } = await $client.query<{ snagId: string; crewId: string | null }>(`SELECT snag_id AS "snagId", crew_id AS "crewId"
        FROM app.v2_snag_owner WHERE (tenant_id, command_id) = ($1, $2)`, [context.tenantId, command.commandId]);
      if (prior) {
        if (prior.snagId !== command.snagId || prior.crewId !== command.crewId) throw new SnagRegisterError("V2_SNAG_COMMAND_CONFLICT");
        return;
      }
      await this.live($client, jobId);
      const revision = command.crewId ? await this.crew($client, command.crewId) : null;
      await $client.query(`INSERT INTO app.v2_snag_owner (tenant_id, job_id, snag_id, sequence, crew_id, crew_revision, firm_key, command_id,
        actor_membership_id) SELECT $1, $2, $3, coalesce(max(sequence), 0) + 1, $4, $5, app.current_firm_profile_key(), $6, $7
        FROM app.v2_snag_owner WHERE (tenant_id, snag_id) = ($1, $3)`,
      [context.tenantId, jobId, command.snagId, command.crewId, revision, command.commandId, actor]);
      await this.audit(database, actor, "v2.snag.owner_set", jobId, { commandId: command.commandId, snagId: command.snagId,
        ...(command.crewId && { crewId: command.crewId }) }, digest);
    }).catch(refusal);
  }

  /** One transaction: main's own event routine, then which person did it. A refused person rolls the event back. */
  async recordEvent(context: VerifiedTenantContext, jobId: string, actor: string, input: unknown) {
    const parsed = snagRegisterEventCommandV1.safeParse(input);
    if (!parsed.success) throw new SnagRegisterError("V2_SNAG_INVALID_COMMAND");
    const command = parsed.data, digest = sha256(JSON.stringify(command));
    return withTenant(this.pool, context, async database => {
      const { $client } = database;
      await this.claim($client, context.tenantId, command.commandId, "event");
      await this.snag($client, context.tenantId, jobId, command.snagId);
      const result = (await $client.query<{ result: { snagId: string; sequence: number; kind: string } }>(
        "SELECT app.snag_record_event($1, $2, $3, $4) result", [jobId, command.commandId, command.snagId, snagEventKind[command.action]])).rows[0]!.result;
      const crewId = command.person.kind === "crew" ? command.person.crewId : null;
      const { rows: [prior] } = await $client.query<{ kind: string; crewId: string | null; commandId: string }>(`SELECT person_kind AS kind,
        crew_id AS "crewId", command_id AS "commandId" FROM app.v2_snag_event_person WHERE (tenant_id, snag_id, event_sequence) = ($1, $2, $3)`,
      [context.tenantId, command.snagId, result.sequence]);
      if (prior) {
        if (prior.commandId !== command.commandId || prior.kind !== command.person.kind || prior.crewId !== crewId)
          throw new SnagRegisterError("V2_SNAG_COMMAND_CONFLICT");
        return result;
      }
      const revision = crewId ? await this.crew($client, crewId) : null;
      await $client.query(`INSERT INTO app.v2_snag_event_person (tenant_id, job_id, snag_id, event_sequence, person_kind, crew_id, crew_revision,
        firm_key, command_id) VALUES ($1, $2, $3, $4, $5, $6, $7, app.current_firm_profile_key(), $8)`,
      [context.tenantId, jobId, command.snagId, result.sequence, command.person.kind, crewId, revision, command.commandId]);
      await this.audit(database, actor, "v2.snag.event_person", jobId, { commandId: command.commandId, snagId: command.snagId,
        sequence: String(result.sequence), kind: result.kind, person: command.person.kind, ...(crewId && { crewId }) }, digest);
      return result;
    }).catch(refusal);
  }

  async setAgreed(context: VerifiedTenantContext, jobId: string, actor: string, input: unknown) {
    const parsed = snagAgreedCommandV1.safeParse(input);
    if (!parsed.success) throw new SnagRegisterError("V2_SNAG_INVALID_COMMAND");
    const command = { ...parsed.data, note: parsed.data.agreed ? parsed.data.note : null }, digest = sha256(JSON.stringify(command));
    return withTenant(this.pool, context, async database => {
      const { $client } = database;
      await this.claim($client, context.tenantId, command.commandId, "agreed");
      await this.snag($client, context.tenantId, jobId, command.snagId);
      const { rows: [prior] } = await $client.query<{ digest: boolean }>(`SELECT (snag_id, agreed, note) IS NOT DISTINCT FROM ($3::uuid, $4::boolean, $5::text) AS digest
        FROM app.v2_snag_agreed WHERE (tenant_id, command_id) = ($1, $2)`, [context.tenantId, command.commandId, command.snagId, command.agreed, command.note]);
      if (prior) { if (!prior.digest) throw new SnagRegisterError("V2_SNAG_COMMAND_CONFLICT"); return; }
      await this.live($client, jobId);
      const { rows: [last] } = await $client.query<{ kind: string }>(`SELECT kind FROM app.snag_event WHERE (tenant_id, snag_id) = ($1, $2)
        ORDER BY sequence DESC LIMIT 1`, [context.tenantId, command.snagId]);
      if (command.agreed && last?.kind === "checked") throw new SnagRegisterError("V2_SNAG_NOTHING_OUTSTANDING");
      await $client.query(`INSERT INTO app.v2_snag_agreed (tenant_id, job_id, snag_id, sequence, agreed, note, command_id, actor_membership_id)
        SELECT $1, $2, $3, coalesce(max(sequence), 0) + 1, $4, $5, $6, $7 FROM app.v2_snag_agreed WHERE (tenant_id, snag_id) = ($1, $3)`,
      [context.tenantId, jobId, command.snagId, command.agreed, command.note, command.commandId, actor]);
      await this.audit(database, actor, "v2.snag.agreed_set", jobId, { commandId: command.commandId, snagId: command.snagId,
        agreed: String(command.agreed) }, digest);
    }).catch(refusal);
  }

  /** The firm's crew records, newest revision of each, for the owner and person pickers. */
  async crewList(context: VerifiedTenantContext) {
    return withTenant(this.pool, context, async ({ $client }) => (await $client.query<{ crewId: string; name: string; trade: string }>(`
      SELECT DISTINCT ON (crew_id) crew_id AS "crewId", display_name AS name, trade FROM app.v2_crew_contact
      WHERE firm_key = app.current_firm_profile_key() ORDER BY crew_id, revision DESC`)).rows.sort((a, b) => a.name.localeCompare(b.name)));
  }

  /** Per snag: the current crew owner, the person on each event, and the current agreed mark. */
  async read(context: VerifiedTenantContext, jobId: string): Promise<Record<string, SnagRegisterEntry>> {
    return withTenant(this.pool, context, async ({ $client }) => {
      const crew = `jsonb_build_object('kind', 'crew', 'crewId', c.crew_id, 'name', c.display_name, 'trade', c.trade)`;
      const { rows } = await $client.query<{ snagId: string; owner: SnagRegisterEntry["owner"] & { kind?: string } | null;
        people: { sequence: number; person: SnagRegisterPersonView }[]; agreed: SnagRegisterEntry["agreed"] }>(`
        SELECT s.id AS "snagId",
          (SELECT CASE WHEN o.crew_id IS NULL THEN NULL ELSE ${crew} END FROM app.v2_snag_owner o
            LEFT JOIN app.v2_crew_contact c ON (c.tenant_id, c.firm_key, c.crew_id, c.revision) = (o.tenant_id, o.firm_key, o.crew_id, o.crew_revision)
            WHERE (o.tenant_id, o.snag_id) = (s.tenant_id, s.id) ORDER BY o.sequence DESC LIMIT 1) AS owner,
          coalesce((SELECT jsonb_agg(jsonb_build_object('sequence', e.sequence, 'person', CASE WHEN p.snag_id IS NULL THEN jsonb_build_object('kind', 'unknown')
              WHEN p.person_kind = 'builder' THEN jsonb_build_object('kind', 'builder') ELSE ${crew} END) ORDER BY e.sequence)
            FROM app.snag_event e LEFT JOIN app.v2_snag_event_person p ON (p.tenant_id, p.snag_id, p.event_sequence) = (e.tenant_id, e.snag_id, e.sequence)
            LEFT JOIN app.v2_crew_contact c ON (c.tenant_id, c.firm_key, c.crew_id, c.revision) = (p.tenant_id, p.firm_key, p.crew_id, p.crew_revision)
            WHERE (e.tenant_id, e.snag_id) = (s.tenant_id, s.id)), '[]') AS people,
          (SELECT CASE WHEN a.agreed THEN jsonb_build_object('note', a.note, 'recordedAt', a.recorded_at) END FROM app.v2_snag_agreed a
            WHERE (a.tenant_id, a.snag_id) = (s.tenant_id, s.id) ORDER BY a.sequence DESC LIMIT 1) AS agreed
        FROM app.snag s WHERE (s.tenant_id, s.job_id) = ($1, $2)`, [context.tenantId, jobId]);
      return Object.fromEntries(rows.map(row => {
        const owner = row.owner ? { crewId: row.owner.crewId, name: row.owner.name, trade: row.owner.trade } : null;
        return [row.snagId, { owner, people: Object.fromEntries(row.people.map(entry => [entry.sequence, entry.person])), agreed: row.agreed }];
      }));
    });
  }
}
