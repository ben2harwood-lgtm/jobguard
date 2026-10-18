import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeWorkFixture, createWorkFixture, seedWorkJob, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { calendarInput, command, historicalAgreement, issue, meterCompany, meterInput, preparedPeriod, readSubscription, rows, storeMeter, terms } from "./subscription-persistence-fixtures.js";
import { refreshMeter } from "./meter-persistence-fixtures.js";

describe("MON-2A-P persisted subscription", () => {
 let f: WorkFixture; beforeAll(async () => { f = await createWorkFixture(); }, 60000); afterAll(async () => closeWorkFixture(f));
 it("all nine card figures survive persisted issue", async () => {
  const actual: number[] = [];
  for (const [plan, profile] of [["Solo", [1,1,1,2,2,2,2,2,2,3,3,4]], ["Builder", [3,4,4,4,4,5,5,5,5,6,6,7]]] as const) {
   const a = await meterCompany(f); await historicalAgreement(f, a, plan, "2026-01-01"); let total = 0;
   for (let month = 1; month <= 12; month++) {
    const input = calendarInput(a.tenantId, profile[month - 1]!, month);
    await storeMeter(f, a, input); total += (await issue(f, a, input.startDate)).amountPence;
   }
   actual.push(total);
  }
  for (const [plan, places, activeDays, upgraded] of [["Builder",8,30,false],["Builder",8,15,false],["Builder",12,30,false],["Solo",5,30,false],["Solo",6,30,false],["Solo",6,30,true],["Builder",8,1,false]] as const) {
   const a = await meterCompany(f), month = activeDays === 1 ? 10 : 9;
   const input = calendarInput(a.tenantId, places, month); await historicalAgreement(f, a, plan);
   if (activeDays < 30) input.days.slice(activeDays).forEach(day => { day.jobs = day.jobs.slice(0, 7); });
   let revision = 1;
   if (upgraded) {
    await command(f, a, { ...terms(a, "Builder", 1), kind: "change" }); revision = 2;
    await workTenant(f.admin, a.tenantId, async db => { await db.query("SET LOCAL session_replication_role='replica'"); await db.query("UPDATE app.subscription_agreement_revision SET effective_date='2026-09-11' WHERE tenant_id=$1 AND revision=2", [a.tenantId]); });
   }
   await storeMeter(f, a, input); actual.push((await issue(f, a, input.startDate, revision)).amountPence);
  }
  expect(actual).toEqual([34800,82800,8900,7900,16900,4900,4900,6233,6965]);
 });
 it("fresh connection reads accepted effective terms", async () => {
  const a = await meterCompany(f); await command(f, a, terms(a));
  const client = await f.runtime.connect();
  try {
   await client.query("BEGIN"); await client.query("SELECT set_config('app.tenant_id',$1,true)", [a.tenantId]);
   const read = (await client.query("SELECT app.mon2_read($1,$2) result", [a.tenantId, a.digest])).rows[0].result;
   expect(read.agreements).toHaveLength(1); expect(read.agreements[0]).toMatchObject({ plan: "Builder", cadence: "monthly", revision: 1 });
  } finally { await client.query("ROLLBACK"); client.release(); }
 });
 it("pending downgrade waits and rechecks capacity", async () => {
  const a = await meterCompany(f); await historicalAgreement(f, a);
  const changed = await command(f, a, { ...terms(a, "Solo", 1), kind: "change" });
  expect((await readSubscription(f, a)).agreements).toHaveLength(1);
  const changes = await rows(f, a, "subscription_plan_change"); expect(changes).toHaveLength(1);
  const scheduledDate = String(changes[0].effective_date);
  const futureInput = calendarInput(a.tenantId, 6, Number(scheduledDate.slice(5, 7)), Number(scheduledDate.slice(0, 4)));
  const futureSource = await storeMeter(f, a, futureInput);
  await expect(command(f, a, { version: "subscription-command.v1", kind: "apply_change", changeId: changed.changeId, sourceId: futureSource, expectedRevision: 1 })).rejects.toThrow();
  const input = calendarInput(a.tenantId, 6, 9);
  const sourceId = await storeMeter(f, a, input);
  // Synthetic fixture brings the scheduled boundary into the past; no runtime time override exists.
  await workTenant(f.admin, a.tenantId, async db => { await db.query("SET LOCAL session_replication_role='replica'"); await db.query("UPDATE app.subscription_plan_change SET effective_date='2026-09-01' WHERE tenant_id=$1", [a.tenantId]); });
  const refusal = await command(f, a, { version: "subscription-command.v1", kind: "apply_change", changeId: changed.changeId, sourceId, expectedRevision: 1 });
  expect(refusal.outcome).toBe("refused_capacity"); expect((await readSubscription(f, a)).agreements).toHaveLength(1);
 });
 it.each(["expired session", "revoked session", "revoked membership"] as const)("due downgrade after %s rechecks the approving owner independently of the executing admin", async (invalidated) => {
  const a = await meterCompany(f); await historicalAgreement(f, a);
  const changed = await command(f, a, { ...terms(a, "Solo", 1), kind: "change" });
  // Assert the actual scheduled authorization horizon before bringing the boundary forward.
  const horizon = (await f.admin.query(`SELECT au.expires_at =
   (app.mon2_boundary((date_trunc('month',c.effective_date)+interval '1 month')::date,1)::timestamp AT TIME ZONE 'Europe/London') boundary_expiry,
   au.expires_at > s.expires_at survives_session
   FROM app.subscription_plan_change c JOIN app.action_authorization au ON (au.tenant_id,au.id)=(c.tenant_id,c.authorization_id)
   JOIN identity.session s ON s.id=$2 WHERE c.tenant_id=$1 AND c.id=$3`, [a.tenantId, a.sessionId, changed.changeId])).rows[0];
  expect(horizon).toEqual({ boundary_expiry: true, survives_session: true });
  const sourceId = await storeMeter(f, a, calendarInput(a.tenantId, 5, 9));
  // Separate current admin: revoking the approving owner must reach the durable
  // authorization check, rather than fail authentication of the executor.
  const executor = await seedWorkJob(f, a.tenantId), sessionId = randomUUID();
  const digest = createHash("sha256").update(randomUUID()).digest("hex");
  await workTenant(f.admin, a.tenantId, async db => {
   const user = (await db.query("UPDATE app.membership SET role='admin' WHERE tenant_id=$1 AND id=$2 RETURNING identity_user_id", [a.tenantId, executor.actorId])).rows[0].identity_user_id;
   await db.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)", [`${randomUUID()}@meter.invalid`, user]);
   await db.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3)", [user, a.tenantId, executor.actorId]);
   await db.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES($1,$2,'synthetic_demo',$3,$4,clock_timestamp()+interval '1 hour')", [sessionId, user, digest, randomUUID()]);
   if (invalidated === "expired session") await db.query("UPDATE identity.session SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [a.sessionId]);
   else if (invalidated === "revoked session") await db.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1", [a.sessionId]);
   else await db.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [a.tenantId, a.actorId]);
   // Admin-only historical fixture; no runtime clock override or authorization edit.
   await db.query("SET LOCAL session_replication_role='replica'");
   await db.query("UPDATE app.subscription_plan_change SET effective_date='2026-09-01' WHERE tenant_id=$1 AND id=$2", [a.tenantId, changed.changeId]);
  });
  const fresh = { ...executor, digest, sessionId };
  const revoked = invalidated === "revoked membership";
  expect(await command(f, fresh, { version: "subscription-command.v1", kind: "apply_change", changeId: changed.changeId, sourceId, expectedRevision: 1 }))
   .toMatchObject({ outcome: revoked ? "refused_authority" : "applied", revision: revoked ? 1 : 2 });
  expect((await readSubscription(f, fresh)).agreements).toHaveLength(revoked ? 1 : 2);
 });
 it("source replay defeats corrupted cached totals", async () => {
  const a = await meterCompany(f); await historicalAgreement(f, a); const input = meterInput(a.tenantId);
  input.days.forEach(day => { day.plan = "Solo"; day.annualPrepaid = true; day.trial = true; });
  await storeMeter(f, a, input); await refreshMeter(f, a);
  await workTenant(f.admin, a.tenantId, async db => {
   await db.query("SET LOCAL session_replication_role='replica'");
   await db.query("UPDATE app.meter_computation SET principal_pence=1,result='{}' WHERE tenant_id=$1", [a.tenantId]);
   await db.query("UPDATE app.meter_day_ledger SET day=jsonb_set(day,'{countedPlaces}','0') WHERE tenant_id=$1", [a.tenantId]);
  });
  expect((await issue(f, a)).amountPence).toBe(8900);
 });
 it("issued periods and allocations never change", async () => {
  const { a } = await preparedPeriod(f), before = await rows(f, a, "subscription_period");
  for (const table of ["subscription_period", "subscription_period_line", "subscription_place_binding", "platform_statement", "platform_statement_line"]) {
   await expect(f.admin.query(`DELETE FROM app.${table} WHERE tenant_id=$1`, [a.tenantId])).rejects.toThrow();
  }
  expect(await rows(f, a, "subscription_period")).toEqual(before);
 });
 it("a due downgrade applies only after a fresh fitting capacity check", async () => {
  const a=await meterCompany(f); await historicalAgreement(f,a);
  const changed=await command(f,a,{...terms(a,"Solo",1),kind:"change"});
  const sourceId=await storeMeter(f,a,calendarInput(a.tenantId,5,9));
  await expect(command(f,a,{version:"subscription-command.v1",kind:"apply_change",changeId:changed.changeId,sourceId,expectedRevision:1})).rejects.toThrow();
  await workTenant(f.admin,a.tenantId,async db=>{
   await db.query("SET LOCAL session_replication_role='replica'");
   await db.query("UPDATE app.subscription_plan_change SET effective_date='2026-09-01' WHERE tenant_id=$1",[a.tenantId]);
  });
  expect(await command(f,a,{version:"subscription-command.v1",kind:"apply_change",changeId:changed.changeId,sourceId,expectedRevision:1})).toMatchObject({outcome:"applied",revision:2});
  expect((await readSubscription(f,a)).agreements).toHaveLength(2);
 });

});
