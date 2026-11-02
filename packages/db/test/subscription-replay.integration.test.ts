import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeWorkFixture, createWorkFixture, seedWorkJob, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { command, count, correctionPeriod, historicalAgreement, issue, meterCompany, meterInput, readSubscription, rows, storeMeter, terms } from "./subscription-persistence-fixtures.js";

describe("MON-2A-P PostgreSQL atomic replay", () => {
 let f: WorkFixture; beforeAll(async () => { f = await createWorkFixture(); }, 60000); afterAll(async () => closeWorkFixture(f));
 it("exact replay returns the first result", async () => {
  const a = await meterCompany(f), id = randomUUID(), value = terms(a);
  const first = await command(f, a, value, id);
  expect(await command(f, a, value, id)).toEqual(first);
  expect(await count(f, a, "subscription_agreement_revision")).toBe(1);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [a.tenantId, id])).rows[0].n).toBe(1);
 });
 it("changed payload actor subject and command family conflict", async () => {
  const a = await meterCompany(f), id = randomUUID(); await command(f, a, terms(a), id);
  for (const value of [{ ...terms(a), contentHash: "b".repeat(64) }, { ...terms(a), actorId: randomUUID() }, { ...terms(a), subjectId: randomUUID() }, { ...terms(a), kind: "change" }]) {
   await expect(command(f, a, value, id)).rejects.toThrow();
  }
  const second = await seedWorkJob(f, a.tenantId), secondDigest = createHash("sha256").update(randomUUID()).digest("hex"), secondSession = randomUUID();
  const user = (await f.admin.query("SELECT identity_user_id FROM app.membership WHERE id=$1", [second.actorId])).rows[0].identity_user_id;
  await f.admin.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)", [`${randomUUID()}@subscription.invalid`, user]);
  await f.admin.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3)", [user, a.tenantId, second.actorId]);
  await f.admin.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES($1,$2,'synthetic_demo',$3,$4,clock_timestamp()+interval '1 hour')", [secondSession, user, secondDigest, randomUUID()]);
  await expect(command(f, { ...second, digest: secondDigest, sessionId: secondSession }, terms(a), id)).rejects.toThrow();
  const foreignId = randomUUID();
  await f.admin.query("INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,actor_membership_id,result,completed_at) VALUES($1,$2,'mon1.fixture',$2::uuid::text,$3,'succeeded',$4,'{}',clock_timestamp())", [a.tenantId, foreignId, "a".repeat(64), a.actorId]);
  await expect(command(f, a, terms(a), foreignId)).rejects.toThrow();
 });
 it("rollback leaves no partial approval work or receipt", async () => {
  const a = await meterCompany(f), id = randomUUID(), before = await readSubscription(f, a);
  const authorizationsBefore = await count(f, a, "action_authorization"), auditsBefore = await count(f, a, "audit_event");
  await expect(workTenant(f.runtime, a.tenantId, async db => {
   await db.query("SELECT app.mon2_command($1,$2,$3,$4::jsonb)", [a.tenantId, a.digest, id, JSON.stringify(terms(a))]);
   throw new Error("injected rollback after command");
  })).rejects.toThrow("injected rollback");
  expect(await readSubscription(f, a)).toEqual(before);
  expect(await count(f, a, "action_authorization")).toBe(authorizationsBefore); expect(await count(f, a, "audit_event")).toBe(auditsBefore);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [a.tenantId, id])).rows[0].n).toBe(0);
 });
 it("concurrent issue creates one period statement and audit effect", async () => {
  const a = await meterCompany(f); await historicalAgreement(f, a); await storeMeter(f, a, meterInput(a.tenantId));
  const auditsBefore = await count(f, a, "audit_event");
  const id = randomUUID(), results = await Promise.all([issue(f, a, "2026-09-01", 1, id), issue(f, a, "2026-09-01", 1, id)]);
  expect(results[0]).toEqual(results[1]);
  expect(await count(f, a, "audit_event")).toBe(auditsBefore + 1);
  const hash=(await f.admin.query("SELECT app.final_lock_hash($1::jsonb) hash",[JSON.stringify(results[0])])).rows[0].hash;
  expect((await f.admin.query("SELECT payload->'hashes'->>'result' hash FROM app.audit_event WHERE tenant_id=$1 AND event_type='subscription.issue'",[a.tenantId])).rows).toEqual([{hash}]);
  expect(await count(f, a, "subscription_period")).toBe(1); expect(await count(f, a, "platform_statement")).toBe(1);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [a.tenantId, id])).rows[0].n).toBe(1);
 });
 it("correction identity is applied once", async () => {
  const { a } = await correctionPeriod(f, 8), before = await rows(f, a, "subscription_correction_disposition");
  expect(before).toHaveLength(1);
  await issue(f, a, "2026-10-01");
  expect(await rows(f, a, "subscription_correction_disposition")).toEqual(before);
 });

});
