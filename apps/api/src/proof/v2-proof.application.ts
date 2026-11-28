import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import {
  appendAuditBatch, DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, EvidenceError, EvidenceService, listConfirmedPracticeScopes,
  ProofApplicationRecords, ProofCommandError, ProofCommandService, readV2JobProofStatement, requireActiveActor,
  v2ProofEditor, WatchdogError, withTenant, type TenantTransaction,
} from "@jobguard/db";
import { PracticeAccess } from "../practice-access.js";
import { proofCommandV1, proofQueryV1 } from "./contracts.js";
import { DatabaseSyntheticStorage, finalizeFailure, generatePracticePng, ProofApplicationError } from "./proof.application.js";

/** The answer on V2 when the builder says the job has no electrical work (Q81 option A). */
export const V2_PROOF_STATEMENT_REFUSED = "On the practice V2 stack, record an electrical certificate photo instead.";

export class V2ProofError extends Error {
  constructor(readonly code: "V2_PROOF_STATEMENT_UNAVAILABLE" | "V2_PROOF_ACTION_UNAVAILABLE") {
    super(code === "V2_PROOF_STATEMENT_UNAVAILABLE" ? V2_PROOF_STATEMENT_REFUSED : "Not on the practice V2 stack yet.");
  }
}

type Command = z.infer<typeof proofCommandV1>;
type WriteCommand = Extract<Command, { action: "select_generated" | "finalize" | "complete" }>;
type Spec = { commandId: string; jobId: string; action: WriteCommand["action"]; requestHash: string };

/**
 * V2-AUTH-1 (Q81): the job proof read, progress photo and site-complete commands for a linked V2
 * builder. Main's ProofApplication is unchanged; on the local V2 stack the proof route uses this
 * instead, because main's requirement read (0734) refuses a linked session by design.
 *
 * - The read is migration 2089's V2 mirror of 0734's job_proof_requirement.
 * - Each write has one command boundary here. The builder's real membership is resolved from their
 *   verified linked credential and bound firm (app.v2_work_plan_editor), and it is checked again inside
 *   the transaction that writes, so a revoked or expired session commits nothing. A replay re-checks
 *   it, in the transaction that reads the earlier receipt, before that receipt is returned.
 * - Each write appends a `v2.proof.*` audit event naming that real membership. Main's proof services
 *   still require the practice tenant's own member, so they are given the shared practice membership,
 *   as everywhere else on the practice stack.
 * - "No electrical work" can't be answered here: main's statement writer runs only on the demo
 *   database, so V2 refuses it and asks for an electrical certificate photo.
 */
export class V2ProofApplication {
  private readonly access: PracticeAccess;
  private readonly storage: DatabaseSyntheticStorage;
  private readonly evidence: EvidenceService;
  private readonly commands: ProofCommandService;
  private readonly records: ProofApplicationRecords;

  constructor(private readonly pool: Pool, private readonly sessionId?: string) {
    this.access = new PracticeAccess(pool, sessionId);
    this.storage = new DatabaseSyntheticStorage(pool, sessionId);
    this.evidence = new EvidenceService(pool, this.storage);
    this.commands = new ProofCommandService(pool, this.storage);
    this.records = new ProofApplicationRecords(pool);
  }

  async get(jobIdRaw: unknown) {
    const practice = await this.access.job(jobIdRaw);
    const parsed = proofQueryV1.safeParse({ jobId: jobIdRaw });
    if (!parsed.success) throw new ProofApplicationError("INVALID_COMMAND");
    return withTenant(this.pool, practice.context, db => this.project(db, parsed.data.jobId));
  }

  async command(jobId: string, raw: unknown) {
    const practice = await this.access.job(jobId);
    const parsed = proofCommandV1.safeParse(raw);
    if (!parsed.success || !proofQueryV1.safeParse({ jobId }).success) throw new ProofApplicationError("INVALID_COMMAND");
    const command = parsed.data;
    const editor = await withTenant(this.pool, practice.context, db => this.editor(db));
    if (command.action === "answer_statement") throw new V2ProofError("V2_PROOF_STATEMENT_UNAVAILABLE");
    if (command.action === "invalidate") throw new V2ProofError("V2_PROOF_ACTION_UNAVAILABLE");
    if (command.action === "finalize") await this.access.subject(jobId, "upload", command.uploadId);
    if (command.action === "complete") await this.access.subject(jobId, "evidence_or_upload", command.evidenceId);
    const spec: Spec = { commandId: command.commandId, jobId, action: command.action,
      requestHash: createHash("sha256").update(JSON.stringify({ jobId, ...command }, Object.keys({ jobId, ...command }).sort())).digest("hex") };

    const recorded = await this.replay(practice.context, editor, spec);
    if (recorded) return recorded.response as Awaited<ReturnType<V2ProofApplication["get"]>>;
    // As main: the answer is recorded in the transaction that completes the command, together with the
    // binding re-check and the audit event naming the real membership.
    const answered: { response?: unknown; recorded?: true } = {};
    const completing = async (db: TenantTransaction) => {
      await this.bound(db, editor);
      await this.audit(db, editor, spec);
      answered.response = await this.records.recordIn(db, DEMO_TENANT_ID, { ...spec, response: await this.project(db, jobId) });
      answered.recorded = true;
    };
    const response = await this.execute(jobId, command, practice, editor, completing).catch(error => { throw asApplicationError(error); });
    if (answered.recorded) return answered.response as Awaited<ReturnType<V2ProofApplication["get"]>>;
    // Only an earlier effect was replayed (no fresh write transaction): record the answer first-writer-wins.
    return withTenant(this.pool, practice.context, async db => {
      await this.bound(db, editor);
      return this.records.recordIn(db, DEMO_TENANT_ID, { ...spec, response });
    }).catch(error => { throw asApplicationError(error); }) as Promise<Awaited<ReturnType<V2ProofApplication["get"]>>>;
  }

  private linkedSession() {
    if (!this.sessionId) throw new ProofApplicationError("FORBIDDEN");
    return this.sessionId;
  }

  /** The signed-in builder's real membership, from their verified linked credential and bound firm. */
  private async editor(db: TenantTransaction) {
    const editor = await v2ProofEditor(db, this.linkedSession());
    if (!editor) throw new ProofApplicationError("FORBIDDEN");
    return editor;
  }

  /** The binding still holds, for the same member, inside this transaction. */
  private async bound(db: TenantTransaction, editor: string) {
    if (await this.editor(db) !== editor) throw new ProofApplicationError("FORBIDDEN");
  }

  /** The recorded first answer, read only after the binding is re-checked in the same transaction. */
  private replay(context: Awaited<ReturnType<PracticeAccess["job"]>>["context"], editor: string, spec: Spec) {
    return withTenant(this.pool, context, async db => {
      await this.bound(db, editor);
      await requireActiveActor(db, context.tenantId, DEMO_MEMBERSHIP_ID);
      const row = (await db.$client.query<{ job_id: string; action: string; request_hash: string; response: unknown }>(
        "SELECT job_id,action,request_hash,response FROM app.proof_application_response WHERE tenant_id=$1 AND command_id=$2",
        [context.tenantId, spec.commandId])).rows[0];
      if (!row) return null;
      if (row.job_id !== spec.jobId || row.action !== spec.action || row.request_hash.trim() !== spec.requestHash) throw new WatchdogError("IDEMPOTENCY_CONFLICT");
      return { response: row.response };
    });
  }

  private audit(db: TenantTransaction, editor: string, spec: Spec) {
    // Main's audit seal admits "completed" events only from its checked operations, so the stage event is "recorded".
    const eventType = spec.action === "select_generated" ? "v2.proof.upload_started" : spec.action === "finalize" ? "v2.proof.upload_finalized" : "v2.proof.stage_recorded";
    return appendAuditBatch(db, [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${editor}`, eventType,
      subjectType: "job", subjectRef: spec.jobId,
      payload: { references: { commandId: spec.commandId, jobId: spec.jobId, action: spec.action }, hashes: { request: spec.requestHash },
        classifications: { action: "operational" } } }]);
  }

  /** Main's proof view (ProofApplication.project), with the requirement read from the V2 mirror. */
  private async project(db: TenantTransaction, jobId: string) {
    const statement = await readV2JobProofStatement(db, this.linkedSession(), jobId).catch(proofReadFailure);
    const requiredType = statement.requiredEvidenceType, stage = statement.stage;
    const job = (await db.$client.query("SELECT 1 FROM app.job j WHERE j.tenant_id=$1 AND j.id=$2", [DEMO_TENANT_ID, jobId])).rows[0];
    if (!job) throw new ProofApplicationError("NOT_FOUND");
    const scope = (await listConfirmedPracticeScopes(db, DEMO_TENANT_ID, jobId, 1))[0];
    if (!scope) throw new ProofApplicationError("NOT_FOUND");
    const upload = (await db.$client.query<{ id: string; state: string; object_version_id: string; evidence_id: string | null }>(
      `SELECT u.id,u.state,COALESCE(u.object_version_id,s.object_version_id) object_version_id,e.id evidence_id FROM app.evidence_upload u
       LEFT JOIN app.synthetic_evidence_original s ON(s.tenant_id,s.upload_id)=(u.tenant_id,u.id)
       LEFT JOIN app.evidence_object e ON(e.tenant_id,e.upload_id)=(u.tenant_id,u.id)
       WHERE u.tenant_id=$1 AND u.job_id=$2 AND u.scope_item_id=$3 ORDER BY u.created_at DESC LIMIT 1`, [DEMO_TENANT_ID, jobId, scope.id])).rows[0];
    const completion = (await db.$client.query<{ id: string; review: boolean }>(
      `SELECT s.id,EXISTS(SELECT 1 FROM app.stage_review_event r WHERE (r.tenant_id,r.stage_completion_id)=(s.tenant_id,s.id)) review
       FROM app.stage_completion s WHERE s.tenant_id=$1 AND s.job_id=$2 AND s.scope_item_id=$3 AND s.stage=$4
       AND NOT EXISTS(SELECT 1 FROM app.stage_completion next WHERE (next.tenant_id,next.supersedes_completion_id)=(s.tenant_id,s.id))`,
      [DEMO_TENANT_ID, jobId, scope.id, stage])).rows[0];
    const decision = (await db.$client.query<{ id: string }>(
      `SELECT d.id FROM app.decision d JOIN app.job_finding f ON(f.tenant_id,f.decision_id)=(d.tenant_id,d.id)
       WHERE d.tenant_id=$1 AND f.job_id=$2 AND f.subject_ref=$3 ORDER BY f.created_at DESC LIMIT 1`,
      [DEMO_TENANT_ID, jobId, `${scope.id}:${requiredType}`])).rows[0];
    return { version: "practice-proof-view.v1", environment: "synthetic_demo", jobId, scopeItemId: scope.id, ...statement,
      requiredEvidenceType: requiredType,
      upload: upload ? { id: upload.id, state: upload.state, objectVersionId: upload.object_version_id, evidenceId: upload.evidence_id } : null,
      completion: completion ? { id: completion.id, reviewRequired: completion.review } : null,
      decisionId: decision?.id ?? null, mandatoryDecisionCount: completion && !completion.review ? 0 : 1, realExternalActions: 0 };
  }

  /** Main's three live-only writes (ProofApplication.execute), with the V2 read and the binding re-check. */
  private async execute(jobId: string, command: WriteCommand, practice: Awaited<ReturnType<PracticeAccess["job"]>>, editor: string,
    completing: (db: TenantTransaction) => Promise<void>) {
    if (command.action === "select_generated") {
      const current = await this.get(jobId);
      if (command.scopeItemId !== current.scopeItemId) throw new ProofApplicationError("NOT_FOUND");
      const bytes = generatePracticePng(command.fixture), digest = createHash("sha256").update(bytes).digest("hex");
      await this.evidence.beginUpload(practice.context, { id: command.commandId, jobId, scopeItemId: command.scopeItemId,
        expectedSha256: digest, contentType: "image/png", maximumBytes: bytes.length, retentionClass: "standard_evidence",
        expiresAt: new Date(Date.now() + 3600000) }, async (db, upload) => {
        // A replayed upload runs this too: the binding is checked in the transaction either way.
        await this.bound(db, editor);
        const version = await this.storage.putGenerated(upload.objectKey, bytes, digest);
        await db.$client.query(`INSERT INTO app.synthetic_evidence_original(tenant_id,upload_id,job_id,scope_item_id,object_key,object_version_id,environment,content_type,bytes)
          VALUES($1,$2,$3,$4,$5,$6,'synthetic_demo','image/png',$7) ON CONFLICT(tenant_id,upload_id) DO NOTHING`,
        [DEMO_TENANT_ID, upload.id, jobId, command.scopeItemId, upload.objectKey, version, bytes]);
        await completing(db);
      });
      return this.get(jobId);
    }
    if (command.action === "finalize") {
      const current = await this.get(jobId);
      try {
        await this.evidence.finalize(practice.context, { commandId: command.commandId, uploadId: command.uploadId,
          objectVersionId: command.objectVersionId, evidenceType: current.requiredEvidenceType ?? "electrical_certificate" }, completing);
      } catch (error) { throw error instanceof ProofApplicationError ? error : finalizeFailure(error); }
      return this.get(jobId);
    }
    const current = await this.get(jobId);
    if (command.scopeItemId !== current.scopeItemId) throw new ProofApplicationError("NOT_FOUND");
    try {
      await this.commands.complete(practice.context, { version: "proof.complete.v1", commandId: command.commandId,
        actorMembershipId: DEMO_MEMBERSHIP_ID, jobId, scopeItemId: command.scopeItemId, stage: current.stage ?? "electrical-stage",
        evidenceId: command.evidenceId, requiredEvidenceType: current.requiredEvidenceType ?? "electrical_certificate",
        decisionId: null, deriveDecision: true }, completing);
    } catch (error) {
      if (error instanceof ProofApplicationError) throw error;
      if (error instanceof ProofCommandError) {
        if (error.code === "COMMAND_CONFLICT") throw new WatchdogError("IDEMPOTENCY_CONFLICT");
        throw new ProofApplicationError(error.code === "FORBIDDEN" ? "FORBIDDEN" : "PROOF_INVALID");
      }
      throw error;
    }
    return this.get(jobId);
  }
}

function asApplicationError(error: unknown) {
  if ((error instanceof ProofCommandError || error instanceof EvidenceError) && error.code === "COMMAND_CONFLICT") return new WatchdogError("IDEMPOTENCY_CONFLICT");
  if (error instanceof ProofCommandError && error.code === "FORBIDDEN") return new ProofApplicationError("FORBIDDEN");
  return error;
}

/** The mirror refuses with 42501 and NOT_FOUND or FORBIDDEN, as 0734 does; answer those as the route's own codes. */
function proofReadFailure(error: unknown): never {
  const failure = error as { code?: string; message?: string };
  if (failure?.code === "42501" && (failure.message === "NOT_FOUND" || failure.message === "FORBIDDEN")) throw new ProofApplicationError(failure.message);
  throw error;
}
