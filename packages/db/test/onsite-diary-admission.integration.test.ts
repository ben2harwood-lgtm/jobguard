// SV-7A / CH-4, migration 0505. Real PostgreSQL CI only.
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JobSourceError, JobWorkStateError, proposalFromObservation } from "@jobguard/core";
import { JobWorkStateRepository } from "../src/job-work-state-repository.js";
import { JobSourceRepository } from "../src/job-source-repository.js";
import { ShadowObservationReader, FixtureObservationSources } from "../src/shadow-observation-reader.js";
import { ShadowDetectionRepository } from "../src/shadow-detection-repository.js";
import { closeWorkFixture, createWorkFixture, seedWorkJob, workTenant, boundaryLock, type WorkFixture, type WorkJob } from "./job-work-state-fixtures.js";
import { activateMeterJob } from "./meter-journey-fixtures.js";
import { historicalAgreement } from "./subscription-persistence-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";

const diary = (onSite = true) => ({ version: "job-diary-input.v1", commandId: randomUUID(), entryMode: "typed", onSite, text: "Fitted outside tap." });
describe("SV-7A on-site admission attacks", () => {
 let f: WorkFixture, repo: JobSourceRepository, shadow: Pool;
 beforeAll(async () => {
  f = await createWorkFixture(); repo = new JobSourceRepository(f.runtime);
  const login = `onsite_shadow_${randomUUID().replaceAll("-", "")}`, password = randomUUID();
  await f.admin.query(`CREATE ROLE ${login} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${password}'; GRANT jobguard_shadow TO ${login}`);
  shadow = new Pool({ ...f.admin.options, user: login, password, max: 2 });
 }, 60000);
 afterAll(async () => { await shadow?.end(); await closeWorkFixture(f); });
 async function company() {
  const a = await meterCompany(f); await historicalAgreement(f, a, "Solo"); await activateMeterJob(f, a); return a;
 }
 const intake = (a: WorkJob, input = diary()) => repo.intake(a.context, a.jobId, a.actorId, "diary", input);
 const events = async (a: WorkJob) => (await f.admin.query("SELECT * FROM app.job_work_state_event WHERE tenant_id=$1 AND job_id=$2 ORDER BY sequence", [a.tenantId, a.jobId])).rows;
 const counts = async (a: WorkJob) => Object.fromEntries(await Promise.all([
  "job_diary_entry", "job_source_original", "job_site_source_receipt", "job_work_state_event", "evidence_upload", "evidence_object", "command_receipt", "watchdog_command_identity", "audit_event", "meter_work_ledger",
 ].map(async table => [table, (await f.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1`, [a.tenantId])).rows[0].n])));
 it("on-site typed/dictated entries bind original evidence and replay exactly one first-site event", async () => {
  const a = await company(), input = diary();
  const receipts = await Promise.all([intake(a, input), intake(a, input)]);
  expect(receipts[1]).toEqual(receipts[0]); expect(receipts[0]!.record).toMatchObject({ onSite: true, entryMode: "typed" });
  const first = await events(a); expect(first).toHaveLength(1); expect(first[0].kind).toBe("first_site_evidence");
  const receipt = receipts[0]!, source = (await f.admin.query("SELECT * FROM app.job_site_source_receipt WHERE tenant_id=$1 AND id=$2", [a.tenantId, first[0].source_receipt_id])).rows[0];
  expect(source).toMatchObject({ source_kind: "diary", fact_key: `diary:${receipt.record.id}`, evidence_id: receipt.record.evidence.id, object_version_id: receipt.record.evidence.objectVersionId, source_hash: receipt.record.evidence.sha256, actor_membership_id: a.actorId });
  expect(source.received_at).toEqual(first[0].fact_at);
  const before = await counts(a); expect(await intake(a, input)).toEqual(receipt); expect(await counts(a)).toEqual(before); expect(await events(a)).toEqual(first);
  await expect(intake(a, { ...input, onSite: false })).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  await repo.intake(a.context, a.jobId, a.actorId, "diary", { ...diary(), entryMode: "dictated_text" });
  expect(await events(a)).toHaveLength(2);
  const offsiteBefore = await events(a); await intake(a, diary(false)); expect(await events(a)).toEqual(offsiteBefore);
 });
 it.each(["diary", "customer_message"] as const)("LP-5 source %s stores one checked lifecycle result and refuses revoked replay", async kind => {
  const a = await company(), commandId = randomUUID();
  const input = kind === "diary" ? { ...diary(), commandId } : { version: "customer-message-input.v1", commandId, fictionalCustomer: { kind: "named_fictional_customer", name: "Fictional customer" }, text: "Please fit an outside tap." };
  const call = (raw = input) => repo.intake(a.context, a.jobId, a.actorId, kind, raw);
  const first = await call(); expect(await call()).toEqual(first);
  const lifecycle = (await f.admin.query("SELECT c.version,c.outcome,r.status,r.result FROM app.command_lifecycle_claim c JOIN app.command_receipt r USING(tenant_id,command_id) WHERE c.tenant_id=$1 AND c.command_id=$2", [a.tenantId, commandId])).rows;
  expect(lifecycle).toEqual([{ version: "repository-command.v1", outcome: {}, status: "succeeded", result: first }]);
  await expect(call({ ...input, text: "Changed fictional note." })).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  const before = await counts(a);
  await f.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [a.tenantId, a.actorId]);
  await expect(call()).rejects.toEqual(new JobSourceError("JOB_SOURCE_FORBIDDEN"));
  expect(await counts(a)).toEqual(before);
 });
 it.each(["JobSource.diary", "JobSource.customer_message", "IssueLockBoundInvoice", "unknown.lp5.main.writer"])("LP-5 %s cannot complete without its effect", async commandType => {
  const a = await company(), commandId = randomUUID(), before = await counts(a);
  await expect(workTenant(f.runtime, a.tenantId, async db => {
   const claim = (await db.query("SELECT app.begin_command('repository-command.v1',$1,$2,$1::text,$3::jsonb,'{}'::jsonb,$4::jsonb) result", [commandId, commandType,
    JSON.stringify({ tenantId: a.tenantId, actorMembershipId: a.actorId, subjectType: "job", subjectRef: a.jobId }),
    JSON.stringify({ version: "repository-command.v1", actorMembershipId: a.actorId, input: {}, legacyJson: "{}" })])).rows[0].result;
   expect(claim.kind).toBe("claim");
   await db.query("SELECT app.complete_command($1,'{}'::jsonb)", [commandId]);
  })).rejects.toThrow("AUTHORIZATION_INVALID");
  expect(await counts(a)).toEqual(before);
 });
 it("a cap refusal has no source, receipt, event, audit or ledger effect", async () => {
  const a = await company();
  // Explicit historical fixture: this job's day-31 start and subsequent quiet period have expired.
  await workTenant(f.admin, a.tenantId, async db => {
   await db.query("SET LOCAL session_replication_role='replica'");
   await db.query("UPDATE app.job_activation SET activated_at=clock_timestamp()-interval '70 days' WHERE tenant_id=$1 AND job_id=$2", [a.tenantId, a.jobId]);
  });
  for (let i = 0; i < 6; i++) await activateMeterJob(f, await seedWorkJob(f, a.tenantId));
  const before = await counts(a), input = diary();
  await expect(intake(a, input)).rejects.toEqual(new JobWorkStateError("METER_UPGRADE_REQUIRED"));
  expect(await counts(a)).toEqual(before); expect(await events(a)).toEqual([]);
 });
 it("new post-lock work offers a linked job; an existing note still replays", async () => {
  const a = await company(), input = diary(), saved = await intake(a, input); await boundaryLock(f, a);
  const before = await counts(a);
  await expect(intake(a)).rejects.toEqual(new JobWorkStateError("POST_LOCK_WORK_REQUIRES_LINKED_JOB"));
  expect(await intake(a, input)).toEqual(saved); expect(await counts(a)).toEqual(before);
 });
 it.each(["draft", "accepted", "invoiced", "paid"])("non-live %s refuses without effects", async status => {
  const a = await company(); await workTenant(f.admin, a.tenantId, db => db.query("UPDATE app.job SET status=$2 WHERE tenant_id=$1 AND id=$3", [a.tenantId, status, a.jobId]));
  const before = await counts(a); await expect(intake(a)).rejects.toThrow("JOB_NOT_LIVE"); expect(await counts(a)).toEqual(before);
 });
 it("cross-tenant access, missing job and wrong-job command reuse fail closed", async () => {
  const a = await company(), b = await company(), sibling = await seedWorkJob(f, a.tenantId), input = diary(); await activateMeterJob(f, sibling);
  await intake(a, input); const before = await counts(a), otherBefore = await counts(b);
  await expect(repo.intake(a.context, b.jobId, a.actorId, "diary", input)).rejects.toEqual(new JobSourceError("JOB_SOURCE_FORBIDDEN"));
  await expect(repo.intake(b.context, a.jobId, b.actorId, "diary", input)).rejects.toEqual(new JobSourceError("JOB_SOURCE_FORBIDDEN"));
  await expect(repo.intake(a.context, randomUUID(), a.actorId, "diary", input)).rejects.toEqual(new JobSourceError("JOB_SOURCE_FORBIDDEN"));
  await expect(repo.intake(a.context, sibling.jobId, a.actorId, "diary", input)).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  expect(await counts(a)).toEqual(before); expect(await counts(b)).toEqual(otherBefore);
 });
 it("the on-site diary receipt stays identical after a real derived hidden signal", async () => {
  const a = await company(), input = diary(), receipt = await intake(a, input), before = await events(a);
  await workTenant(f.runtime, a.tenantId, db => db.query("SELECT app.accept_final_check_terms($1,$2,$3,$4)", [a.tenantId, a.actorId, randomUUID(), "synthetic_final_check_terms.v1"]));
  const reader = new ShadowObservationReader(f.runtime, new FixtureObservationSources([]));
  const { observations } = await reader.read(a.context, { version: "shadow-observation-read.v1", jobId: a.jobId });
  expect(observations).toHaveLength(1);
  await new ShadowDetectionRepository(shadow).persist(a.context, { version: "shadow-detection-batch.v1", jobId: a.jobId, observations, captures: [], proposals: observations.map(o => proposalFromObservation(o, "deterministic", "synthetic:onsite.v1", new Date().toISOString(), { lock: "before_lock", adoption: "after_adoption" })) });
  expect((await f.admin.query("SELECT count(*)::int n FROM app.shadow_commercial_signal WHERE tenant_id=$1 AND job_id=$2", [a.tenantId, a.jobId])).rows[0].n).toBe(1);
  expect(await intake(a, input)).toEqual(receipt); expect(await events(a)).toEqual(before);
  await expect(f.runtime.query("SELECT * FROM app.shadow_commercial_signal")).rejects.toMatchObject({ code: "42501" });
 });
 it("a receipt cannot bind another job's diary evidence and runtime cannot forge site facts", async () => {
  const a = await company(), b = await seedWorkJob(f, a.tenantId); await activateMeterJob(f, b); await intake(a);
  const source = (await f.admin.query("SELECT to_jsonb(r) value FROM app.job_site_source_receipt r WHERE tenant_id=$1 AND job_id=$2", [a.tenantId, a.jobId])).rows[0].value;
  const forged = { ...source, id: randomUUID(), job_id: b.jobId };
  await expect(workTenant(f.admin, a.tenantId, db => db.query("INSERT INTO app.job_site_source_receipt SELECT (jsonb_populate_record(NULL::app.job_site_source_receipt,$1::jsonb)).*", [JSON.stringify(forged)]))).rejects.toThrow("INVALID_WORK_SOURCE");
  await expect(workTenant(f.runtime, a.tenantId, db => db.query("INSERT INTO app.job_site_source_receipt SELECT (jsonb_populate_record(NULL::app.job_site_source_receipt,$1::jsonb)).*", [JSON.stringify(forged)]))).rejects.toMatchObject({ code: "42501" });
  expect(await events(b)).toEqual([]);
 });

 it("later on-site diary work cancels the finished marker through the existing CH-4 path", async () => {
  const a = await company(); await intake(a);
  await new JobWorkStateRepository(f.runtime).command(a.context, a.jobId, a.actorId, {
   version: "job-work-state-command.v1", commandId: randomUUID(), action: "finish", expectedRevision: 1,
  });
  await intake(a);
  const facts = await events(a);
  expect(facts.map(event => event.kind)).toEqual(["first_site_evidence", "finished_on_site", "finished_cancelled", "first_site_evidence"]);
  expect(facts[2].predecessor_id).toBe(facts[1].id);
  expect(facts[2].source_receipt_id).toBe(facts[3].source_receipt_id);
 });

});
