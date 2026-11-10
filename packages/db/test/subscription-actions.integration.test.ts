import { pauseCommercialOutbound } from "./commercial-outbound-pause-fixture.js";
import { assertLp4SealedEvents } from "./lp4-writer-catchup-fixture.js";
import { SubscriptionExecutor } from "../src/subscription-executor.js";
import { subscriptionConsentText } from "@jobguard/core";
import { IdentityRepository, SubscriptionRepository, SubscriptionPersistenceError } from "../src/index.js";
import { PersistedAuthProvider } from "../../../apps/api/src/auth/persisted-auth-provider.js";
import { SubscriptionApplication } from "../../../apps/api/src/subscription.application.js";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createWorkFixture, closeWorkFixture, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { command, count, historicalAgreement, meterCompany, preparedPeriod, readSubscription, storeMeter, calendarInput, terms } from "./subscription-persistence-fixtures.js";

describe("MON-2A C2/C3 billing action races", () => {
 let f: WorkFixture;
 beforeAll(async () => { f=await createWorkFixture(true, "jobguard_synthetic_demo"); },60000);
 afterAll(async () => closeWorkFixture(f));
 it("M0-13a pause refuses subscription execution without consuming queued work, then resumes one effect",async()=>{
  const {a,issued}=await preparedPeriod(f);
  const approved=await command(f,a,{version:"subscription-command.v1",kind:"approve_simulation",statementId:issued.statementId,contentHash:issued.artifactHash,amountPence:issued.amountPence,expectedRevision:1});
  const before=await readSubscription(f,a),context=a.context;
  let calls=0;
  const executor=new SubscriptionExecutor(new SubscriptionRepository(f.runtime),{
   async execute(work){calls++;return {version:"subscription-simulated-result.v1" as const,synthetic:true as const,workId:work.workId,resultId:randomUUID(),outcome:"settled" as const};},
   async reconcile(){throw new Error("unexpected reconciliation");},
  });
  const commandId=randomUUID();
  const resume = await pauseCommercialOutbound(f.admin);
  try{
   await expect(executor.execute(context,a.digest,commandId,approved.workId,1)).rejects.toThrow("SUBSCRIPTION_UNAVAILABLE");
   expect(calls).toBe(0);expect(await readSubscription(f,a)).toEqual(before);
  }finally{await resume();}
  await executor.execute(context,a.digest,commandId,approved.workId,1);
  await expect(executor.execute(context,a.digest,commandId,approved.workId,1)).rejects.toThrow("SUBSCRIPTION_UNAVAILABLE");
  const after=await readSubscription(f,a);
  expect(calls).toBe(1);expect(after.attempts).toHaveLength(1);expect(after.results).toHaveLength(1);
 });
 it("public terms hash matches SQL and payment replay produces one durable settlement",async()=>{
  const {a,issued}=await preparedPeriod(f);
  const provider=new PersistedAuthProvider(new IdentityRepository(f.admin),"synthetic-subscription-key-with-32-characters");
  const token=randomUUID(),csrfToken="c".repeat(32),digest=provider.digest(`session:${token}`),origin="https://jobguard.invalid";
  await f.admin.query("UPDATE identity.session SET token_digest=$2,csrf_token=$3 WHERE id=$1",[a.sessionId,digest,csrfToken]);
  const company={...a,digest};
  const app=new SubscriptionApplication({provider,allowedOrigin:origin,environment:()=>"synthetic_demo",
   resolve:async()=>({credentials:{sessionToken:token,csrfToken,origin,tenantHeader:a.tenantId},digest})},new SubscriptionRepository(f.runtime));
  const action={version:"subscription-command.v1",kind:"approve_simulation",statementId:issued.statementId,contentHash:issued.artifactHash,amountPence:issued.amountPence,expectedRevision:1};
  const id=randomUUID(),first=await app.command({},id,action);
  expect(await app.command({},id,action)).toEqual(first);
  await expect(app.command({},randomUUID(),action)).rejects.toMatchObject({
   name:"SubscriptionPersistenceError",code:"SUBSCRIPTION_STATEMENT_ALREADY_APPROVED",
  });
  expect(await app.command({},id,action)).toEqual(first);
  const saved=await readSubscription(f,company);
  expect(saved.work).toHaveLength(1);expect(saved.attempts).toHaveLength(1);expect(saved.results).toHaveLength(1);
 await assertLp4SealedEvents(f.admin, a.tenantId, "subscription.approve_simulation");
  expect(saved.results[0].outcome).toBe("settled");
  const b=await meterCompany(f),tokenB=randomUUID(),digestB=provider.digest(`session:${tokenB}`);
  await f.admin.query("UPDATE identity.session SET token_digest=$2,csrf_token=$3 WHERE id=$1",[b.sessionId,digestB,csrfToken]);
  const other=new SubscriptionApplication({provider,allowedOrigin:origin,environment:()=>"synthetic_demo",
   resolve:async()=>({credentials:{sessionToken:tokenB,csrfToken,origin,tenantHeader:b.tenantId},digest:digestB})},new SubscriptionRepository(f.runtime));
  const {contentHash:_hash,...selection}=terms(b,"Solo");
  await other.command({},randomUUID(),{...selection,consentText:subscriptionConsentText});
  expect((await readSubscription(f,{...b,digest:digestB})).agreements[0].maximum_pence).toBe(4900);
  await expect(other.command({},randomUUID(),action)).rejects.toThrow("SUBSCRIPTION_FORBIDDEN");
 });
 it("two concurrent upgrades at one revision have one winner",async()=>{
  const a=await meterCompany(f);await historicalAgreement(f,a,"Solo");
  const action={...terms(a,"Builder",1),kind:"change"};
  const results=await Promise.allSettled([command(f,a,action),command(f,a,action)]);
  expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
  expect(results.filter(r=>r.status==="rejected")).toHaveLength(1);
  expect(await count(f,a,"subscription_agreement_revision")).toBe(2);
 });
 it("a replayed downgrade creates one pending change and cannot apply before its boundary",async()=>{
  const a=await meterCompany(f);await historicalAgreement(f,a);
  const action={...terms(a,"Solo",1),kind:"change"},id=randomUUID();
  const results=await Promise.all([command(f,a,action,id),command(f,a,action,id)]);
  expect(results[0]).toEqual(results[1]);expect(await count(f,a,"subscription_plan_change")).toBe(1);
  const day=results[0].effectiveDate as string;
  const sourceId=await storeMeter(f,a,calendarInput(a.tenantId,4,Number(day.slice(5,7)),Number(day.slice(0,4))));
  await expect(command(f,a,{version:"subscription-command.v1",kind:"apply_change",changeId:results[0].changeId,sourceId,expectedRevision:1})).rejects.toThrow("SUBSCRIPTION_CHANGE_NOT_DUE");
 });
 it("due downgrade apply racing an upgrade preserves one authoritative revision",async()=>{
  const a=await meterCompany(f);await historicalAgreement(f,a);
  const pending=await command(f,a,{...terms(a,"Solo",1),kind:"change"});
  const sourceId=await storeMeter(f,a,calendarInput(a.tenantId,4,9));
  await workTenant(f.admin,a.tenantId,async db=>{
   await db.query("SET LOCAL session_replication_role='replica'");
   await db.query("UPDATE app.subscription_plan_change SET effective_date='2026-09-01' WHERE tenant_id=$1",[a.tenantId]);
  }, { membershipId: a.actorId });
  const results=await Promise.allSettled([
   command(f,a,{version:"subscription-command.v1",kind:"apply_change",changeId:pending.changeId,sourceId,expectedRevision:1}),
   command(f,a,{...terms(a,"Builder",1),kind:"change"}),
  ]);
  expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
  const saved=await readSubscription(f,a);
  expect(saved.agreements.map((r:{revision:number})=>r.revision).sort()).toEqual([1,2]);
 });
 it("simultaneous payment approvals cannot duplicate work and foreign statements refuse",async()=>{
  const {a,issued}=await preparedPeriod(f),b=await meterCompany(f);
  await command(f,b,terms(b));
  const action={version:"subscription-command.v1",kind:"approve_simulation",statementId:issued.statementId,contentHash:issued.artifactHash,amountPence:issued.amountPence,expectedRevision:1};
  await expect(command(f,b,action)).rejects.toThrow();
  const results=await Promise.allSettled([command(f,a,action),command(f,a,action)]);
  expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
  expect(await count(f,a,"subscription_simulated_work")).toBe(1);
  const workId=(await readSubscription(f,a)).work[0].id;
  const claims=await Promise.allSettled([1,2].map(()=>command(f,a,{version:"subscription-command.v1",kind:"execute_simulation",workId,expectedRevision:1})));
  expect(claims.filter(r=>r.status==="fulfilled")).toHaveLength(1);
  expect(await count(f,a,"subscription_simulated_attempt")).toBe(1);
 });
});

// Driver errors are injected here only to exercise the narrow error boundary without PostgreSQL.
// The billing action case above proves the actual constraint and rollback on PostgreSQL.
describe("subscription constraint classification", () => {
 it.each([
  ["23505", "subscription_simulated_work_tenant_id_statement_id_key", "SUBSCRIPTION_STATEMENT_ALREADY_APPROVED"],
  ["23505", "subscription_simulated_work_pkey", "SUBSCRIPTION_UNAVAILABLE"],
  ["23505", undefined, "SUBSCRIPTION_UNAVAILABLE"],
  ["08006", "subscription_simulated_work_tenant_id_statement_id_key", "SUBSCRIPTION_UNAVAILABLE"],
 ])("maps %s / %s to %s", async (code, constraint, expected) => {
  const error=Object.assign(new Error("private database details"),{code,constraint});
  const pool={connect:async()=>{throw error;}};
  const repository=new SubscriptionRepository(pool as unknown as ConstructorParameters<typeof SubscriptionRepository>[0]);
  await expect(repository.read(testTenantContext("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),"a".repeat(64)))
   .rejects.toEqual(new SubscriptionPersistenceError(expected as SubscriptionPersistenceError["code"]));
 });
});
