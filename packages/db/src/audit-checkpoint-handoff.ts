import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { z } from "zod";
import { appendAuditBatch } from "./audit.js";
import { handoffAuditExportCheckpoint } from "./audit-export-repository.js";
import { SYNTHETIC_DATABASE_NAME } from "./demo-bootstrap.js";
import type { TenantTransaction } from "./tenant-context.js";

export type AuditCheckpointHandoffCode =
  | "AUDIT_CHECKPOINT_MODE_HELD" | "AUDIT_CHECKPOINT_TARGET_FORBIDDEN"
  | "AUDIT_CHECKPOINT_INVALID_INPUT" | "AUDIT_CHECKPOINT_TENANT_NOT_FOUND"
  | "AUDIT_CHECKPOINT_FORBIDDEN" | "AUDIT_CHECKPOINT_DISAGREEMENT" | "AUDIT_CHECKPOINT_UNAVAILABLE";
export class AuditCheckpointHandoffError extends Error {
  constructor(readonly code: AuditCheckpointHandoffCode, message: string = code) {
    super(message); this.name = "AuditCheckpointHandoffError";
  }
}
export interface AuditCheckpointHandoffResult {
  database: string;
  outcomes: Array<{ tenantId: string; outcome: "handed_off" | "unchanged" | "failed"; sequence: number | null; code?: AuditCheckpointHandoffCode }>;
}
const optionsV1 = z.object({ ownerUrl: z.string(), tenantId: z.string().uuid().optional(), operator: z.string().min(1).max(64).regex(/^[A-Za-z0-9._-]+$/u) }).strict();
function failureCode(error: unknown): AuditCheckpointHandoffCode {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  if (code === "42501") return "AUDIT_CHECKPOINT_FORBIDDEN";
  if (code === "23505" || code === "AUDIT_EXPORT_CHECKPOINT_REQUIRED") return "AUDIT_CHECKPOINT_DISAGREEMENT";
  return "AUDIT_CHECKPOINT_UNAVAILABLE";
}
type Head = { sequence: string; event_hash: string };
type Control = Head & { event_sequence: string | null; actual_hash: string | null };
async function handleTenant(client: PoolClient, tenantId: string, operator: string, sessionUser: string): Promise<AuditCheckpointHandoffResult["outcomes"][number]> {
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    await client.query("SET LOCAL ROLE jobguard_runtime");
    const head = (await client.query<Head>("SELECT sequence::text, event_hash FROM app.lock_audit_head()")).rows[0];
    await client.query("SET LOCAL ROLE jobguard_migration");
    const newest = (await client.query<Head>("SELECT sequence::text, event_hash FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence DESC LIMIT 1", [tenantId])).rows[0];
    const checkpoints = (await client.query<Control>(`SELECT c.sequence::text,c.event_hash,e.sequence::text event_sequence,e.event_hash actual_hash
      FROM audit_control.checkpoint c LEFT JOIN app.audit_event e ON (e.tenant_id,e.sequence)=(c.tenant_id,c.sequence)
      WHERE c.tenant_id=$1 ORDER BY c.sequence`, [tenantId])).rows;
    const handoffs = (await client.query<Control>(`SELECT h.sequence::text,h.event_hash,e.sequence::text event_sequence,e.event_hash actual_hash
      FROM app.audit_export_checkpoint h LEFT JOIN app.audit_event e ON (e.tenant_id,e.sequence)=(h.tenant_id,h.sequence)
      WHERE h.tenant_id=$1 ORDER BY h.sequence`, [tenantId])).rows;
    if (!head || !newest || head.sequence !== newest.sequence || head.event_hash !== newest.event_hash ||
      !Number.isSafeInteger(Number(head.sequence)) || Number(head.sequence) < 1 ||
      [...checkpoints, ...handoffs].some(c => c.event_sequence === null || c.event_hash !== c.actual_hash)) {
      await client.query("ROLLBACK");
      return { tenantId, outcome: "failed", sequence: null, code: "AUDIT_CHECKPOINT_DISAGREEMENT" };
    }
    if (handoffs.some(h => h.sequence === head.sequence && h.event_hash === head.event_hash)) {
      await client.query("ROLLBACK");
      return { tenantId, outcome: "unchanged", sequence: Number(head.sequence) };
    }
    await client.query("SET LOCAL ROLE jobguard_runtime");
    const [event] = await appendAuditBatch({ $client: client } as TenantTransaction, [{
      id: randomUUID(), version: "audit.v1", actorRef: "operations:audit-checkpoint-handoff",
      eventType: "audit.checkpoint.handed_off", subjectType: "audit-checkpoint", subjectRef: tenantId,
      payload: { references: { environment: "synthetic_demo", priorSequence: head.sequence, operator, sessionUser },
        hashes: { priorHead: head.event_hash }, classifications: { action: "security" } },
    }]);
    await client.query("SET LOCAL ROLE jobguard_migration");
    const checkpoint = (await client.query<{ recorded_at: Date }>(`INSERT INTO audit_control.checkpoint (tenant_id, sequence, event_hash)
      VALUES ($1, $2, $3) RETURNING recorded_at`, [tenantId, event!.sequence, event!.eventHash])).rows[0]!;
    await handoffAuditExportCheckpoint(client, { tenantId, sequence: event!.sequence, eventHash: event!.eventHash, recordedAt: checkpoint.recorded_at });
    await client.query("COMMIT");
    return { tenantId, outcome: "handed_off", sequence: event!.sequence };
  } catch (error) {
    await client.query("ROLLBACK");
    return { tenantId, outcome: "failed", sequence: null, code: failureCode(error) };
  }
}
/** Shell-only synthetic operator; its dedicated connection is destroyed on every exit. */
export async function runAuditCheckpointHandoff(options: { ownerUrl: string; tenantId?: string; operator: string }): Promise<AuditCheckpointHandoffResult> {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new AuditCheckpointHandoffError("AUDIT_CHECKPOINT_MODE_HELD");
  try {
    const url = new URL(options.ownerUrl);
    if (!/^postgres(?:ql)?:$/u.test(url.protocol) || url.pathname.slice(1) !== SYNTHETIC_DATABASE_NAME) throw new Error();
  } catch { throw new AuditCheckpointHandoffError("AUDIT_CHECKPOINT_TARGET_FORBIDDEN"); }
  const parsed = optionsV1.safeParse(options);
  if (!parsed.success) throw new AuditCheckpointHandoffError("AUDIT_CHECKPOINT_INVALID_INPUT");
  const pool = new Pool({ connectionString: options.ownerUrl, max: 1 });
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    const identity = (await client.query<{ database: string; sessionUser: string; owner: string; migrationMember: boolean; runtimeMember: boolean }>(`SELECT current_database() AS database,session_user AS "sessionUser",
      pg_get_userbyid(datdba) AS owner,pg_has_role(session_user,'jobguard_migration','MEMBER') AS "migrationMember",
      pg_has_role(session_user,'jobguard_runtime','MEMBER') AS "runtimeMember"
      FROM pg_database WHERE datname=current_database()`)).rows[0]!;
    if (identity.database !== SYNTHETIC_DATABASE_NAME) throw new AuditCheckpointHandoffError("AUDIT_CHECKPOINT_TARGET_FORBIDDEN");
    if (identity.sessionUser !== identity.owner || !identity.migrationMember || !identity.runtimeMember) {
      throw new AuditCheckpointHandoffError("AUDIT_CHECKPOINT_FORBIDDEN", `Connected role ${identity.sessionUser}; requires owner login ${identity.owner} acting as jobguard_migration`);
    }
    let tenants: string[];
    await client.query("BEGIN");
    try {
      await client.query("SET LOCAL ROLE jobguard_migration");
      tenants = (await client.query<{ tenant_id: string }>("SELECT tenant_id FROM audit_control.audit_head WHERE sequence > 0 ORDER BY tenant_id")).rows.map(r => r.tenant_id);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    if (options.tenantId) {
      const tenantId = options.tenantId.toLowerCase();
      if (!tenants.includes(tenantId)) throw new AuditCheckpointHandoffError("AUDIT_CHECKPOINT_TENANT_NOT_FOUND");
      tenants = [tenantId];
    }
    const outcomes: AuditCheckpointHandoffResult["outcomes"] = [];
    for (const tenantId of tenants) outcomes.push(await handleTenant(client, tenantId, options.operator, identity.sessionUser));
    return { database: identity.database, outcomes };
  } catch (error) {
    if (error instanceof AuditCheckpointHandoffError) throw error;
    throw new AuditCheckpointHandoffError(failureCode(error));
  } finally { client?.release(true); await pool.end(); }
}
