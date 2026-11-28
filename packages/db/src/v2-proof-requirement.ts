import { createHash } from "node:crypto";
import { jobProofStatementViewSchema, JobProofStatementError, type JobProofStatementView } from "./job-proof-statement.js";
import type { TenantTransaction } from "./tenant-context.js";

/**
 * V2-AUTH-1 (Q81, migration 2089): the proof requirement for a linked V2 builder. Main's
 * readJobProofStatement goes through 0734's job_proof_requirement, which refuses a linked session by
 * design (lp6). This reads the V2 mirror instead, which checks the linked credential, the bound
 * firm and the firm's ownership of the job, and then returns exactly what 0734 would. The result is
 * checked the way readJobProofStatement checks main's.
 */
export async function readV2JobProofStatement(db: TenantTransaction, sessionId: string, jobId: string,
  revisionId?: string): Promise<JobProofStatementView> {
  const digest = createHash("sha256").update(sessionId).digest("hex");
  const result = (await db.$client.query<{ result: unknown }>("SELECT app.v2_job_proof_requirement($1,$2,$3) result",
    [digest, jobId, revisionId ?? null])).rows[0]?.result;
  const parsed = jobProofStatementViewSchema.safeParse(result);
  if (!parsed.success) throw new JobProofStatementError("PROOF_SCHEMA_INCONSISTENT");
  const view = parsed.data, no = view.statement?.includesElectricalWork === false;
  if (view.requiredEvidenceType !== (no ? "completion_photo" : "electrical_certificate") ||
    view.stage !== (no ? "completion-photo-stage" : "electrical-stage")) throw new JobProofStatementError("PROOF_SCHEMA_INCONSISTENT");
  return view;
}

/** The signed-in linked builder's real membership, from their verified credential and bound firm, or null. */
export async function v2ProofEditor(db: TenantTransaction, sessionId: string): Promise<string | null> {
  const digest = createHash("sha256").update(sessionId).digest("hex");
  const { rows: [row] } = await db.$client.query<{ id: string | null }>("SELECT app.v2_work_plan_editor($1) AS id", [digest]);
  return row?.id ?? null;
}
