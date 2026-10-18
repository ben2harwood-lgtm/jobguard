import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeWorkFixture, createWorkFixture, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { approvedSimulation, command, meterCompany, readSubscription, terms } from "./subscription-persistence-fixtures.js";

describe("MON-2A-P PostgreSQL authority", () => {
 let f: WorkFixture; beforeAll(async () => { f = await createWorkFixture(); }, 60000); afterAll(async () => closeWorkFixture(f));
 it("admin may read but only active owner accepts", async () => {
  const a = await meterCompany(f); await command(f, a, terms(a));
  await f.admin.query("UPDATE app.membership SET role='admin' WHERE tenant_id=$1 AND id=$2", [a.tenantId, a.actorId]);
  expect((await readSubscription(f, a)).agreements).toHaveLength(1);
  await expect(command(f, a, { ...terms(a, "Solo", 1), kind: "change" })).rejects.toThrow();
  await f.admin.query("UPDATE app.membership SET role='owner',expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2", [a.tenantId, a.actorId]);
  await expect(command(f, a, { ...terms(a, "Solo", 1), kind: "change" })).rejects.toThrow();
 });
 it("revocation during lock wait prevents execution", async () => {
  const { a, approved } = await approvedSimulation(f), lock = await f.admin.connect();
  await lock.query("BEGIN"); await lock.query("SELECT pg_advisory_xact_lock(hashtextextended($1,184))", [a.tenantId]);
  const pending = command(f, a, {version:"subscription-command.v1",kind:"execute_simulation",workId:approved.workId,expectedRevision:1}); const rejected = expect(pending).rejects.toThrow();
  try {
   let waiting = false;
   for (let i = 0; i < 100; i++) {
    waiting = (await f.admin.query("SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND NOT granted) waiting")).rows[0].waiting;
    if (waiting) break;
    await new Promise(resolve => setTimeout(resolve, 10));
   }
   expect(waiting).toBe(true);
   await f.admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1", [a.sessionId]);
  } finally { await lock.query("ROLLBACK"); lock.release(); }
  await rejected;
 });
 it("forged tenant actor price revision and executor flags fail", async () => {
  const a = await meterCompany(f), b = await meterCompany(f);
  for (const patch of [{ tenantId: b.tenantId }, { actorId: b.actorId }, { maximumPence: 1 }, { expectedRevision: 22 }, { executor: true }, { cadence: "annual" }, { annualEnabled: true }]) {
   await expect(command(f, a, { ...terms(a), ...patch })).rejects.toThrow();
  }
 });
 it("missing foreign and pooled contexts fail closed", async () => {
  const a = await meterCompany(f), b = await meterCompany(f);
  await expect(f.runtime.query("SELECT app.mon2_read($1,$2)", [a.tenantId, a.digest])).rejects.toThrow();
  await expect(workTenant(f.runtime, b.tenantId, db => db.query("SELECT app.mon2_read($1,$2)", [a.tenantId, a.digest]))).rejects.toThrow();
  await expect(workTenant(f.runtime, "invalid", db => db.query("SELECT app.mon2_read($1,$2)", [a.tenantId, a.digest]))).rejects.toThrow();
  await readSubscription(f, a);
  expect((await f.runtime.query("SELECT nullif(current_setting('app.tenant_id',true),'') tenant")).rows[0].tenant).toBeNull();
 });
 it("worker cannot manufacture approval", async () => {
  const a = await meterCompany(f);
  await expect(command(f, a, { version: "subscription-command.v1", kind: "execute_simulation", workId: randomUUID(), expectedRevision: 0 })).rejects.toThrow();
  // Legacy command_receipt INSERT is granted by 0005; this piece seals its own work tables.
  for (const table of ["subscription_agreement_revision", "subscription_simulated_work", "platform_statement", "subscription_simulated_attempt", "subscription_simulated_result"]) {
   expect((await f.admin.query("SELECT has_table_privilege('jobguard_runtime',$1,'INSERT,UPDATE,DELETE,TRUNCATE') allowed", [`app.${table}`])).rows[0].allowed).toBe(false);
  }
  // Preserve the existing receipt boundary without claiming this task revoked INSERT.
  expect((await f.admin.query("SELECT has_table_privilege('jobguard_runtime','app.command_receipt','INSERT') allowed")).rows[0].allowed).toBe(true);
  expect((await f.admin.query("SELECT has_table_privilege('jobguard_runtime','app.command_receipt','DELETE,TRUNCATE') allowed")).rows[0].allowed).toBe(false);
 });
 it("shared practice cannot read a company summary", async () => {
  const a = await meterCompany(f);
  await expect(readSubscription(f, { ...a, tenantId: "11111111-1111-4111-8111-111111111111" })).rejects.toThrow();
 });
 it("runtime has no direct subscription-table reads", async () => {
  const a = await meterCompany(f); await command(f, a, terms(a));
  for (const table of ["subscription_agreement_revision", "subscription_period", "platform_statement", "subscription_simulated_work"]) {
   await expect(workTenant(f.runtime, a.tenantId, db => db.query(`SELECT * FROM app.${table}`))).rejects.toMatchObject({ code: "42501" });
  }
  expect((await readSubscription(f, a)).agreements).toHaveLength(1);
 });

});
