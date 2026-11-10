import { snapshotRows } from "./upgrade-proof-utils.js";
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
 it("a bound execution serializes before session revocation during a lock wait", async () => {
  const { a, approved } = await approvedSimulation(f), lock = await f.admin.connect(), revoker = await f.admin.connect();
  const commandId=randomUUID(),input={version:"subscription-command.v1",kind:"execute_simulation",workId:approved.workId,expectedRevision:1};
  let pending:ReturnType<typeof command>|undefined,revocation:Promise<unknown>|undefined;
  const blocked=async(pid:number)=>{
   for(let i=0;i<200;i++){
    const row=(await f.admin.query("SELECT pid FROM pg_stat_activity WHERE $1::int=ANY(pg_blocking_pids(pid))",[pid])).rows[0];
    if(row)return Number(row.pid);
    await new Promise(resolve=>setTimeout(resolve,10));
   }
   throw new Error("Expected PostgreSQL lock wait");
  };
  const effects=async()=>{
   const result:Record<string,unknown>={};
   for(const table of ["platform_statement","platform_statement_line","subscription_simulated_work","subscription_simulated_attempt","subscription_simulated_result"])
    result[table]=(await f.admin.query(`SELECT to_jsonb(r) value FROM app.${table} r WHERE tenant_id=$1 ORDER BY to_jsonb(r)::text`,[a.tenantId])).rows;
   return result;
  };
  const before=await effects();
  try {
   await lock.query("BEGIN");await lock.query("SELECT pg_advisory_xact_lock(hashtextextended($1,184))",[a.tenantId]);
   const lockPid=Number((await lock.query("SELECT pg_backend_pid() pid")).rows[0].pid);
   pending=command(f,a,input,commandId);void pending.catch(()=>undefined);
   const executorPid=await blocked(lockPid);
   await revoker.query("BEGIN");
   const revokerPid=Number((await revoker.query("SELECT pg_backend_pid() pid")).rows[0].pid);
   revocation=revoker.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1",[a.sessionId]);
   void revocation.catch(()=>undefined);
   // The bound request owns the session SHARE lock before it waits on 184.
   // Revocation therefore commits after this authorized execution, not during it.
   expect(await blocked(executorPid)).toBe(revokerPid);
   expect(await effects()).toEqual(before);
   await lock.query("COMMIT");
   expect(await pending).toMatchObject({workId:approved.workId});
   await revocation;
   expect((await f.admin.query("SELECT count(*)::int n FROM app.subscription_simulated_attempt WHERE tenant_id=$1",[a.tenantId])).rows).toEqual([{n:1}]);
   expect((await f.admin.query("SELECT count(*)::int n FROM app.subscription_simulated_result WHERE tenant_id=$1",[a.tenantId])).rows).toEqual([{n:0}]);
   const executed=await effects();
   expect(executed.platform_statement).toEqual(before.platform_statement);
   expect(executed.platform_statement_line).toEqual(before.platform_statement_line);
   await revoker.query("COMMIT");
   const revoked=await snapshotRows(f.admin);
   await expect(command(f,a,input,commandId)).rejects.toThrow("METER_FORBIDDEN");
   await expect(command(f,a,input)).rejects.toThrow("METER_FORBIDDEN");
   expect(await snapshotRows(f.admin)).toEqual(revoked);
   expect(await effects()).toEqual(executed);
  }finally{
   await lock.query("ROLLBACK");await pending?.catch(()=>undefined);
   await revocation?.catch(()=>undefined);await revoker.query("ROLLBACK");
   lock.release();revoker.release();
  }
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
  await expect(workTenant(f.runtime, b.tenantId, db => db.query("SELECT app.mon2_read($1,$2)", [a.tenantId, a.digest]), { membershipId: b.actorId })).rejects.toThrow();
  await expect(workTenant(f.runtime, "invalid", db => db.query("SELECT app.mon2_read($1,$2)", [a.tenantId, a.digest]))).rejects.toThrow();
  await readSubscription(f, a);
  expect((await f.runtime.query("SELECT nullif(current_setting('app.tenant_id',true),'') tenant")).rows[0].tenant).toBeNull();
 });
 it("worker cannot manufacture approval", async () => {
  const a = await meterCompany(f);
  await expect(command(f, a, { version: "subscription-command.v1", kind: "execute_simulation", workId: randomUUID(), expectedRevision: 0 })).rejects.toThrow();
  // LP-5c also seals direct receipt creation alongside the subscription work tables.
  for (const table of ["subscription_agreement_revision", "subscription_simulated_work", "platform_statement", "subscription_simulated_attempt", "subscription_simulated_result"]) {
   expect((await f.admin.query("SELECT has_table_privilege('jobguard_runtime',$1,'INSERT,UPDATE,DELETE,TRUNCATE') allowed", [`app.${table}`])).rows[0].allowed).toBe(false);
  }
  // The current migration chain withdraws direct runtime receipt writes.
  expect((await f.admin.query("SELECT has_table_privilege('jobguard_runtime','app.command_receipt','INSERT') allowed")).rows[0].allowed).toBe(false);
  expect((await f.admin.query("SELECT has_table_privilege('jobguard_runtime','app.command_receipt','DELETE,TRUNCATE') allowed")).rows[0].allowed).toBe(false);
 });
 it("shared practice cannot read a company summary", async () => {
  const a = await meterCompany(f);
  await expect(readSubscription(f, { ...a, tenantId: "11111111-1111-4111-8111-111111111111" })).rejects.toThrow();
 });
 it("runtime has no direct subscription-table reads", async () => {
  const a = await meterCompany(f); await command(f, a, terms(a));
  for (const table of ["subscription_agreement_revision", "subscription_period", "platform_statement", "subscription_simulated_work"]) {
   await expect(workTenant(f.runtime, a.tenantId, db => db.query(`SELECT * FROM app.${table}`), { membershipId: a.actorId })).rejects.toMatchObject({ code: "42501" });
  }
  expect((await readSubscription(f, a)).agreements).toHaveLength(1);
 });

});
