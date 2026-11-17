import type { Pool } from "pg";
import { ProofCommandError, requireActiveActor } from "./proof-repository.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";

/** The three live-only proof actions the application answers, and the kind of watchdog command whose claimed identity each answer is bound to. */
export type ProofApplicationAction = "select_generated" | "finalize" | "complete";
const COMMAND_TYPE: Record<ProofApplicationAction, string> = { select_generated: "evidence.begin_upload", finalize: "evidence.finalize", complete: "proof.complete" };

export interface ProofApplicationCommandRecord { commandId: string; jobId: string; action: ProofApplicationAction; requestHash: string }

/**
 * The application's answer to a live-only proof command is its projection of the job, which keeps changing as the job moves on. The
 * first answer is therefore recorded with the request it answered, and a replay of the command returns it as recorded, never a
 * projection rebuilt from today's state. The record is append-only, bound by foreign key to the command's claimed identity (so to its
 * job and kind), and the first writer wins. A replay still re-checks the actor's membership, active and unexpired, before anything
 * is returned. Recording is not a watchdog input: it adds no site fact, only the replay record of a command that already succeeded,
 * so it carries no live-job insert guard (a job that has just left live must still be able to give the first answer back).
 */
export class ProofApplicationRecords {
  constructor(private readonly pool: Pool) {}

  /** The recorded first response for this command id, or null when none is recorded. A record for another request, job or action is a conflict. */
  async replay(context: VerifiedTenantContext, spec: ProofApplicationCommandRecord & { actorMembershipId: string }): Promise<{ response: unknown } | null> {
    return withTenant(this.pool, context, async db => {
      await requireActiveActor(db, context.tenantId, spec.actorMembershipId);
      const row = (await db.$client.query<{ job_id: string; action: string; request_hash: string; response: unknown }>(
        "SELECT job_id,action,request_hash,response FROM app.proof_application_response WHERE tenant_id=$1 AND command_id=$2", [context.tenantId, spec.commandId])).rows[0];
      if (!row) return null;
      if (row.job_id !== spec.jobId || row.action !== spec.action || row.request_hash.trim() !== spec.requestHash) throw new ProofCommandError("COMMAND_CONFLICT");
      return { response: row.response };
    });
  }

  /** Records the first response (first writer wins) and returns the recorded one, whichever caller wrote it. */
  async record(context: VerifiedTenantContext, spec: ProofApplicationCommandRecord & { response: unknown }): Promise<unknown> {
    return withTenant(this.pool, context, db => this.recordIn(db, context.tenantId, spec));
  }

  /** As `record`, inside the caller's transaction: the transaction that completes the command, so the command and its first answer
   * commit together or not at all, and a retry can never find a completed command without the answer it gave. */
  async recordIn(db: TenantTransaction, tenantId: string, spec: ProofApplicationCommandRecord & { response: unknown }): Promise<unknown> {
    const inserted = await db.$client.query<{ response: unknown }>(
      `INSERT INTO app.proof_application_response(tenant_id,command_id,job_id,action,command_type,request_hash,response)VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)
       ON CONFLICT (tenant_id,command_id) DO NOTHING RETURNING response`,
      [tenantId, spec.commandId, spec.jobId, spec.action, COMMAND_TYPE[spec.action], spec.requestHash, JSON.stringify(spec.response)]);
    if (inserted.rows[0]) return inserted.rows[0].response;
    const existing = (await db.$client.query<{ job_id: string; action: string; request_hash: string; response: unknown }>(
      "SELECT job_id,action,request_hash,response FROM app.proof_application_response WHERE tenant_id=$1 AND command_id=$2", [tenantId, spec.commandId])).rows[0];
    if (!existing || existing.job_id !== spec.jobId || existing.action !== spec.action || existing.request_hash.trim() !== spec.requestHash) throw new ProofCommandError("COMMAND_CONFLICT");
    return existing.response;
  }
}
