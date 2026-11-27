import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { appendAuditBatch } from "./audit.js";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
import type { DiaryShareState } from "./v2-friday-update.js";

/** The builder's "Customer can see this" mark on one diary note. Main's diary rows are never touched. */
export const diaryShareCommandV1 = z.strictObject({ version: z.literal("v2-diary-share-command.v1"), commandId: z.uuid(),
  diaryEntryId: z.uuid(), shared: z.boolean() });
export type DiaryShareCommand = z.infer<typeof diaryShareCommandV1>;
export type DiaryShare = DiaryShareState & { sequence: number; commandId: string; recordedAt: string };
export class DiaryShareError extends Error {
  constructor(readonly code: "NOT_FOUND" | "DIARY_SHARE_COMMAND_CONFLICT" | "SYNTHETIC_MODE_REQUIRED") { super(code); }
}
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const columns = `diary_entry_id AS "diaryEntryId", shared, sequence, command_id AS "commandId", recorded_at::text AS "recordedAt"`;

export class DiaryShareRepository {
  constructor(private readonly pool: Pool) {}
  private mode() {
    if (process.env.JOBGUARD_LOCAL_V2 !== "1" || process.env.JOBGUARD_ENV !== "synthetic_demo") throw new DiaryShareError("SYNTHETIC_MODE_REQUIRED");
  }
  /** The latest mark per diary note on the job. */
  async read(context: VerifiedTenantContext, jobId: string): Promise<DiaryShare[]> {
    this.mode();
    return withTenant(this.pool, context, async db => (await db.$client.query<DiaryShare>(`SELECT DISTINCT ON (diary_entry_id) ${columns}
      FROM app.v2_diary_share WHERE (tenant_id,job_id)=($1,$2) ORDER BY diary_entry_id, sequence DESC`, [context.tenantId, jobId])).rows);
  }
  async set(context: VerifiedTenantContext, jobId: string, sessionId: string, raw: DiaryShareCommand): Promise<DiaryShare> {
    this.mode();
    const command = diaryShareCommandV1.parse(raw);
    try {
      return await withTenant(this.pool, context, async db => {
        const client = db.$client;
        const actor = (await client.query<{ id: string | null }>("SELECT app.v2_work_plan_editor($1) AS id",
          [createHash("sha256").update(sessionId).digest("hex")])).rows[0]?.id;
        if (!actor) throw new DiaryShareError("NOT_FOUND");
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`diary_share:${jobId}`]);
        const requestHash = hash({ jobId, actor, command });
        const replay = (await client.query<DiaryShare & { requestHash: string }>(`SELECT ${columns}, request_hash::text AS "requestHash"
          FROM app.v2_diary_share WHERE tenant_id=$1 AND command_id=$2`, [context.tenantId, command.commandId])).rows[0];
        if (replay) {
          if (replay.requestHash !== requestHash) throw new DiaryShareError("DIARY_SHARE_COMMAND_CONFLICT");
          const { requestHash: _requestHash, ...share } = replay;
          return share;
        }
        // The composite FK refuses a note from another job or firm.
        const share = (await client.query<DiaryShare>(`INSERT INTO app.v2_diary_share
          (tenant_id, job_id, diary_entry_id, sequence, shared, command_id, request_hash, actor_membership_id)
          SELECT $1,$2,$3,COALESCE(MAX(sequence),0)+1,$4,$5,$6,$7 FROM app.v2_diary_share
          WHERE (tenant_id,job_id,diary_entry_id)=($1,$2,$3) RETURNING ${columns}`,
        [context.tenantId, jobId, command.diaryEntryId, command.shared, command.commandId, requestHash, actor])).rows[0]!;
        // References only: the note's text never enters the audit trail.
        await appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${actor}`,
          eventType: "v2.diary_share.set", subjectType: "job", subjectRef: jobId,
          payload: { references: { commandId: command.commandId, diaryEntryId: command.diaryEntryId, shareSequence: String(share.sequence),
            shared: command.shared ? "yes" : "no" }, classifications: { action: "operational" } } }]);
        return share;
      });
    } catch (error) {
      if ((error as { code?: string }).code === "23503") throw new DiaryShareError("NOT_FOUND");
      throw error;
    }
  }
}
