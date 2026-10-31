import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { AdoptInFlightJobMutation } from "../src/job-import-repository.js";
import { UserCommandDispatcher } from "../src/commands.js";
import { JobWorkStateRepository } from "../src/job-work-state-repository.js";
import { FinalAccountLockRepository } from "../src/final-account-lock-repository.js";
import { createWorkFixture, closeWorkFixture, seedWorkJob, workTenant, insertPhoto, prepareWorkAccount, type WorkFixture } from "./job-work-state-fixtures.js";
import { meterCompany, terms, command as subscription } from "./subscription-persistence-fixtures.js";
import { activateMeterJob } from "./meter-journey-fixtures.js";
let f: WorkFixture;
beforeAll(async()=>{ f=await createWorkFixture(); },60000);
afterAll(async()=>closeWorkFixture(f));
it("a real term-less adoption cannot roll back subscribe, upgrade, finish, close, site activity or a final lock; classified imports no longer block new admission",async()=>{
 const a=await meterCompany(f); await activateMeterJob(f,a);
 const parties=(await f.admin.query(`SELECT b.customer_revision_id customer,b.site_revision_id site FROM app.job_party_binding b
 JOIN app.job_party_current c ON(c.tenant_id,c.binding_id)=(b.tenant_id,b.id) WHERE b.tenant_id=$1 AND b.job_id=$2`,[a.tenantId,a.jobId])).rows[0];
 const imported=randomUUID(), hash="e".repeat(64), policy="synthetic_import_terms_candidate.v1";
 const action={actionType:"job.adopt_in_flight",recipient:null,contentHash:hash,aggregateRevision:0,amountPence:100000,currency:"GBP" as const,policyVersion:policy,expiresAt:new Date(Date.now()+60000)};
 await new UserCommandDispatcher(f.runtime).dispatch(a.context,{
  version:"command.v1",commandId:randomUUID(),commandType:"job.adopt_in_flight",semanticKey:`import:${imported}`,actorMembershipId:a.actorId,subjectType:"job",subjectRef:imported,action,
 },new AdoptInFlightJobMutation(a.tenantId,"synthetic_candidate",{
  version:"adopt-job.v1",jobId:imported,baselineId:randomUUID(),title:"Fictional term-less import",lifecyclePoint:"live",provenance:"imported",lineageStrength:"builder_attested_weaker",
  baselineHash:hash,baselineDescription:"Fictional baseline",acceptedNetValuePence:100000,recoveryCapPence:1500,acceptedValueSource:"builder_attestation",attestedByMembershipId:a.actorId,attestedAt:new Date(0),importTermsVersion:policy,feePolicyVersion:"reference_fee_policy_v1",mode:"synthetic_candidate",parties:{customerRevisionId:parties.customer,siteRevisionId:parties.site},
 }));
 expect((await f.admin.query("SELECT count(*)::int n FROM app.job_activation_terms WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,imported])).rows[0].n).toBe(0);
 const acceptedTerms=terms(a,"Solo");
 const accepted=await subscription(f,a,acceptedTerms); expect(accepted.revision).toBe(1);
 // Upgrade the plan without requesting a billing re-anchor (held by MON-2A).
 const upgraded=await subscription(f,a,{...terms(a,"Builder",1,acceptedTerms.anchorDay),kind:"change"}); expect(upgraded.revision).toBe(2);
 expect((await f.admin.query("SELECT plan FROM app.subscription_agreement_revision WHERE tenant_id=$1 ORDER BY revision",[a.tenantId])).rows).toEqual([{plan:"Solo"},{plan:"Builder"}]);
 const importedScope=randomUUID();
 await workTenant(f.admin,a.tenantId,db=>db.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')",[importedScope,a.tenantId,imported]));
 const importedJob={...a,jobId:imported,scopeId:importedScope};
 await insertPhoto(f,importedJob,new Date().toISOString());
 await insertPhoto(f,importedJob,new Date().toISOString()); // term-less imported activity is recordable too
 const work=new JobWorkStateRepository(f.runtime);
 await insertPhoto(f,a,new Date().toISOString());
 const finish={version:"job-work-state-command.v1",commandId:randomUUID(),expectedRevision:1,action:"finish"};
 const finished=await work.command(a.context,a.jobId,a.actorId,finish);
 expect(finished.events.at(-1)?.kind).toBe("finished_on_site");
 expect(await work.command(a.context,a.jobId,a.actorId,finish)).toEqual(finished);
 await insertPhoto(f,a,new Date().toISOString()); // continuing activity, not a new place
 const closed=await work.command(a.context,imported,a.actorId,{version:"job-work-state-command.v1",commandId:randomUUID(),expectedRevision:2,action:"close",reason:"other",note:"Fictional imported work stopped"});
 expect(closed.events.at(-1)?.kind).toBe("closed");
 // A legacy import has no activation terms even after closing; keep it live in
 // the other regression checks and prove explicit admission never uses zero.
 const fresh=await seedWorkJob(f,a.tenantId); await activateMeterJob(f,fresh);
 await expect(work.command(fresh.context,fresh.jobId,fresh.actorId,{version:"job-work-state-command.v1",commandId:randomUUID(),expectedRevision:0,action:"resume"})).resolves.toBeDefined();
 const account=await prepareWorkAccount(f,a), lock=new FinalAccountLockRepository(f.runtime);
 await lock.acceptTerms(a.context,{actorMembershipId:a.actorId,commandId:randomUUID(),termsVersion:"synthetic_final_check_terms.v1"});
 await lock.disposition(a.context,{jobId:a.jobId,actorMembershipId:a.actorId,commandId:randomUUID(),scopeItemId:a.scopeId,disposition:"done"});
 // Deliberately bypass withTenant: the checked SQL entrypoint must acquire 184
 // before any business lock for callers that use only transaction-local context.
 const locked=await workTenant(f.runtime,a.tenantId,db=>db.query("SELECT app.lock_final_account($1,$2,$3,$4,$5,1,'final_account_declaration.v1')",[a.tenantId,a.jobId,a.actorId,randomUUID(),account.revisionId]));
 const definition=(await f.admin.query("SELECT pg_get_functiondef('app.lock_final_account(uuid,uuid,uuid,uuid,uuid,integer,text)'::regprocedure) definition")).rows[0].definition;
 expect(definition.indexOf("pg_advisory_xact_lock")).toBeLessThan(definition.indexOf("FOR UPDATE"));
 expect(locked).toBeDefined();
 expect((await f.admin.query("SELECT count(*)::int n FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows[0].n).toBe(1);
 const foreign=await meterCompany(f);
 await expect(work.command(foreign.context,imported,foreign.actorId,finish)).rejects.toThrow("WORK_STATE_FORBIDDEN");
 expect(await workTenant(f.admin,a.tenantId,async db=>{
  await db.query("SET LOCAL ROLE jobguard_migration"); return (await db.query("SELECT (app.mon1_refresh_work_ledger($1)).source_hash hash",[a.tenantId])).rows[0].hash;
 })).toMatch(/^[a-f0-9]{64}$/u);
});
