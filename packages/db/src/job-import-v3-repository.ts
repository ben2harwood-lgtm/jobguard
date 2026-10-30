import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { adoptJobV3, assertImportIntentV3, assertImportResultV3, importActionHashV3, jobPartiesImportV3, jobImportSourceV1, type AdoptJobV3 } from "../../core/dist/job-import-v3.js";
import { CommandError, UserCommandDispatcher, type CommandMutation, type ConsequentialCommand } from "./commands.js";
import { meterPlaceAdmissionHold } from "./meter-place-admission.js";
import { practiceOwnedJobsSql } from "./practice-session.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";
import { importFixtureV3, importTargetJobIdV3, importPublicRequestHashV3 } from "./job-import-v3-fixtures.js";
import { ImportPreAdoptionRepository, importedCatchCommand } from "./import-pre-adoption-repository.js";

const uuid = z.string().uuid().transform(v => v.toLowerCase());
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
export const importPreviewRequestV3 = z.object({ version: z.literal("job-import-preview.v3"), expectedBindingId: uuid,
  fixtureId: z.string().regex(/^[a-z0-9][a-z0-9.-]{0,99}$/u), lifecyclePoint: z.enum(["live", "invoiced"]) }).strict();
export class JobImportV3Error extends Error {
  constructor(readonly code: "FORBIDDEN" | "INVALID_IMPORT" | "REVISION_CONFLICT" | "IMPORT_HISTORY_ADAPTER_REQUIRED" | "METER_PLACE_SOURCE_HANDOFF_HELD" | "EXACT_IMPORT_AUTHORIZATION_MISMATCH" | "SYNTHETIC_MODE_REQUIRED" | "COMMAND_CONFLICT" | "IMPORT_ALREADY_ADOPTED" | "NOT_FOUND" | "CAPACITY_ADMISSION_UNAVAILABLE" | "METER_UPGRADE_REQUIRED" | "ATTRIBUTION_UNAVAILABLE" | "PLAN_LIMIT_REACHED") { super(code); this.name = "JobImportV3Error"; }
}
export const IMPORT_CATCH_HOLD_REASON = "The imported catch cannot be assessed until SV-6 attribution is connected. No catch, allocation or fee has been created.";
const admissionOutcome = z.object({ sourceHash: z.string().regex(/^[a-f0-9]{64}$/u), outcome: z.enum(["admitted", "grace_place", "track_review_due"]) }).strict();
const sharedPracticeTenant = "11111111-1111-4111-8111-111111111111";
function syntheticOnly(): void {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new JobImportV3Error("SYNTHETIC_MODE_REQUIRED");
}
/** Consume MON1-A's actual exported boundary. No oracle/precheck becomes a permit. */
function admissionUnavailable(): never {
  throw new JobImportV3Error(meterPlaceAdmissionHold.code);
}
async function owned(db: TenantTransaction, tenantId: string, digest: string, jobId: string, expectedActor?: string): Promise<string> {
  let principal: { membership_id: string } | undefined;
  try {
    principal = (await db.$client.query<{ membership_id: string }>(tenantId === sharedPracticeTenant
    ? "SELECT membership_id FROM app.authenticate_practice_session($1,$2)"
    : "SELECT app.ch5_import_actor($2,$1) membership_id", [digest, tenantId])).rows[0];
  } catch (error) {
    if (error instanceof Error && ["METER_FORBIDDEN", "FORBIDDEN"].includes(error.message)) throw new JobImportV3Error("FORBIDDEN");
    throw error;
  }
  if (!principal || (expectedActor !== undefined && uuid.parse(principal.membership_id) !== uuid.parse(expectedActor))) throw new JobImportV3Error("FORBIDDEN");
  const found = tenantId === sharedPracticeTenant
    ? await db.$client.query(`${practiceOwnedJobsSql()} SELECT id FROM practice_owned_job WHERE id=$2`, [tenantId, jobId, digest])
    : await db.$client.query(`SELECT j.id FROM app.job j JOIN app.membership m ON m.tenant_id=j.tenant_id
      WHERE j.tenant_id=$1 AND j.id=$2 AND j.practice_session_digest IS NULL AND m.id=$3 AND m.role='owner'
       AND m.revoked_at IS NULL AND (m.expires_at IS NULL OR m.expires_at>clock_timestamp())`, [tenantId, jobId, principal.membership_id]);
  if (!found.rowCount) throw new JobImportV3Error("FORBIDDEN");
  return uuid.parse(principal.membership_id);
}
async function snapshot(db: TenantTransaction, tenantId: string, digest: string, sourceJobId: string, raw: unknown, actor?: string) {
  // Fresh authorization precedes informative fixture/binding errors, including replay.
  const actorId = await owned(db, tenantId, digest, sourceJobId, actor);
  const parsed = importPreviewRequestV3.safeParse(raw);
  if (!parsed.success) throw new JobImportV3Error("INVALID_IMPORT");
  const request = parsed.data;
  const parties = (await db.$client.query<AdoptJobV3["parties"]>(`SELECT b.id AS "bindingId",b.customer_revision_id AS "customerRevisionId",
    b.site_revision_id AS "siteRevisionId",b.paying_party_revision_id AS "payingPartyRevisionId" FROM app.job_party_current c
    JOIN app.job_party_binding b ON (b.tenant_id,b.job_id,b.id)=(c.tenant_id,c.job_id,c.binding_id)
    WHERE c.tenant_id=$1 AND c.job_id=$2`, [tenantId, sourceJobId])).rows[0];
  if (!parties || uuid.parse(parties.bindingId) !== request.expectedBindingId) throw new JobImportV3Error("REVISION_CONFLICT");
  let value: AdoptJobV3;
  try { value = importFixtureV3(sourceJobId, parties, request.lifecyclePoint, request.fixtureId); }
  catch { throw new JobImportV3Error("INVALID_IMPORT"); }
  return { actorId, snapshot: value, previewHash: importActionHashV3(value) };
}
function previewIntent(input: ReturnType<typeof jobPartiesImportV3.parse>) {
  return { version: "job-import-preview.v3", expectedBindingId: input.expectedBindingId, fixtureId: input.fixtureId, lifecyclePoint: input.lifecyclePoint };
}

/** Synthetic company imports use atomic MON-1 admission; shared practice live imports stay unavailable. */
export class JobImportV3Repository {
  constructor(private readonly pool: Pool) {}
  async source(context: VerifiedTenantContext, digest: string, sourceJobId: string) {
    syntheticOnly(); digestSchema.parse(digest); sourceJobId = uuid.parse(sourceJobId);
    return withTenant(this.pool, context, async db => {
      await owned(db, context.tenantId, digest, sourceJobId);
      const row = (await db.$client.query<{ binding_id: string }>("SELECT binding_id FROM app.job_party_current WHERE tenant_id=$1 AND job_id=$2", [context.tenantId, sourceJobId])).rows[0];
      return jobImportSourceV1.parse({ version: "job-import-source.v1", bindingId: row?.binding_id ?? null });
    });
  }
  async preview(context: VerifiedTenantContext, digest: string, sourceJobId: string, request: unknown) {
    syntheticOnly(); digestSchema.parse(digest); sourceJobId = uuid.parse(sourceJobId);
    return withTenant(this.pool, context, async db => {
      const result = await snapshot(db, context.tenantId, digest, sourceJobId, request);
      return { version: "job-import-preview-result.v3" as const, snapshot: result.snapshot, previewHash: result.previewHash,
        availability: result.snapshot.lifecyclePoint === "live" ? (context.tenantId === sharedPracticeTenant ? meterPlaceAdmissionHold : { status: "checked_on_adoption", reason: "ordinary_start_rule" }) : { status: "available", reason: "imported_at_invoiced_stage", countedPlaces: 0 }, environment: "synthetic_demo" as const, realExternalActions: 0 as const,
        notice: "Practice sandbox — synthetic data; nothing is sent or charged" };
    });
  }
  async adopt(context: VerifiedTenantContext, digest: string, sourceJobId: string, raw: unknown): Promise<Record<string, unknown>> {
    syntheticOnly(); digestSchema.parse(digest); sourceJobId = uuid.parse(sourceJobId);
    // Resolve actor from the current session, never from a public request or tenant context copy.
    const prepared = await withTenant(this.pool, context, async db => {
      await owned(db, context.tenantId, digest, sourceJobId);
      const parsed = jobPartiesImportV3.safeParse(raw);
      if (!parsed.success) throw new JobImportV3Error("INVALID_IMPORT");
      const input = parsed.data, result = await snapshot(db, context.tenantId, digest, sourceJobId, previewIntent(input));
      assertImportIntentV3(input, result.snapshot);
      return { input, ...result };
    });
    const targetId = importTargetJobIdV3(context.tenantId, digest, prepared.input.commandId);
    const publicHash = importPublicRequestHashV3(context.tenantId, digest, sourceJobId, prepared.input);
    const prior = async () => withTenant(this.pool, context, async db => {
      await owned(db, context.tenantId, digest, sourceJobId);
      const row = (await db.$client.query<{ public_request_hash: string; result: unknown }>(
        "SELECT public_request_hash,result FROM app.job_import_v3 WHERE tenant_id=$1 AND command_id=$2 AND session_digest=$3",
        [context.tenantId, prepared.input.commandId, digest])).rows[0];
      if (!row) return null;
      if (row.public_request_hash !== publicHash) throw new JobImportV3Error("COMMAND_CONFLICT");
      return assertImportResultV3(prepared.snapshot, row.result);
    });
    // Durable replays return their original identities; current authority is checked first.
    { const result = await prior(); if (result) return result; }
    return new UserCommandDispatcher(this.pool).dispatch(context, {
      version: "command.v1", commandId: prepared.input.commandId, commandType: "job.adopt_in_flight_v3",
      semanticKey: `import-v3:${prepared.input.commandId}`, actorMembershipId: prepared.actorId, subjectType: "job", subjectRef: targetId,
      action: { actionType: "job.adopt_in_flight_v3", recipient: null, contentHash: prepared.previewHash, aggregateRevision: 0,
        amountPence: prepared.snapshot.baseline.acceptedNetPence, currency: "GBP", policyVersion: "synthetic_demo_import.v3", expiresAt: new Date(Date.now() + 60000) },
    }, new AdoptInFlightJobV3Mutation(context.tenantId, digest, sourceJobId, prepared.input, prepared.snapshot)).catch(async error => {
      if (error instanceof CommandError && error.code === "COMMAND_CONFLICT") { const result = await prior(); if (result) return result; }
      if (error instanceof Error && error.message === "IMPORT_ALREADY_ADOPTED") throw new JobImportV3Error("IMPORT_ALREADY_ADOPTED");
      if (error instanceof Error && error.message === "CAPACITY_ADMISSION_UNAVAILABLE") throw new JobImportV3Error("CAPACITY_ADMISSION_UNAVAILABLE");
      if (error instanceof Error && error.message === "METER_UPGRADE_REQUIRED") throw new JobImportV3Error("PLAN_LIMIT_REACHED");
      throw error;
    });
  }
  async read(context: VerifiedTenantContext, digest: string, importedJobId: string) {
    syntheticOnly(); digestSchema.parse(digest); importedJobId = uuid.parse(importedJobId);
    return withTenant(this.pool, context, async db => {
      await owned(db, context.tenantId, digest, importedJobId);
      const row = (await db.$client.query<{ snapshot: unknown; result: unknown; adopted_at: Date; admission?: { outcome?: string; sourceHash?: string } }>(
        `SELECT snapshot,result,adopted_at,(SELECT jsonb_build_object('outcome',e.payload#>>'{references,capacityOutcome}','sourceHash',e.payload#>>'{hashes,meterSourceHash}')
          FROM app.audit_event e WHERE e.tenant_id=$1 AND e.subject_type='job' AND e.subject_ref=($2::uuid)::text AND e.event_type='job.imported_baseline_attested' LIMIT 1) admission
          FROM app.job_import_v3 WHERE tenant_id=$1 AND job_id=$2 AND session_digest=$3`,
        [context.tenantId, importedJobId, digest])).rows[0];
      if (!row) throw new JobImportV3Error("NOT_FOUND");
      return { version: "job-import-read.v3" as const, environment: "synthetic_demo" as const, realExternalActions: 0 as const, result: assertImportResultV3(row.snapshot, row.result), snapshot: adoptJobV3.parse(row.snapshot), adoptedAt: row.adopted_at.toISOString(),
        meter: adoptJobV3.parse(row.snapshot).lifecyclePoint === "invoiced"
          ? { countedPlaces: 0 as const, reason: "imported_at_invoiced_stage" as const }
          : { reason: "ordinary_start_rule" as const, admission: row.admission?.outcome ? admissionOutcome.parse(row.admission) : null },
        catchAvailability: { status: "unavailable" as const, code: "ATTRIBUTION_UNAVAILABLE" as const, reason: IMPORT_CATCH_HOLD_REASON },
        lineageLabel: "Builder-attested imported baseline — weaker lineage than a customer-accepted quote" };
    });
  }
  async assessCatch(context: VerifiedTenantContext, digest: string, importedJobId: string, raw: unknown) {
    // Authenticate and read the durable import first. This result never varies
    // with hidden sources, a lock, receipts or attribution-table contents.
    const stored = await this.read(context, digest, importedJobId);
    const historical = importedCatchCommand.safeParse(raw);
    if (historical.success) {
      if (historical.data.baselineId !== stored.result.baselineId) throw new JobImportV3Error("REVISION_CONFLICT");
      return new ImportPreAdoptionRepository(this.pool).assess(context, digest, importedJobId, historical.data).catch(error => {
        if (error instanceof Error && error.message === "COMMAND_CONFLICT") throw new JobImportV3Error("COMMAND_CONFLICT");
        if (error instanceof Error && error.message === "FORBIDDEN") throw new JobImportV3Error("FORBIDDEN");
        if (error instanceof Error && error.message === "REVISION_CONFLICT") throw new JobImportV3Error("REVISION_CONFLICT");
        if (error instanceof Error && error.message === "PRE_ADOPTION_SOURCE_REQUIRED") throw new JobImportV3Error("ATTRIBUTION_UNAVAILABLE");
        throw error;
      });
    }
    const input = z.object({ version: z.literal("import-catch-command.v1"), commandId: uuid, baselineId: uuid }).strict().safeParse(raw);
    if (!input.success) throw new JobImportV3Error("INVALID_IMPORT");
    if (input.data.baselineId !== stored.result.baselineId) throw new JobImportV3Error("REVISION_CONFLICT");
    throw new JobImportV3Error("ATTRIBUTION_UNAVAILABLE");
  }
}

/** Recheck current session and approved content before receipt/replay. No nested transaction. */
export class AdoptInFlightJobV3Mutation implements CommandMutation<Record<string, unknown>> {
  private admission: z.infer<typeof admissionOutcome> | undefined;
  constructor(private readonly tenantId: string, private readonly digest: string, private readonly sourceJobId: string,
    private readonly request: unknown, private readonly approvedSnapshot: unknown) {}
  private async check(db: TenantTransaction, command: ConsequentialCommand) {
    syntheticOnly(); const digest = digestSchema.parse(this.digest), sourceId = uuid.parse(this.sourceJobId), tenantId = uuid.parse(this.tenantId);
    await owned(db, tenantId, digest, sourceId, command.actorMembershipId);
    const input = jobPartiesImportV3.parse(this.request), approved = adoptJobV3.parse(this.approvedSnapshot);
    if (approved.historyManifest.length !== 0) throw new JobImportV3Error("IMPORT_HISTORY_ADAPTER_REQUIRED");
    const current = await snapshot(db, tenantId, digest, sourceId, previewIntent(input), command.actorMembershipId);
    assertImportIntentV3(input, approved);
    if (importActionHashV3(approved) !== current.previewHash || approved.sourceJobId !== sourceId ||
      uuid.parse(command.commandId) !== input.commandId || command.commandType !== "job.adopt_in_flight_v3" || command.subjectType !== "job" ||
      uuid.parse(command.subjectRef) !== importTargetJobIdV3(tenantId, digest, input.commandId) || command.action.actionType !== "job.adopt_in_flight_v3" ||
      command.action.recipient !== null || command.action.contentHash !== current.previewHash || command.action.aggregateRevision !== 0 ||
      command.action.amountPence !== approved.baseline.acceptedNetPence || command.action.currency !== "GBP" || command.action.policyVersion !== "synthetic_demo_import.v3")
      throw new JobImportV3Error("EXACT_IMPORT_AUTHORIZATION_MISMATCH");
  }
  async lock(db: TenantTransaction, command: ConsequentialCommand): Promise<void> {
    await this.check(db, command);
    if (adoptJobV3.parse(this.approvedSnapshot).lifecyclePoint === "live" && this.tenantId === sharedPracticeTenant) return admissionUnavailable();
    // Serialize duplicate imports before receipt and audit locks. SQL reuses this row lock.
    await db.$client.query("SELECT id FROM app.job WHERE tenant_id=$1 AND id=$2 FOR UPDATE", [this.tenantId, this.sourceJobId]);
  }
  async mutate(db: TenantTransaction, command: ConsequentialCommand): Promise<Record<string, unknown>> {
    await this.check(db, command);
    if (adoptJobV3.parse(this.approvedSnapshot).lifecyclePoint === "live" && this.tenantId === sharedPracticeTenant) return admissionUnavailable();
    const row = (await db.$client.query<{ result: unknown }>("SELECT app.adopt_invoiced_job_v3($1,$2,$3,$4,$5,$6::jsonb,$7) result",
      [this.tenantId, this.sourceJobId, this.digest, command.commandId, command.authorizationId,
        JSON.stringify(this.approvedSnapshot), importPublicRequestHashV3(this.tenantId, this.digest, this.sourceJobId, this.request)])).rows[0];
    const wrapped = z.object({ result: z.unknown(), admission: admissionOutcome }).strict().safeParse(row?.result);
    if (wrapped.success) { this.admission = wrapped.data.admission; return assertImportResultV3(this.approvedSnapshot, wrapped.data.result); }
    return assertImportResultV3(this.approvedSnapshot, row?.result);
  }
  auditEvents(result: Record<string, unknown>, command: ConsequentialCommand) {
    return [{ id: randomUUID(), version: "audit.v1" as const, actorRef: `membership:${command.actorMembershipId}`,
      eventType: "job.imported_baseline_attested", subjectType: "job", subjectRef: String(result.jobId),
      payload: { references: { sourceJobId: this.sourceJobId, baselineId: String(result.baselineId), ...(this.admission ? { capacityOutcome: this.admission.outcome } : {}) },
        hashes: { baselineHash: String(result.actionHash), ...(this.admission ? { meterSourceHash: this.admission.sourceHash } : {}) }, classifications: { action: "commercial" as const } } }];
  }
}
