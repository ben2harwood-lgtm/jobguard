import type { Pool } from "pg";
import { z } from "zod";
import { adoptJobV3, assertImportIntentV3, importActionHashV3, jobPartiesImportV3, type AdoptJobV3 } from "../../core/dist/job-import-v3.js";
import { UserCommandDispatcher, type CommandMutation, type ConsequentialCommand } from "./commands.js";
import { meterPlaceAdmissionHold } from "./meter-place-admission.js";
import { practiceOwnedJobsSql } from "./practice-session.js";
import { withTenant, type TenantTransaction, type VerifiedTenantContext } from "./tenant-context.js";
import { importFixtureV3, importTargetJobIdV3 } from "./job-import-v3-fixtures.js";

const uuid = z.string().uuid().transform(v => v.toLowerCase());
const digestSchema = z.string().regex(/^[a-f0-9]{64}$/u);
export const importPreviewRequestV3 = z.object({ version: z.literal("job-import-preview.v3"), expectedBindingId: uuid,
  fixtureId: z.string().regex(/^[a-z0-9][a-z0-9.-]{0,99}$/u), lifecyclePoint: z.enum(["live", "invoiced"]) }).strict();
export class JobImportV3Error extends Error {
  constructor(readonly code: "FORBIDDEN" | "INVALID_IMPORT" | "REVISION_CONFLICT" | "IMPORT_HISTORY_ADAPTER_REQUIRED" | "METER_PLACE_SOURCE_HANDOFF_HELD" | "EXACT_IMPORT_AUTHORIZATION_MISMATCH" | "SYNTHETIC_MODE_REQUIRED") { super(code); this.name = "JobImportV3Error"; }
}
function syntheticOnly(): void {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new JobImportV3Error("SYNTHETIC_MODE_REQUIRED");
}
/** Consume MON1-A's actual exported boundary. No oracle/precheck becomes a permit. */
function admissionUnavailable(): never {
  throw new JobImportV3Error(meterPlaceAdmissionHold.code);
}
async function owned(db: TenantTransaction, tenantId: string, digest: string, jobId: string, expectedActor?: string): Promise<string> {
  const principal = (await db.$client.query<{ membership_id: string }>("SELECT membership_id FROM app.authenticate_practice_session($1,$2)", [digest, tenantId])).rows[0];
  if (!principal || (expectedActor !== undefined && uuid.parse(principal.membership_id) !== uuid.parse(expectedActor))) throw new JobImportV3Error("FORBIDDEN");
  const found = await db.$client.query(`${practiceOwnedJobsSql()} SELECT id FROM practice_owned_job WHERE id=$2`, [tenantId, jobId, digest]);
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

/** Partial build: previews exist; adoption and stored v3 reads remain explicitly held. */
export class JobImportV3Repository {
  constructor(private readonly pool: Pool) {}
  async preview(context: VerifiedTenantContext, digest: string, sourceJobId: string, request: unknown) {
    syntheticOnly(); digestSchema.parse(digest); sourceJobId = uuid.parse(sourceJobId);
    return withTenant(this.pool, context, async db => {
      const result = await snapshot(db, context.tenantId, digest, sourceJobId, request);
      return { version: "job-import-preview-result.v3" as const, snapshot: result.snapshot, previewHash: result.previewHash,
        availability: meterPlaceAdmissionHold, environment: "synthetic_demo" as const, realExternalActions: 0 as const,
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
    return new UserCommandDispatcher(this.pool).dispatch(context, {
      version: "command.v1", commandId: prepared.input.commandId, commandType: "job.adopt_in_flight_v3",
      semanticKey: `import-v3:${prepared.input.commandId}`, actorMembershipId: prepared.actorId, subjectType: "job", subjectRef: targetId,
      action: { actionType: "job.adopt_in_flight_v3", recipient: null, contentHash: prepared.previewHash, aggregateRevision: 0,
        amountPence: prepared.snapshot.baseline.acceptedNetPence, currency: "GBP", policyVersion: "synthetic_demo_import.v3", expiresAt: new Date(Date.now() + 60000) },
    }, new AdoptInFlightJobV3Mutation(context.tenantId, digest, sourceJobId, prepared.input, prepared.snapshot));
  }
  async read(context: VerifiedTenantContext, digest: string, importedJobId: string): Promise<never> {
    syntheticOnly(); digestSchema.parse(digest); importedJobId = uuid.parse(importedJobId);
    return withTenant(this.pool, context, async db => {
      await owned(db, context.tenantId, digest, importedJobId);
      return admissionUnavailable();
    });
  }
}

/** Actual dispatcher hook: refuses BEFORE receipt claim/approval, also before replay. No nested transaction. */
export class AdoptInFlightJobV3Mutation implements CommandMutation<Record<string, unknown>> {
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
  async lock(db: TenantTransaction, command: ConsequentialCommand): Promise<never> {
    await this.check(db, command);
    // No business locks are needed for this unconditional refusal. Do not acquire the
    // incomplete MON1 lock sequence or create an authorization to a held capability.
    return admissionUnavailable();
  }
  async mutate(db: TenantTransaction, command: ConsequentialCommand): Promise<never> {
    await this.check(db, command);
    return admissionUnavailable();
  }
}
