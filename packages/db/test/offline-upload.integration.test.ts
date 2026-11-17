import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { OfflineUploadApplication } from "../../../apps/api/src/offline-upload.application.js";
import { offlineUploadPayloadHash, type OfflineUploadV1 } from "../../../apps/api/src/offline-upload.contracts.js";
import { createWorkFixture, closeWorkFixture, seedWorkJob, type WorkFixture } from "./job-work-state-fixtures.js";
import { seedWorkPractice, commandCounts } from "./job-work-state-command-fixtures.js";
let f: WorkFixture;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); f = await createWorkFixture(); }, 120000);
afterAll(async () => { await closeWorkFixture(f); vi.unstubAllEnvs(); });
function upload(jobId: string, body: OfflineUploadV1["body"]): OfflineUploadV1 {
 return { version: "offline-upload.v1", commandId: body.commandId, jobId, expectedRevision: "expectedRevision" in body ? body.expectedRevision : null, body, payloadHash: offlineUploadPayloadHash(jobId, body) };
}
it("DARK upload persists once across reconnects, concurrent retries and a fresh pool; changed payload conflicts", async () => {
 const p = await seedWorkPractice(f), app = new OfflineUploadApplication(f.runtime, p.sessionId);
 const raw = upload(p.jobId, { version: "job-work-state-command.v1", commandId: randomUUID(), expectedRevision: 0, action: "finish" });
 const before = await commandCounts(f, p);
 expect(await app.upload(raw)).toMatchObject({ state: "acknowledged" });
 const committed = await commandCounts(f, p);
 expect(committed.command_receipt).toBe(before.command_receipt! + 1);
 expect(committed.job_work_state_event).toBe(before.job_work_state_event! + 1);
 for (const table of ["journal", "recovery_fee_journal", "synthetic_obligation", "action_outbox"]) expect(committed[table]).toBe(before[table]);
 expect(await Promise.all([app.upload(raw), app.upload(raw)])).toEqual([await app.upload(raw), await app.upload(raw)]);
 const fresh = new Pool(f.runtime.options);
 try { expect(await new OfflineUploadApplication(fresh, p.sessionId).upload(raw)).toMatchObject({ state: "acknowledged" }); } finally { await fresh.end(); }
 expect(await app.upload(upload(p.jobId, { ...raw.body, expectedRevision: 1 } as OfflineUploadV1["body"]))).toMatchObject({ state: "conflict", code: "IDEMPOTENCY_CONFLICT" });
 expect(await commandCounts(f, p)).toEqual(committed);
});
it("DARK upload preserves cancellation lineage and refuses stale completion, cross-session jobs and revoked membership", async () => {
 const p = await seedWorkPractice(f), other = await seedWorkPractice(f), app = new OfflineUploadApplication(f.runtime, p.sessionId);
 const finish = upload(p.jobId, { version: "job-work-state-command.v1", commandId: randomUUID(), expectedRevision: 0, action: "finish" });
 expect(await app.upload(finish)).toMatchObject({ state: "acknowledged" });
 expect(await app.upload(upload(p.jobId, { ...finish.body, commandId: randomUUID() }))).toMatchObject({ state: "conflict", code: "STALE_REVISION" });
 const event = (await f.admin.query("SELECT id FROM app.job_work_state_event WHERE tenant_id=$1 AND job_id=$2 AND kind='finished_on_site'", [p.auth.context.tenantId, p.jobId])).rows[0];
 expect(await app.upload(upload(p.jobId, { version: "job-work-state-command.v1", commandId: randomUUID(), expectedRevision: 1, action: "cancel_finish", markerId: event.id }))).toMatchObject({ state: "acknowledged" });
 const events = (await f.admin.query("SELECT kind,predecessor_id FROM app.job_work_state_event WHERE tenant_id=$1 AND job_id=$2 ORDER BY sequence", [p.auth.context.tenantId, p.jobId])).rows;
 expect(events).toEqual([{ kind: "finished_on_site", predecessor_id: null }, { kind: "finished_cancelled", predecessor_id: event.id }]);
 expect(await new OfflineUploadApplication(f.runtime, other.sessionId).upload(finish)).toMatchObject({ state: "rejected", code: "PERMISSION_REVOKED" });
 const foreign = await seedWorkJob(f);
 expect(await app.upload(upload(foreign.jobId, { ...finish.body, commandId: randomUUID() }))).toMatchObject({ state: "rejected", code: "PERMISSION_REVOKED" });
 await f.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [p.auth.context.tenantId, p.auth.membershipId]);
 try { expect(await app.upload(finish)).toMatchObject({ state: "rejected", code: "PERMISSION_REVOKED" }); }
 finally { await f.admin.query("UPDATE app.membership SET revoked_at=NULL WHERE tenant_id=$1 AND id=$2", [p.auth.context.tenantId, p.auth.membershipId]); }
});
it("DARK commercial uploads use current database authority and never create approval, outbox or money effects", async () => {
 const p = await seedWorkPractice(f), app = new OfflineUploadApplication(f.runtime, p.sessionId);
 const tenant = p.auth.context.tenantId, member = p.auth.membershipId;
 const job = (await f.admin.query("SELECT revision,accepted_quote_version_id FROM app.job WHERE tenant_id=$1 AND id=$2", [tenant, p.jobId])).rows[0];
 const decision = randomUUID(), resolution = randomUUID(), authorization = randomUUID();
 await f.admin.query("INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,'job',$3,'send_quote')", [decision, tenant, p.jobId]);
 await f.admin.query("INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'approved',$4)", [resolution, tenant, decision, member]);
 await f.admin.query(`INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at)
 VALUES($1,$2,$3,$4,$5,'send_quote','fictional@example.invalid',$6,$7,100,'GBP','synthetic.v1',clock_timestamp()+interval '1 hour')`, [authorization, tenant, decision, resolution, member, "a".repeat(64), job.revision]);
 const body = { version: "offline-commercial-intent.v1" as const, commandId: randomUUID(), expectedRevision: job.revision as number, acceptedQuoteVersionId: job.accepted_quote_version_id as string | null, authorizationId: authorization, actionType: "send_quote" as const, recipient: "fictional@example.invalid", contentHash: "a".repeat(64), amountPence: 100, currency: "GBP" as const, policyVersion: "synthetic.v1" };
 const before = await commandCounts(f, p);
 for (const [patch, code] of [
  [{}, "ONLINE_REVIEW_REQUIRED"], [{ amountPence: 101 }, "STALE_PRICE"], [{ acceptedQuoteVersionId: randomUUID() }, "ACCEPTED_VERSION_CHANGED"],
  [{ recipient: "changed@example.invalid" }, "AUTHORITY_CHANGED"], [{ contentHash: "b".repeat(64) }, "AUTHORITY_CHANGED"],
 ] as const) expect(await app.upload(upload(p.jobId, { ...body, ...patch }))).toMatchObject({ state: "conflict", code, realExternalActions: 0 });
 await f.admin.query("UPDATE app.action_authorization SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [tenant, authorization]);
 expect(await app.upload(upload(p.jobId, body))).toMatchObject({ state: "conflict", code: "APPROVAL_EXPIRED" });
 expect(await commandCounts(f, p)).toEqual(before);
 expect((await f.admin.query("SELECT count(*)::int n FROM app.decision_resolution WHERE tenant_id=$1 AND decision_id=$2", [tenant, decision])).rows[0].n).toBe(1);
});
