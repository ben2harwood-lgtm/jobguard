// Real PostgreSQL integration coverage, run in CI with the merged migrations and repositories.
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { migrate, MIGRATION_URLS, issuePracticeSession, authenticatePracticeSession, practiceMaterialPool, RecoveryCaseRepository, RecoveryEligibilityV3Repository, PracticeFeedRepository, readRecoveryEligibilityV3, withTenant } from "../src/index.js";
import { DEMO_TENANT_ID as T, DEMO_ACCOUNT_ID as A, DEMO_MEMBERSHIP_ID as M, DEMO_IDENTITY_USER_ID as U } from "../src/demo-seed.js";
import { appendAuditBatch } from "../src/audit.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";
import * as mo4Proof from "./upgrade-proof-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import type { TenantTransaction } from "../src/tenant-context.js";
import { evaluateRecoveryEligibilityV3 } from "@jobguard/core";
const ctx=testTenantContext(T), actor={membershipId:M,identityUserId:U};
let postgres:EmbeddedPostgres,admin:Pool,runtime:Pool,directory:string;
const previousEnvironment=process.env.JOBGUARD_ENV;
let legacy:unknown[];
const oldJob=randomUUID(),oldCase=randomUUID();
let upgradeProof: { proof: Awaited<ReturnType<typeof mo4Proof.proofBefore>>; ownRegistry: string[]; ownRows: unknown[]; controls: Array<{ table: string; microsecond: unknown; missing: unknown; retype: unknown; listRetype: unknown; nullable: unknown; replaced: unknown; inserted: unknown; after: unknown; columns: unknown }>; afterControls: Awaited<ReturnType<typeof mo4Proof.proofDifferences>> };
beforeAll(async()=>{
 process.env.JOBGUARD_ENV="synthetic_demo";directory=await mkdtemp(join(tmpdir(),"jg-ch7-"));const port=await freePort(60500,150);
 postgres=new EmbeddedPostgres({databaseDir:directory,port,user:"postgres",password:"synthetic",persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C","--encoding=UTF8"],onLog:()=>undefined});await postgres.initialise();await postgres.start();
 admin=new Pool({host:"127.0.0.1",port,database:"postgres",user:"postgres",password:"synthetic"});
 await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
 const index=MIGRATION_URLS.findIndex(u=>basename(fileURLToPath(u))==="0119_recovery_eligibility_v3.sql");expect(index).toBeGreaterThan(MIGRATION_URLS.findIndex(u=>basename(fileURLToPath(u))==="0112_recovery_follow_up.sql"));
 const names=MIGRATION_URLS.map(u=>basename(fileURLToPath(u)));expect(names).toEqual([...names].sort());
 for(const url of MIGRATION_URLS.slice(0,index)){await admin.query(await readFile(url,"utf8"));await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name)VALUES($1)",[basename(fileURLToPath(url))]);}
 await admin.query("INSERT INTO control_plane.tenant(id)VALUES($1)",[T]);await admin.query("INSERT INTO identity.identity_user(id)VALUES($1)",[U]);await admin.query("INSERT INTO app.account(id,tenant_id,name)VALUES($1,$2,'CH-7 synthetic')",[A,T]);await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)VALUES($1,$2,$3,$4,'owner')",[M,T,A,U]);
 await admin.query("INSERT INTO app.job(id,tenant_id,title)VALUES($1,$2,'Previous schema')",[oldJob,T]);
 await admin.query("INSERT INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic)VALUES($1,$2,$3,32000,'GBP','identified',0,true)",[oldCase,T,oldJob]);
 await admin.query(`INSERT INTO app.recovery_eligibility_revision(id,tenant_id,job_id,case_id,revision,case_revision,evidence_revision,policy_version,policy_revision,scenario,classification,eligible_net_pence,currency,reason,citations,status,reviewer_ref,command_id,subject_hash)VALUES($1,$2,$3,$4,1,1,1,'reference-d03.v1',1,'pending_money','excluded',NULL,'GBP','Pending money cannot qualify','[]','reviewed','reviewer:previous',$5,$6)`,[randomUUID(),T,oldJob,oldCase,randomUUID(),"a".repeat(64)]);
 legacy=(await admin.query("SELECT row_to_json(r)::text bytes FROM app.recovery_eligibility_revision r")).rows;
 const proof = await mo4Proof.proofBefore(admin, ["app.recovery_eligibility_revision"]);
 await admin.query(await readFile(MIGRATION_URLS[index]!, "utf8"));
 await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [names[index]]);
 const ownRegistry = (await admin.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(row => row.migration_name as string);
 const ownRows = (await admin.query("SELECT row_to_json(r)::text bytes FROM app.recovery_eligibility_revision r")).rows;
 const controls = [];
 for (const [table, was] of Object.entries(proof)) {
   const identity = Object.keys(was.rows)[0];
   if (!identity) continue; // The pre-existing-row guard reports this in the proof test.
   const key = JSON.parse(identity) as { tenant_id: string; id: string };
   const values = [key.tenant_id, key.id];
   const time = "created_at", column = "reason", newType = "character varying(201)", scratchTable = table;
   const microsecond = await mo4Proof.rolledBack(admin, async client => {
     await client.query("SET LOCAL session_replication_role=replica");
     const changed = await client.query(`UPDATE ${table} SET ${time}=${time}+interval '1 microsecond' WHERE (tenant_id=$1) AND (id=$2)`, values);
     return { count: changed.rowCount, differences: await mo4Proof.proofDifferences(client, proof) };
   });
   const missing = await mo4Proof.rolledBack(admin, async client => {
     await client.query("SET LOCAL session_replication_role=replica");
     const changed = await client.query(`DELETE FROM ${table} WHERE (tenant_id=$1) AND (id=$2)`, values);
     return { count: changed.rowCount, differences: await mo4Proof.proofDifferences(client, proof) };
   });
   const retype = await mo4Proof.rolledBack(admin, async client => {
     await client.query("SET LOCAL session_replication_role=replica");
     await client.query(`ALTER TABLE ${table} ALTER COLUMN ${column} TYPE ${newType}`);
     return await mo4Proof.proofDifferences(client, proof);
   });
   const listRetype = await mo4Proof.rolledBack(admin, async client => {
     await client.query("SET LOCAL session_replication_role=replica");
     return await mo4Proof.proofDifferences(client, { ...proof, [table]: { ...was, typed: { ...was.typed, [column]: `${was.typed[column]} mo4 scratch` } } });
   });
   const nullable = await mo4Proof.rolledBack(admin, async client => {
     await client.query("SET LOCAL session_replication_role=replica");
     await client.query(`ALTER TABLE ${scratchTable} ADD COLUMN mo4_scratch text`);
     return { exists: (await mo4Proof.proofColumns(client, scratchTable)).some(c => c.name === "mo4_scratch" && c.type === "text"), differences: await mo4Proof.proofDifferences(client, proof) };
   });
   const replaced = await mo4Proof.rolledBack(admin, async client => {
     await client.query("SET LOCAL session_replication_role=replica");
     return { replaced: await mo4Proof.scratchReplaceFunction(client, "app.half_even_ratio(bigint,bigint,bigint)"), differences: await mo4Proof.proofDifferences(client, proof) };
   });
   const inserted = await mo4Proof.rolledBack(admin, async client => {
     await client.query("SET LOCAL session_replication_role=replica");
     const changed = await client.query(`INSERT INTO app.recovery_eligibility_revision(id,tenant_id,job_id,case_id,revision,case_revision,evidence_revision,policy_version,policy_revision,scenario,classification,eligible_net_pence,currency,reason,citations,status,reviewer_ref,command_id,subject_hash)VALUES($1,$2,$3,$4,2,1,1,'reference-d03.v1',1,'pending_money','excluded',NULL,'GBP','Pending money cannot qualify','[]','reviewed','reviewer:previous',$5,$6)`,[randomUUID(),T,oldJob,oldCase,randomUUID(),"a".repeat(64)]);
     return { count: changed.rowCount, differences: await mo4Proof.proofDifferences(client, proof) };
   });
   controls.push({ table, microsecond, missing, retype, listRetype, nullable, replaced, inserted, after: await mo4Proof.proofDifferences(admin, proof), columns: await mo4Proof.proofColumns(admin, table) });
 }
 upgradeProof = { proof, ownRegistry, ownRows, controls, afterControls: await mo4Proof.proofDifferences(admin, proof) };
 await migrate(admin);await migrate(admin);
 await admin.query("CREATE ROLE ch7_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;GRANT jobguard_runtime TO ch7_login");runtime=new Pool({host:"127.0.0.1",port,database:"postgres",user:"ch7_login",password:"synthetic"});
});
afterAll(async()=>{if(previousEnvironment===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=previousEnvironment;await closeTestPools(runtime,admin);await postgres?.stop();if(directory)await rm(directory,{recursive:true,force:true});});
async function fixture(type="withheld_customer_payment",before=false){
 const sessionId=await issuePracticeSession(runtime),auth=await authenticatePracticeSession(runtime,sessionId),jobId=randomUUID();
 await admin.query("INSERT INTO app.job(id,tenant_id,title,practice_session_digest,practice_scenario)VALUES($1,$2,'CH-7 generated job',$3,'capture')",[jobId,T,auth.digest]);
 const cases=new RecoveryCaseRepository(practiceMaterialPool(runtime,auth.digest)),feed=new PracticeFeedRepository(runtime,"synthetic_demo");let revision=0;
 const advance=async(movement:string,step="settled")=>{const reply=await feed.command(ctx,actor,auth.digest,jobId,{version:"practice-feed-command.v1",commandId:randomUUID(),expectedRevision:revision,action:revision===0?"connect":"advance",...(revision===0?{}:{movement,step})});revision=reply.revision;};
 await advance("receipt-384");if(before)await advance("receipt-384");
 const c=await cases.command(ctx,jobId,{version:"recovery-case-command.v1",commandId:randomUUID(),action:"open",caseType:type,claimedNetPence:300000,counterparty:"Fictional debtor",book:type==="withheld_customer_payment"?"builder_customer":"supplier_cost",sourceType:type==="withheld_customer_payment"?"customer_invoice":"supplier_documents",sourceRefs:type==="withheld_customer_payment"?["Generated customer invoice INV-18800"]:["Supplier invoice INV-320"],expectedRevision:0},actor);
 return {auth,jobId,c,cases,advance,repo:new RecoveryEligibilityV3Repository(practiceMaterialPool(runtime,auth.digest),"synthetic_demo")};
}
const review=(c:{id:string;revision:number},fixture:string,expectedReviewRevision=0)=>({version:"recovery-eligibility-command.v3",action:"review",commandId:randomUUID(),caseId:c.id,expectedCaseRevision:c.revision,expectedReviewRevision,fixture});
it.each([["F15","merchant_overcharge",0,"Credit note below the £250 minimum"],["F17","duplicate_supplier_payment",45000,null],["F18","withheld_customer_payment",262000,"Fixed statutory compensation is not part of the fee base"],["F19","withheld_customer_payment",250000,"Fixed statutory compensation is not part of the fee base"],["F20","withheld_customer_payment",0,"Paid before you opened this case"],["F21","merchant_overcharge",0,null],["F22","prevention",0,"Prevented spending is not recovered cash"]] as const)("DW1 %s uses M4-7-S facts and persists exact Q/reason",async(name,type,q,reason)=>{
 const f=await fixture(type,name==="F20");if(name!=="F20"&&name!=="F15")await f.advance(name==="F17"?"supplier-refund-540":"receipt-3000");
 const command=review(f.c,name),r=await f.repo.review(ctx,f.jobId,command,actor,f.auth.digest);
 expect(r.result).toMatchObject({qualifyingPrincipal:{pence:q,currency:"GBP"},reason,outcome:q>0?"eligible_for_review":"excluded",terminal:name==="F22",productionEnabled:false});
 if(["F15","F21","F22"].includes(name))expect(r.sourceEventId).toBeNull();
 else expect((await admin.query("SELECT tenant_id,job_id,event_kind,movement_key,gross_pence FROM app.practice_feed_event WHERE tenant_id=$1 AND id=$2",[T,r.sourceEventId])).rows).toEqual([{tenant_id:T,job_id:f.jobId,event_kind:"settled",movement_key:name==="F17"?"supplier-refund-540":name==="F20"?"receipt-384":"receipt-3000",gross_pence:name==="F17"?"54000":name==="F20"?"38400":"300000"}]);
 const rows=(await f.cases.listForMember(ctx,f.jobId,actor));expect(rows.find(c=>c.id===f.c.id)?.eligibilityV3).toEqual(r);
 expect(await f.repo.review(ctx,f.jobId,command,actor,f.auth.digest)).toEqual(r);
 await expect(f.repo.review(ctx,f.jobId,{...command,fixture:name==="F18"?"F19":"F18"},actor,f.auth.digest)).rejects.toThrow("IDEMPOTENCY_PAYLOAD_CONFLICT");
 if(name==="F18"||name==="F19"){
  const lines=(await admin.query("SELECT kind,debtor_type,net_pence FROM app.recovery_claim_line WHERE tenant_id=$1 AND case_id=$2 ORDER BY kind",[T,f.c.id])).rows;
  expect(lines).toEqual([{kind:"fixed_compensation",debtor_type:name==="F19"?"individual":"business",net_pence:"7000"},{kind:"principal",debtor_type:name==="F19"?"individual":"business",net_pence:"250000"},{kind:"statutory_interest",debtor_type:name==="F19"?"individual":"business",net_pence:"12000"}]);
 }
 expect((await admin.query("SELECT count(*)::int n FROM app.recovery_fee_journal WHERE tenant_id=$1 AND job_id=$2",[T,f.jobId])).rows[0].n).toBe(0);
});
it("DW4 migration preserves previous reviews byte-for-byte and version",async()=>{
 const { proof } = upgradeProof;
 expect(Object.keys(proof["app.recovery_eligibility_revision"]!.rows).length, "[MO4-1a] pre-existing review row").toBeGreaterThan(0);
 const names = MIGRATION_URLS.map(u => basename(fileURLToPath(u))), index = names.indexOf("0119_recovery_eligibility_v3.sql");
 expect(index, "[MO4-1b] migration by name").toBeGreaterThan(0);
 expect(upgradeProof.ownRegistry, "[MO4-1b] N alone registry").toEqual(names.slice(0, index + 1));
 expect(upgradeProof.ownRows, "[MO4-1c] complete rows at N alone").toEqual(legacy);
 for (const result of upgradeProof.controls) {
   const { table } = result, was = proof[table]!, identity = Object.keys(was.rows)[0]!;
   const column = "reason", newType = "character varying(201)";
   expect(result, "[MO4-1d] rolled-back controls (a)-(f)").toEqual({
     table,
     microsecond: { count: 1, differences: { rows: [`${table} ${identity}: changed`], types: [] } },
     missing: { count: 1, differences: { rows: [`${table} ${identity}: missing`], types: [] } },
     retype: { rows: [], types: [`${table}: ${column} ${was.typed[column]} -> ${newType}`] },
     listRetype: { rows: [], types: [`${table}: ${column} ${was.typed[column]} mo4 scratch -> ${was.typed[column]}`] },
     nullable: { exists: true, differences: { rows: [], types: [] } },
     replaced: { replaced: true, differences: { rows: [], types: [] } },
     inserted: { count: 1, differences: { rows: [], types: [] } },
     after: { rows: [], types: [] },
     columns: was.names.map(name => ({ name, type: was.typed[name] })),
   });
 }
 expect(upgradeProof.controls, "[MO4-1d] one table's controls").toHaveLength(1);
 expect(upgradeProof.afterControls, "[MO4-1d] nothing left behind").toEqual({ rows: [], types: [] });
 // fingerprinted-row-shape.integration.test.ts owns "may never gain a column"; recovery_eligibility_revision, job, job_activation and cap_snapshot are absent from its list.
 expect((await admin.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(row => row.migration_name), "[MO4-1e] all migrations registry").toEqual(names);
 expect(await mo4Proof.proofDifferences(admin, proof), "[MO4-1e] identified old rows and types after all migrations").toEqual({ rows: [], types: [] });
});
it("rejects stale/rebound fixtures, injected fields, cross-job and revoked authority including replay",async()=>{
 const f=await fixture();await f.advance("receipt-3000");const command=review(f.c,"F18"),r=await f.repo.review(ctx,f.jobId,command,actor,f.auth.digest);
 await expect(f.repo.review(ctx,f.jobId,review(f.c,"F18"),actor,f.auth.digest)).rejects.toThrow("ELIGIBILITY_STALE_REVISION");
 await expect(f.repo.review(ctx,f.jobId,review(f.c,"F19",r.revision),actor,f.auth.digest)).rejects.toThrow("ELIGIBILITY_FIXTURE_MISMATCH");
 for(const field of [{category:"merchant_overcharge"},{debtorType:"business"},{settlement:"settled"},{Q:262000},{termsStatus:"approved"}])await expect(f.repo.review(ctx,f.jobId,{...command,...field},actor,f.auth.digest)).rejects.toThrow();
 await expect(f.repo.review(ctx,oldJob,command,actor,f.auth.digest)).rejects.toThrow();
 await expect(f.repo.review(testTenantContext(randomUUID()),f.jobId,command,actor,f.auth.digest)).rejects.toThrow();
 await admin.query("UPDATE app.membership SET revoked_at=now() WHERE id=$1 AND tenant_id=$2",[M,T]);
 try{await expect(f.repo.review(ctx,f.jobId,command,actor,f.auth.digest)).rejects.toThrow();}finally{await admin.query("UPDATE app.membership SET revoked_at=NULL WHERE id=$1 AND tenant_id=$2",[M,T]);}
});
it("pending movements and replayed statement representations do not invent qualifying cash",async()=>{
 const f=await fixture("duplicate_supplier_payment");await f.advance("supplier-refund-540","pending");
 const pending=await f.repo.review(ctx,f.jobId,review(f.c,"F17"),actor,f.auth.digest);expect(pending.result.qualifyingPrincipal.pence).toBe(0);
 await f.advance("supplier-refund-540");const settled=await f.repo.review(ctx,f.jobId,review(f.c,"F17",pending.revision),actor,f.auth.digest);expect(settled.result.qualifyingPrincipal.pence).toBe(45000);
 await f.advance("supplier-refund-540","alternate_representation");expect((await f.repo.review(ctx,f.jobId,review(f.c,"F17",settled.revision),actor,f.auth.digest)).result.qualifyingPrincipal.pence).toBe(45000);
});
it("catalogs and runtime enforce FORCE RLS, ownership, append-only and job/case-qualified links",async()=>{
 for(const name of ["guard_recovery_eligibility_v3","require_recovery_eligibility_v3_effect","prevent_recovery_eligibility_v3_mutation"])expect((await admin.query("SELECT has_function_privilege('jobguard_runtime',$1,'EXECUTE') allowed",[`app.${name}()`])).rows).toEqual([{allowed:false}]);
 for(const table of ["recovery_eligibility_v3_review","recovery_claim_line","supplier_credit_consumption"]){
  expect((await admin.query("SELECT relrowsecurity,relforcerowsecurity,pg_get_userbyid(relowner) owner FROM pg_class WHERE oid=$1::regclass",[`app.${table}`])).rows).toEqual([{relrowsecurity:true,relforcerowsecurity:true,owner:"jobguard_migration"}]);
  for(const sql of [`UPDATE app.${table} SET job_id=job_id`,`DELETE FROM app.${table}`,`TRUNCATE app.${table}`])await expect(withTenant(runtime,ctx,db=>db.$client.query(sql))).rejects.toMatchObject({code:"42501"});
  expect((await runtime.query(`SELECT * FROM app.${table}`)).rows).toEqual([]);
 }
 const f=await fixture();await f.advance("receipt-3000");const r=await f.repo.review(ctx,f.jobId,review(f.c,"F18"),actor,f.auth.digest);
 // Real FK backstop (migration connection), with the case and review pointing at a different job.
 // Set-up: a one-line (F20) review leaves the interest kind free, so UNIQUE(tenant,review,kind) cannot fire before the FK.
 const g=await fixture("withheld_customer_payment",true);const gr=await g.repo.review(ctx,g.jobId,review(g.c,"F20"),actor,g.auth.digest);
 const otherCase=randomUUID();
 await admin.query("INSERT INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic)VALUES($1,$2,$3,32000,'GBP','identified',0,true)",[otherCase,T,g.jobId]);
 const connection=await admin.connect();
 try{
  await connection.query("BEGIN");await connection.query("ALTER TABLE app.recovery_claim_line DISABLE TRIGGER recovery_claim_line_guard");
  await connection.query("SAVEPOINT wrong_job");
  await expect(connection.query("INSERT INTO app.recovery_claim_line(id,tenant_id,job_id,case_id,review_id,kind,debtor_type,net_pence)VALUES($1,$2,$3,$4,$5,'statutory_interest','business',250000)",[randomUUID(),T,oldJob,g.c.id,gr.id])).rejects.toMatchObject({code:"23503"});
  await connection.query("ROLLBACK TO SAVEPOINT wrong_job");
  // Same tenant and job, but this review belongs to g.c, not otherCase.
  await expect(connection.query("INSERT INTO app.recovery_claim_line(id,tenant_id,job_id,case_id,review_id,kind,debtor_type,net_pence)VALUES($1,$2,$3,$4,$5,'statutory_interest','business',250000)",[randomUUID(),T,g.jobId,otherCase,gr.id])).rejects.toMatchObject({code:"23503"});
 }finally{await connection.query("ROLLBACK");connection.release();}
 const bytes=JSON.stringify(r.result);
 await expect(withTenant(runtime,ctx,db=>db.$client.query("INSERT INTO app.recovery_eligibility_v3_review(id,tenant_id,job_id,case_id,revision,case_revision,fixture,actor_membership_id,command_id,payload_hash,result)VALUES($1,$2,$3,$4,99,2,'F18',$5,$6,$7,$8)",[randomUUID(),T,f.jobId,f.c.id,M,randomUUID(),createHash("sha256").update(bytes).digest("hex"),bytes]))).rejects.toThrow();
 await expect(withTenant(runtime,ctx,db=>db.$client.query("INSERT INTO app.recovery_eligibility_v3_review(id,tenant_id,job_id,case_id,revision,case_revision,fixture,actor_membership_id,command_id,payload_hash,result)VALUES($1,$2,$3,$4,99,2,'F18',$5,$6,$7,$8)",[randomUUID(),T,f.jobId,f.c.id,M,randomUUID(),createHash("sha256").update(bytes).digest("hex"),bytes]))).rejects.toMatchObject({code:"42501"});
});

it("B2 refuses customer receipts as supplier-invoice settlement without writing credit/review rows",async()=>{
 const f=await fixture("merchant_overcharge");await f.advance("receipt-3000");
 for(const name of ["F14","F16-partial","F16-full"])await expect(f.repo.review(ctx,f.jobId,review(f.c,name),actor,f.auth.digest)).rejects.toMatchObject({code:"ELIGIBILITY_SUPPLIER_PAYMENT_UNAVAILABLE"});
 for(const table of ["supplier_credit_consumption","recovery_eligibility_v3_review","recovery_claim_line"])expect((await admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1 AND case_id=$2`,[T,f.c.id])).rows[0].n).toBe(0);
});
it("source updates yield a new immutable review and races append one revision",async()=>{
 const f=await fixture("duplicate_supplier_payment");await f.advance("supplier-refund-540");
 const initialCommand=review(f.c,"F17"),initial=await f.repo.review(ctx,f.jobId,initialCommand,actor,f.auth.digest);
 await f.advance("supplier-refund-540","unknown_duplicate");
 const outcomes=await Promise.allSettled([f.repo.review(ctx,f.jobId,review(f.c,"F17",initial.revision),actor,f.auth.digest),f.repo.review(ctx,f.jobId,review(f.c,"F17",initial.revision),actor,f.auth.digest)]);
 expect(outcomes.filter(x=>x.status==="fulfilled")).toHaveLength(1);expect(outcomes.filter(x=>x.status==="rejected")).toHaveLength(1);
 const rows=(await admin.query("SELECT revision,result FROM app.recovery_eligibility_v3_review WHERE tenant_id=$1 AND case_id=$2 ORDER BY revision",[T,f.c.id])).rows;
 expect(rows.map(r=>r.result.qualifyingPrincipal.pence)).toEqual([45000,0]);expect(rows[0].result).toEqual(initial.result);
 expect(await f.repo.review(ctx,f.jobId,initialCommand,actor,f.auth.digest)).toEqual(initial);
});
it("append-only triggers deny an owner rewrite, and failures after write roll back review/components/audit",async()=>{
 const f=await fixture();await f.advance("receipt-3000");const command=review(f.c,"F18");
 await admin.query("CREATE FUNCTION app.ch7_test_audit_failure()RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='recovery.eligibility.v3_reviewed' THEN RAISE EXCEPTION 'injected audit failure';END IF;RETURN NEW;END $$; CREATE TRIGGER ch7_test_audit_failure BEFORE INSERT ON app.audit_event FOR EACH ROW EXECUTE FUNCTION app.ch7_test_audit_failure()");
 try{await expect(f.repo.review(ctx,f.jobId,command,actor,f.auth.digest)).rejects.toThrow("injected audit failure");}finally{await admin.query("DROP TRIGGER ch7_test_audit_failure ON app.audit_event;DROP FUNCTION app.ch7_test_audit_failure()");}
 for(const table of ["recovery_eligibility_v3_review","recovery_claim_line"])expect((await admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1 AND case_id=$2`,[T,f.c.id])).rows[0].n).toBe(0);
 const r=await f.repo.review(ctx,f.jobId,command,actor,f.auth.digest);
 await expect(admin.query("UPDATE app.recovery_eligibility_v3_review SET result=result WHERE tenant_id=$1 AND id=$2",[T,r.id])).rejects.toMatchObject({code:"42501"});
 await expect(admin.query("DELETE FROM app.recovery_claim_line WHERE tenant_id=$1 AND review_id=$2",[T,r.id])).rejects.toMatchObject({code:"42501"});
});
it("malformed tenant context fails closed, runtime grants are exact, and pooling clears context",async()=>{
 const connection=await runtime.connect();
 try{
  await connection.query("BEGIN");await connection.query("SELECT set_config('app.tenant_id','not-a-uuid',true)");
  await expect(connection.query("SELECT * FROM app.recovery_claim_line")).rejects.toMatchObject({code:"22P02"});
 }finally{await connection.query("ROLLBACK");connection.release();}
 for(const table of ["recovery_eligibility_v3_review","recovery_claim_line","supplier_credit_consumption"]){
  const grants=(await admin.query("SELECT has_table_privilege('jobguard_runtime',$1,'SELECT') s,has_table_privilege('jobguard_runtime',$1,'INSERT') i,has_table_privilege('jobguard_runtime',$1,'UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') forbidden",[`app.${table}`])).rows;
  expect(grants).toEqual([{s:true,i:true,forbidden:false}]);expect((await runtime.query(`SELECT * FROM app.${table}`)).rows).toEqual([]);
 }
});
it("a database guard refusal has the same typed code as the application, with no committed effect",async()=>{
 const f=await fixture();await f.advance("receipt-3000");
 await admin.query("CREATE FUNCTION app.ch7_test_guard_failure()RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'ELIGIBILITY_STALE_REVISION' USING ERRCODE='40001';END $$;CREATE TRIGGER ch7_test_guard_failure BEFORE INSERT ON app.recovery_eligibility_v3_review FOR EACH ROW EXECUTE FUNCTION app.ch7_test_guard_failure()");
 try{await expect(f.repo.review(ctx,f.jobId,review(f.c,"F18"),actor,f.auth.digest)).rejects.toMatchObject({code:"ELIGIBILITY_STALE_REVISION"});}finally{await admin.query("DROP TRIGGER ch7_test_guard_failure ON app.recovery_eligibility_v3_review;DROP FUNCTION app.ch7_test_guard_failure()");}
 expect((await admin.query("SELECT count(*)::int n FROM app.recovery_eligibility_v3_review WHERE tenant_id=$1 AND case_id=$2",[T,f.c.id])).rows[0].n).toBe(0);
});
it("runtime cannot put compensation into Q or alter a generated component's exact pence",async()=>{
 const f=await fixture();await f.advance("receipt-3000");const saved=await f.repo.review(ctx,f.jobId,review(f.c,"F18"),actor,f.auth.digest);
 const rollback=new Error("CH-7 intentional rollback");
 const insert=async(db:TenantTransaction,result:unknown)=>{
  const id=randomUUID();await db.$client.query("INSERT INTO app.recovery_eligibility_v3_review(id,tenant_id,job_id,case_id,revision,case_revision,fixture,source_event_id,actor_membership_id,command_id,payload_hash,result)VALUES($1,$2,$3,$4,2,$5,'F18',$6,$7,$8,$9,$10)",[id,T,f.jobId,f.c.id,f.c.revision,saved.sourceEventId,M,randomUUID(),"a".repeat(64),JSON.stringify(result)]);return id;
 };
 await expect(withTenant(practiceMaterialPool(runtime,f.auth.digest),ctx,async db=>{
  await db.$client.query("SELECT set_config('app.recovery_eligibility_environment','synthetic_demo',true)");
  await expect(insert(db,{...saved.result,qualifyingPrincipal:{pence:269000,currency:"GBP"}})).rejects.toMatchObject({message:"ELIGIBILITY_FIXTURE_MISMATCH"});
  throw rollback;
 })).rejects.toBe(rollback);
 await expect(withTenant(practiceMaterialPool(runtime,f.auth.digest),ctx,async db=>{
  await db.$client.query("SELECT set_config('app.recovery_eligibility_environment','synthetic_demo',true)");
  await expect(insert(db,{...saved.result,qualifyingPrincipal:{pence:269000,currency:"GBP"}})).rejects.toMatchObject({code:"23514"});
  throw rollback;
 })).rejects.toBe(rollback);
 await expect(withTenant(practiceMaterialPool(runtime,f.auth.digest),ctx,async db=>{
  await db.$client.query("SELECT set_config('app.recovery_eligibility_environment','synthetic_demo',true)");const id=await insert(db,saved.result);
  await expect(db.$client.query("INSERT INTO app.recovery_claim_line(id,tenant_id,job_id,case_id,review_id,kind,debtor_type,net_pence)VALUES($1,$2,$3,$4,$5,'fixed_compensation','business',7100)",[randomUUID(),T,f.jobId,f.c.id,id])).rejects.toMatchObject({message:"ELIGIBILITY_FIXTURE_MISMATCH"});
  throw rollback;
 })).rejects.toBe(rollback);
 await expect(withTenant(practiceMaterialPool(runtime,f.auth.digest),ctx,async db=>{
  await db.$client.query("SELECT set_config('app.recovery_eligibility_environment','synthetic_demo',true)");const id=await insert(db,saved.result);
  await expect(db.$client.query("INSERT INTO app.recovery_claim_line(id,tenant_id,job_id,case_id,review_id,kind,debtor_type,net_pence)VALUES($1,$2,$3,$4,$5,'fixed_compensation','business',7100)",[randomUUID(),T,f.jobId,f.c.id,id])).rejects.toMatchObject({code:"23514"});
  throw rollback;
 })).rejects.toBe(rollback);
 expect((await admin.query("SELECT count(*)::int n FROM app.recovery_eligibility_v3_review WHERE tenant_id=$1 AND case_id=$2",[T,f.c.id])).rows[0].n).toBe(1);
});

// Round 1 (Sol checks 1-3). Appended cases only.
it("a duplicate-payment case is refused any new v1 review or approval, by the app and by raw runtime SQL; other categories are unchanged",async()=>{
 const f=await fixture("duplicate_supplier_payment");await f.advance("supplier-refund-540");
 const v1=(caseId:string,extra:Record<string,unknown>)=>({version:"recovery-eligibility-command.v1",commandId:randomUUID(),caseId,...extra});
 await expect(f.cases.eligibilityCommand(ctx,f.jobId,v1(f.c.id,{action:"review",expectedCaseRevision:f.c.revision,scenario:"evidence_backed_withheld_payment",evidenceRevision:1,policyVersion:"reference-d03.v1",policyRevision:1}),actor)).rejects.toThrow("ELIGIBILITY_FIXTURE_MISMATCH");
 await expect(f.cases.eligibilityCommand(ctx,f.jobId,v1(f.c.id,{action:"approve",expectedCaseRevision:f.c.revision,expectedEvidenceRevision:1,expectedPolicyRevision:1,expectedReviewRevision:1}),actor)).rejects.toThrow("ELIGIBILITY_FIXTURE_MISMATCH");
 const rawRow=(status:string)=>withTenant(practiceMaterialPool(runtime,f.auth.digest),ctx,db=>db.$client.query("INSERT INTO app.recovery_eligibility_revision(id,tenant_id,job_id,case_id,revision,case_revision,evidence_revision,policy_version,policy_revision,scenario,classification,eligible_net_pence,currency,reason,citations,status,reviewer_ref,command_id,subject_hash)VALUES($1,$2,$3,$4,1,$5,1,'reference-d03.v1',1,'evidence_backed_withheld_payment','eligible_for_review',45000,'GBP','Reviewed','[]',$6,$7,$8,$9)",[randomUUID(),T,f.jobId,f.c.id,f.c.revision,status,`membership:${M}`,randomUUID(),createHash("sha256").update(randomUUID()).digest("hex")]));
 for(const status of ["reviewed","approved"])await expect(rawRow(status)).rejects.toMatchObject({message:"ELIGIBILITY_FIXTURE_MISMATCH"});
 for(const status of ["reviewed","approved"])await expect(rawRow(status)).rejects.toMatchObject({code:"23514"});
 expect((await admin.query("SELECT count(*)::int n FROM app.recovery_eligibility_revision WHERE tenant_id=$1 AND case_id=$2",[T,f.c.id])).rows[0].n).toBe(0);
 expect((await admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type LIKE 'recovery.eligibility.%'",[T,f.c.id])).rows[0].n).toBe(0);
 // Control: the v1 path of another category still reviews exactly as before.
 const g=await fixture("withheld_customer_payment");
 const ok=await g.cases.eligibilityCommand(ctx,g.jobId,v1(g.c.id,{action:"review",expectedCaseRevision:g.c.revision,scenario:"evidence_backed_withheld_payment",evidenceRevision:1,policyVersion:"reference-d03.v1",policyRevision:1}),actor);
 expect(ok.eligibility).toMatchObject({status:"reviewed",policyVersion:"reference-d03.v1"});
});
const stampTimes=async(f:{c:{id:string};jobId:string},movement:string,caseAt:string,eventAt:string)=>{
 const connection=await admin.connect();
 try{
  await connection.query("BEGIN");await connection.query("SET LOCAL session_replication_role=replica");
  await connection.query("UPDATE app.recovery_case SET created_at=$1 WHERE tenant_id=$2 AND id=$3",[caseAt,T,f.c.id]);
  await connection.query("UPDATE app.practice_feed_event SET created_at=$1 WHERE tenant_id=$2 AND job_id=$3 AND movement_key=$4 AND event_kind='settled'",[eventAt,T,f.jobId,movement]);
  await connection.query("COMMIT");
 }catch(error){await connection.query("ROLLBACK");throw error;}finally{connection.release();}
};
it("settled-before-opening is decided in PostgreSQL on microsecond timestamps: settlement 800 microseconds BEFORE opening in the same millisecond is F20",async()=>{
 const f=await fixture("withheld_customer_payment",true);
 await stampTimes(f,"receipt-384","2026-10-11T12:00:00.000900Z","2026-10-11T12:00:00.000100Z");
 const r=await f.repo.review(ctx,f.jobId,review(f.c,"F20"),actor,f.auth.digest);
 expect(r.result).toMatchObject({qualifyingPrincipal:{pence:0,currency:"GBP"},outcome:"excluded",reason:"Paid before you opened this case"});
});
it("settlement at exactly the case opening instant is excluded with zero Q",async()=>{
 const f=await fixture("withheld_customer_payment",true);
 const instant="2026-10-11T12:00:00.000900Z";
 await stampTimes(f,"receipt-384",instant,instant);
 expect((await admin.query("SELECT e.created_at=c.created_at same_instant FROM app.practice_feed_event e JOIN app.recovery_case c ON c.tenant_id=e.tenant_id AND c.job_id=e.job_id WHERE e.tenant_id=$1 AND e.job_id=$2 AND c.id=$3 AND e.movement_key='receipt-384' AND e.event_kind='settled'",[T,f.jobId,f.c.id])).rows).toEqual([{same_instant:true}]);
 const r=await f.repo.review(ctx,f.jobId,review(f.c,"F20"),actor,f.auth.digest);
 expect(r.result).toMatchObject({qualifyingPrincipal:{pence:0,currency:"GBP"},outcome:"excluded",reason:"Paid before you opened this case"});
});
it("settled-before-opening is decided in PostgreSQL on microsecond timestamps: settlement 800 microseconds AFTER opening in the same millisecond qualifies at the plan figure",async()=>{
 const f=await fixture();await f.advance("receipt-3000");
 await stampTimes(f,"receipt-3000","2026-10-11T12:00:00.000100Z","2026-10-11T12:00:00.000900Z");
 const r=await f.repo.review(ctx,f.jobId,review(f.c,"F18"),actor,f.auth.digest);
 expect(r.result).toMatchObject({qualifyingPrincipal:{pence:262000,currency:"GBP"},outcome:"eligible_for_review",reason:"Fixed statutory compensation is not part of the fee base"});
 await expect(f.repo.review(ctx,f.jobId,review(f.c,"F20",1),actor,f.auth.digest)).rejects.toMatchObject({code:"ELIGIBILITY_FIXTURE_MISMATCH"});
});
it.each([["F17","duplicate_supplier_payment","supplier-refund-540",45000,"result"],["F21","merchant_overcharge",null,9000,"result"],["F17","duplicate_supplier_payment","supplier-refund-540",45000,"claim line"]] as const)("%s: a runtime-role review whose stored %s omits the reason key cannot commit",async(name,type,movement,net,shape)=>{
 const valid=await fixture(type);if(movement)await valid.advance(movement);
 const good=await valid.repo.review(ctx,valid.jobId,review(valid.c,name),actor,valid.auth.digest);
 expect(good.result.reason).toBeNull();
 const f=await fixture(type);if(movement)await f.advance(movement);
 const sourceEventId=movement?(await admin.query("SELECT id FROM app.practice_feed_event WHERE tenant_id=$1 AND job_id=$2 AND movement_key=$3 AND event_kind='settled'",[T,f.jobId,movement])).rows[0].id as string:null;
 const {reason:_omitted,...withoutReason}=good.result as Record<string,unknown>;
 const malformed=shape==="result"?withoutReason:{...good.result,lines:good.result.lines.map(({reason:_line,...rest})=>rest)};
 const body=JSON.stringify(malformed),id=randomUUID(),commandId=randomUUID(),payloadHash=createHash("sha256").update(commandId).digest("hex");
 await expect(withTenant(practiceMaterialPool(runtime,f.auth.digest),ctx,async db=>{
  await db.$client.query("SELECT set_config('app.recovery_eligibility_environment','synthetic_demo',true)");
  const inserted=await db.$client.query<{h:string}>("INSERT INTO app.recovery_eligibility_v3_review(id,tenant_id,job_id,case_id,revision,case_revision,fixture,source_event_id,actor_membership_id,command_id,payload_hash,result)VALUES($1,$2,$3,$4,1,$5,$6,$7,$8,$9,$10,$11) RETURNING encode(sha256(convert_to(result::text,'UTF8')),'hex') h",[id,T,f.jobId,f.c.id,f.c.revision,name,sourceEventId,M,commandId,payloadHash,body]);
  await db.$client.query("INSERT INTO app.recovery_claim_line(id,tenant_id,job_id,case_id,review_id,kind,debtor_type,net_pence)VALUES($1,$2,$3,$4,$5,'principal','business',$6)",[randomUUID(),T,f.jobId,f.c.id,id,net]);
  await appendAuditBatch(db,[{id:randomUUID(),version:"audit.v1",actorRef:`membership:${M}`,eventType:"recovery.eligibility.v3_reviewed",subjectType:"recovery_case",subjectRef:f.c.id,payload:{references:{jobId:f.jobId,reviewId:id,commandId,...(sourceEventId?{sourceEventId}:{})},hashes:{command:payloadHash,result:inserted.rows[0]!.h},classifications:{recovery:"financial"}}}]);
 })).rejects.toThrow();
 await expect(withTenant(practiceMaterialPool(runtime,f.auth.digest),ctx,async db=>{
  await db.$client.query("SELECT set_config('app.recovery_eligibility_environment','synthetic_demo',true)");
  const inserted=await db.$client.query<{h:string}>("INSERT INTO app.recovery_eligibility_v3_review(id,tenant_id,job_id,case_id,revision,case_revision,fixture,source_event_id,actor_membership_id,command_id,payload_hash,result)VALUES($1,$2,$3,$4,1,$5,$6,$7,$8,$9,$10,$11) RETURNING encode(sha256(convert_to(result::text,'UTF8')),'hex') h",[id,T,f.jobId,f.c.id,f.c.revision,name,sourceEventId,M,commandId,payloadHash,body]);
  await db.$client.query("INSERT INTO app.recovery_claim_line(id,tenant_id,job_id,case_id,review_id,kind,debtor_type,net_pence)VALUES($1,$2,$3,$4,$5,'principal','business',$6)",[randomUUID(),T,f.jobId,f.c.id,id,net]);
  await appendAuditBatch(db,[{id:randomUUID(),version:"audit.v1",actorRef:`membership:${M}`,eventType:"recovery.eligibility.v3_reviewed",subjectType:"recovery_case",subjectRef:f.c.id,payload:{references:{jobId:f.jobId,reviewId:id,commandId,...(sourceEventId?{sourceEventId}:{})},hashes:{command:payloadHash,result:inserted.rows[0]!.h},classifications:{recovery:"financial"}}}]);
 })).rejects.toMatchObject({code:"23514"});
 expect((await admin.query("SELECT count(*)::int n FROM app.recovery_eligibility_v3_review WHERE tenant_id=$1 AND case_id=$2",[T,f.c.id])).rows[0].n).toBe(0);
 expect((await f.cases.listForMember(ctx,f.jobId,actor)).find(c=>c.id===f.c.id)?.eligibilityV3??null).toBeNull();
});

// CH-7-F17-BEFORE-OPEN: appended before the rule/migration implementation.
it.each([
 ["800 microseconds BEFORE","2026-10-11T12:00:00.000900Z","2026-10-11T12:00:00.000100Z",0,"Paid before you opened this case","before_opening"],
 ["exactly AT","2026-10-11T12:00:00.000900Z","2026-10-11T12:00:00.000900Z",0,"Paid before you opened this case","before_opening"],
 ["800 microseconds AFTER","2026-10-11T12:00:00.000100Z","2026-10-11T12:00:00.000900Z",45000,null,"after_opening"],
] as const)("F17 refund settled %s opening: repository, saved result and core/SQL parity",async(_label,caseAt,eventAt,q,reason,paymentTiming)=>{
 const f=await fixture("duplicate_supplier_payment");await f.advance("supplier-refund-540");
 await stampTimes(f,"supplier-refund-540",caseAt,eventAt);
 const command=review(f.c,"F17"),r=await f.repo.review(ctx,f.jobId,command,actor,f.auth.digest);
 expect(r.result).toMatchObject({outcome:q===0?"excluded":"eligible_for_review",qualifyingPrincipal:{pence:q,currency:"GBP"},reason});
 const stored=(await admin.query("SELECT result,source_event_id FROM app.recovery_eligibility_v3_review WHERE tenant_id=$1 AND id=$2",[T,r.id])).rows[0];
 expect(stored).toEqual({result:r.result,source_event_id:r.sourceEventId});
 expect(r.result).toEqual(evaluateRecoveryEligibilityV3({version:"recovery-eligibility-facts.v3",environment:"synthetic_demo",tenantId:T,jobId:f.jobId,caseId:f.c.id,fixture:"F17",settlement:"settled",paymentTiming,sourceRef:r.sourceEventId}));
 expect((await f.cases.listForMember(ctx,f.jobId,actor)).find(c=>c.id===f.c.id)?.eligibilityV3).toEqual(r);
 expect(await f.repo.review(ctx,f.jobId,command,actor,f.auth.digest)).toEqual(r);
});

// Complete, otherwise-valid runtime transaction: the guard must reject the money,
// rather than an absent claim line, audit event, source binding or session context.
async function rawQualifyingF17(pool:Pool,f:{auth:{digest:string};jobId:string;c:{id:string;revision:number}}){
 return withTenant(practiceMaterialPool(pool,f.auth.digest),ctx,async db=>{
  await db.$client.query("SELECT set_config('app.recovery_eligibility_environment','synthetic_demo',true)");
  const sourceEventId=(await db.$client.query<{id:string}>("SELECT id FROM app.practice_feed_event WHERE tenant_id=$1 AND job_id=$2 AND movement_key='supplier-refund-540' AND event_kind='settled' AND identity='identified'",[T,f.jobId])).rows[0]!.id;
  // Deliberately propose £450 irrespective of the stored timing, as a raw writer could.
  const result=evaluateRecoveryEligibilityV3({version:"recovery-eligibility-facts.v3",environment:"synthetic_demo",tenantId:T,jobId:f.jobId,caseId:f.c.id,fixture:"F17",settlement:"settled",paymentTiming:"after_opening",sourceRef:sourceEventId});
  const id=randomUUID(),commandId=randomUUID(),payloadHash=createHash("sha256").update(commandId).digest("hex");
  const inserted=await db.$client.query<{h:string}>("INSERT INTO app.recovery_eligibility_v3_review(id,tenant_id,job_id,case_id,revision,case_revision,fixture,source_event_id,actor_membership_id,command_id,payload_hash,result)VALUES($1,$2,$3,$4,1,$5,'F17',$6,$7,$8,$9,$10) RETURNING encode(sha256(convert_to(result::text,'UTF8')),'hex') h",[id,T,f.jobId,f.c.id,f.c.revision,sourceEventId,M,commandId,payloadHash,JSON.stringify(result)]);
  await db.$client.query("INSERT INTO app.recovery_claim_line(id,tenant_id,job_id,case_id,review_id,kind,debtor_type,net_pence)VALUES($1,$2,$3,$4,$5,'principal','business',45000)",[randomUUID(),T,f.jobId,f.c.id,id]);
  await appendAuditBatch(db,[{id:randomUUID(),version:"audit.v1",actorRef:`membership:${M}`,eventType:"recovery.eligibility.v3_reviewed",subjectType:"recovery_case",subjectRef:f.c.id,payload:{references:{jobId:f.jobId,reviewId:id,commandId,sourceEventId},hashes:{command:payloadHash,result:inserted.rows[0]!.h},classifications:{recovery:"financial"}}}]);
  return id;
 });
}
it.each([
 ["before","2026-10-11T12:00:00.000100Z"],
 ["equal","2026-10-11T12:00:00.000900Z"],
] as const)("F17 runtime-role raw qualifying insert for a %s-opening refund cannot commit",async(_label,eventAt)=>{
 const f=await fixture("duplicate_supplier_payment");await f.advance("supplier-refund-540");
 await stampTimes(f,"supplier-refund-540","2026-10-11T12:00:00.000900Z",eventAt);
 await expect(rawQualifyingF17(runtime,f)).rejects.toMatchObject({code:"23514",message:"ELIGIBILITY_FIXTURE_MISMATCH"});
 for(const table of ["recovery_eligibility_v3_review","recovery_claim_line"])expect((await admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1 AND case_id=$2`,[T,f.c.id])).rows[0].n).toBe(0);
 expect((await admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='recovery.eligibility.v3_reviewed'",[T,f.c.id])).rows[0].n).toBe(0);
});
it("F17 runtime-role raw qualifying insert after opening still commits with complete components and audit",async()=>{
 const f=await fixture("duplicate_supplier_payment");await f.advance("supplier-refund-540");
 await stampTimes(f,"supplier-refund-540","2026-10-11T12:00:00.000100Z","2026-10-11T12:00:00.000900Z");
 const id=await rawQualifyingF17(runtime,f);
 expect((await admin.query("SELECT result FROM app.recovery_eligibility_v3_review WHERE tenant_id=$1 AND id=$2",[T,id])).rows[0].result).toMatchObject({outcome:"eligible_for_review",qualifyingPrincipal:{pence:45000,currency:"GBP"},reason:null});
});

// Standing rule 9: "An upgrade proof proves ITS OWN migration only: install everything before N, snapshot, apply N alone, compare; then apply everything
// after N and require success twice. Compare existing rows by named pre-existing columns after all migrations. Never assert that later migrations add no
// column or replace no function; the fingerprinted-table guard owns 'may never gain a column'."
// So the 0123 proof below compares whole rows only straight after 0123 has run ALONE. After every later migration it compares just the rows that existed
// before 0123 (found again by primary key), on the columns and types they had before 0123, as canonical text from the database (never driver-parsed
// values, which round timestamps to the millisecond). A column, row, trigger or function added or replaced later is not looked at.
type Queryable=Pick<Pool|PoolClient,"query">;
type ProofTable={names:string[];typed:Record<string,string>;pk:string[];rows:Record<string,string>};
const proofTables=["recovery_eligibility_v3_review","recovery_claim_line","audit_event"] as const;
const proofTimeColumn:Record<typeof proofTables[number],string>={recovery_eligibility_v3_review:"created_at",recovery_claim_line:"created_at",audit_event:"occurred_at"};
const ident=(name:string)=>`"${name.replaceAll('"','""')}"`;
async function proofColumns(db:Queryable,table:string){
 return (await db.query(`SELECT a.attname::text AS name,format_type(a.atttypid,a.atttypmod) AS type FROM pg_attribute a
  WHERE a.attrelid=$1::regclass AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum`,[`app.${table}`])).rows as {name:string;type:string}[];
}
async function proofRows(db:Queryable,table:string,names:string[],pk:string[]){
 const found=(await db.query(`SELECT identity,bytes FROM (SELECT (SELECT row_to_json(k)::text FROM (SELECT ${pk.map(name=>`t.${ident(name)}`).join(",")}) k) AS identity,
  (SELECT row_to_json(s)::text FROM (SELECT ${names.map(name=>`t.${ident(name)}`).join(",")}) s) AS bytes FROM app.${table} t) x ORDER BY identity COLLATE "C"`)).rows;
 return Object.fromEntries(found.map(row=>[row.identity as string,row.bytes as string]));
}
async function proofBefore(db:Queryable){
 const proof:Record<string,ProofTable>={};
 for(const table of proofTables){
  const columns=await proofColumns(db,table),names=columns.map(column=>column.name);
  const pk=(await db.query(`SELECT a.attname::text AS name FROM pg_index i JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=ANY(i.indkey)
   WHERE i.indrelid=$1::regclass AND i.indisprimary ORDER BY array_position(i.indkey::int2[],a.attnum)`,[`app.${table}`])).rows.map(row=>row.name as string);
  proof[table]={names,typed:Object.fromEntries(columns.map(column=>[column.name,column.type])),pk,rows:await proofRows(db,table,names,pk)};
 }
 return proof;
}
// Every pre-existing column whose type moved ("table: name type -> new type"; a dropped column reads "(gone)") and every pre-existing row that is missing
// or whose named columns changed. A later column, or a later row, is not a difference.
async function proofDifferences(db:Queryable,proof:Record<string,ProofTable>){
 const rows:string[]=[],types:string[]=[];
 for(const [table,was] of Object.entries(proof)){
  const now=new Map((await proofColumns(db,table)).map(column=>[column.name,column.type]));
  for(const name of was.names)if(now.get(name)!==was.typed[name])types.push(`${table}: ${name} ${was.typed[name]} -> ${now.get(name)??"(gone)"}`);
  if(was.names.some(name=>!now.has(name)))continue;
  const live=await proofRows(db,table,was.names,was.pk);
  for(const [identity,bytes] of Object.entries(was.rows)){
   if(!(identity in live))rows.push(`${table} ${identity}: missing`);else if(live[identity]!==bytes)rows.push(`${table} ${identity}: changed`);
  }
 }
 return {rows,types};
}
async function rolledBack<T>(db:Pool,work:(client:PoolClient)=>Promise<T>){
 const client=await db.connect();
 try{await client.query("BEGIN");return await work(client);}finally{await client.query("ROLLBACK");client.release();}
}
// The review revision the repository itself will demand next: its own reader of the newest review of a case (the reader behind the expectedReviewRevision check),
// so the proof never pins a revision number that a later migration may legitimately move.
const currentReviewRevision=async(db:Queryable,caseId:string)=>(await readRecoveryEligibilityV3({$client:db} as unknown as TenantTransaction,T,caseId))?.revision??0;
// The case revision the repository demands as expectedCaseRevision: the same projection (app.recovery_case_current) and filters its own query reads, so a case revision
// appended after the case was opened (an amendment, an event) is followed rather than assumed to be still the number returned by "open".
const currentCaseRevision=async(db:Queryable,jobId:string,caseId:string)=>Number((await db.query("SELECT revision FROM app.recovery_case_current WHERE tenant_id=$1 AND job_id=$2 AND id=$3 AND claim_revision IS NOT NULL",[T,jobId,caseId])).rows[0]?.revision);
async function routineSource(db:Queryable,routine:string){
 const row=(await db.query("SELECT pg_get_functiondef(p.oid) AS definition,p.prosrc AS body FROM pg_proc p WHERE p.oid=$1::regprocedure",[routine])).rows[0]!;
 return {definition:row.definition as string,body:row.body as string};
}
// CREATE OR REPLACE with the routine's OWN header and body, both read from the catalog as data, under a dollar-quote delimiter chosen here that occurs in neither the
// body nor the note. Nothing depends on the delimiter the stored definition happens to print (PostgreSQL picks another one when the body holds "$function$").
async function replaceRoutine(db:Queryable,routine:string,note:string){
 const was=await routineSource(db,routine),bodyAt=was.definition.lastIndexOf(was.body);
 expect(bodyAt,`${routine}: the body is inside its printed definition`).toBeGreaterThan(0);
 const opening=was.definition.slice(0,bodyAt),header=opening.replace(/\nAS \$[A-Za-z0-9_]*\$$/u,"");
 expect(header,`${routine}: the printed definition opens its dollar-quoted body`).not.toBe(opening);
 let delimiter="$ch7_scratch$";for(let n=1;`${note}\n${was.body}`.includes(delimiter);n++)delimiter=`$ch7_scratch${n}$`;
 await db.query(`${header}\nAS ${delimiter}\n-- ${note}\n${was.body}${delimiter}`);
 return {was,now:await routineSource(db,routine)};
}
it("0123 upgrade from 0119 preserves an existing saved F17 candidate byte-for-byte without backfill",async()=>{
 const names=MIGRATION_URLS.map(u=>basename(fileURLToPath(u))),oldIndex=names.indexOf("0119_recovery_eligibility_v3.sql"),newIndex=names.indexOf("0123_recovery_eligibility_v3_f17_timing.sql");
 expect(oldIndex).toBeGreaterThanOrEqual(0);expect(newIndex).toBeGreaterThan(oldIndex);expect(names).toEqual([...names].sort());
 const database=`ch7_f17_upgrade_${randomUUID().replaceAll("-","")}`;
 await admin.query(`CREATE DATABASE ${database}`);
 const upgradeAdmin=new Pool({...admin.options,password:"synthetic",database}),upgradeRuntime=new Pool({...runtime.options,password:"synthetic",database});
 try{
  await upgradeAdmin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  // Everything registered before 0123 (its index is found by name above, so a later renumbering of the file is a mechanical change), as the runner records it.
  for(const url of MIGRATION_URLS.slice(0,newIndex)){
   await upgradeAdmin.query(await readFile(url,"utf8"));
   await upgradeAdmin.query("INSERT INTO public.jobguard_schema_migration(migration_name)VALUES($1)",[basename(fileURLToPath(url))]);
  }
  expect((await upgradeAdmin.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(r=>r.migration_name)).toEqual(names.slice(0,newIndex));
  await upgradeAdmin.query("INSERT INTO control_plane.tenant(id)VALUES($1)",[T]);await upgradeAdmin.query("INSERT INTO identity.identity_user(id)VALUES($1)",[U]);
  await upgradeAdmin.query("INSERT INTO app.account(id,tenant_id,name)VALUES($1,$2,'F17 upgrade synthetic')",[A,T]);await upgradeAdmin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)VALUES($1,$2,$3,$4,'owner')",[M,T,A,U]);
  const session=await issuePracticeSession(upgradeRuntime),auth=await authenticatePracticeSession(upgradeRuntime,session),jobId=randomUUID();
  await upgradeAdmin.query("INSERT INTO app.job(id,tenant_id,title,practice_session_digest,practice_scenario)VALUES($1,$2,'F17 upgrade generated job',$3,'capture')",[jobId,T,auth.digest]);
  const feed=new PracticeFeedRepository(upgradeRuntime,"synthetic_demo"),cases=new RecoveryCaseRepository(practiceMaterialPool(upgradeRuntime,auth.digest));
  const connected=await feed.command(ctx,actor,auth.digest,jobId,{version:"practice-feed-command.v1",commandId:randomUUID(),expectedRevision:0,action:"connect"});
  await feed.command(ctx,actor,auth.digest,jobId,{version:"practice-feed-command.v1",commandId:randomUUID(),expectedRevision:connected.revision,action:"advance",movement:"supplier-refund-540",step:"settled"});
  // The cash settles first. The 0119 guard accepts its qualifying candidate;
  // 0123 must preserve that historical mistake rather than rewriting history.
  const c=await cases.command(ctx,jobId,{version:"recovery-case-command.v1",commandId:randomUUID(),action:"open",caseType:"duplicate_supplier_payment",claimedNetPence:300000,counterparty:"Fictional supplier",book:"supplier_cost",sourceType:"supplier_documents",sourceRefs:["Supplier invoice INV-320"],expectedRevision:0},actor);
  const f={auth,jobId,c},id=await rawQualifyingF17(upgradeRuntime,f);
  const snapshot=async()=>({
   reviews:(await upgradeAdmin.query("SELECT row_to_json(r)::text bytes FROM app.recovery_eligibility_v3_review r ORDER BY id")).rows,
   lines:(await upgradeAdmin.query("SELECT row_to_json(r)::text bytes FROM app.recovery_claim_line r ORDER BY id")).rows,
   audit:(await upgradeAdmin.query("SELECT row_to_json(r)::text bytes FROM app.audit_event r ORDER BY sequence")).rows,
  });
  const before=await snapshot();expect(before.reviews).toHaveLength(1);
  expect((await upgradeAdmin.query("SELECT result FROM app.recovery_eligibility_v3_review WHERE id=$1",[id])).rows[0].result).toMatchObject({qualifyingPrincipal:{pence:45000,currency:"GBP"},reason:null});
  // What the after-all-migrations comparison will use: the primary keys of the rows that exist now, and their named columns and types.
  const proof=await proofBefore(upgradeAdmin);
  expect(Object.keys(proof)).toEqual([...proofTables]);
  for(const [table,was] of Object.entries(proof)){expect(was.pk.length,`${table} has a primary key`).toBeGreaterThan(0);expect(Object.keys(was.rows).length,`${table} has a pre-existing row to compare`).toBeGreaterThan(0);}
  // Migration 0123 ALONE, the way the runner applies one file: run its SQL, then record it. Whole rows, byte for byte: this says only what 0123 did.
  await upgradeAdmin.query(await readFile(MIGRATION_URLS[newIndex]!,"utf8"));
  await upgradeAdmin.query("INSERT INTO public.jobguard_schema_migration(migration_name)VALUES($1)",[names[newIndex]]);
  expect(await snapshot()).toEqual(before);
  // Then every later migration, twice; both runs must succeed.
  await migrate(upgradeAdmin);await migrate(upgradeAdmin);
  expect((await upgradeAdmin.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(r=>r.migration_name)).toEqual(names);
  expect((await upgradeAdmin.query("SELECT migration_name FROM public.jobguard_schema_migration WHERE migration_name=$1",[names[newIndex]])).rows).toEqual([{migration_name:"0123_recovery_eligibility_v3_f17_timing.sql"}]);
  // After ALL migrations: only the rows that existed before 0123, by primary key, on their named columns and types.
  expect(await proofDifferences(upgradeAdmin,proof)).toEqual({rows:[],types:[]});
  // Controls: each runs the SAME comparison inside a transaction that is rolled back.
  for(const table of proofTables){
   const preExisting=Object.keys(proof[table]!.rows).length;
   // (a) a one-microsecond change to a stored time (a superuser UPDATE with triggers off, the way this file seeds times) must fail the row comparison for every pre-existing row.
   const moved=await rolledBack(upgradeAdmin,async client=>{
    await client.query("SET LOCAL session_replication_role=replica");
    expect((await client.query(`UPDATE app.${table} SET ${proofTimeColumn[table]}=${proofTimeColumn[table]}+interval '1 microsecond'`)).rowCount).toBeGreaterThanOrEqual(preExisting);
    return proofDifferences(client,proof);
   });
   expect(moved.rows.filter(line=>line.startsWith(`${table} `)&&line.endsWith(": changed")),`control (a) ${table}: ${JSON.stringify(moved)}`).toHaveLength(preExisting);expect(moved.types).toEqual([]);
   // (c) a nullable column added after 0123 must leave it passing.
   expect(await rolledBack(upgradeAdmin,async client=>{
    await client.query(`ALTER TABLE app.${table} ADD COLUMN f17_proof_control text`);
    expect((await proofColumns(client,table)).map(column=>column.name)).toContain("f17_proof_control");
    return proofDifferences(client,proof);
   })).toEqual({rows:[],types:[]});
  }
  // (b) a retype of a pre-existing column must fail the type comparison: one that keeps every serialised value, and one that changes only the length.
  expect(await rolledBack(upgradeAdmin,async client=>{
   await client.query("ALTER TABLE app.recovery_claim_line ALTER COLUMN net_pence TYPE numeric(20,0)");
   return proofDifferences(client,proof);
  })).toEqual({rows:[],types:["recovery_claim_line: net_pence bigint -> numeric(20,0)"]});
  expect(await rolledBack(upgradeAdmin,async client=>{
   await client.query("ALTER TABLE app.audit_event ALTER COLUMN event_type TYPE varchar(120)");
   return proofDifferences(client,proof);
  })).toEqual({rows:[],types:["audit_event: event_type character varying(100) -> character varying(120)"]});
  // (d) a function replaced after 0123 (here the very routine 0123 replaced) must leave it passing. The replacement is built from the routine's own header and body
  // under a delimiter chosen by the test, so it does not rely on how the stored definition is quoted.
  const routine="app.guard_recovery_eligibility_v3()";
  expect(await rolledBack(upgradeAdmin,async client=>{
   const {was,now}=await replaceRoutine(client,routine,"scratch control: replaced after 0123");
   expect(now.definition).not.toBe(was.definition);expect(now.body).toContain("scratch control: replaced after 0123");
   return proofDifferences(client,proof);
  })).toEqual({rows:[],types:[]});
  // (d2) delimiter collision: a legitimate later replacement whose body itself contains "$function$" (so PostgreSQL has to print it back under another delimiter),
  // and a second replacement made from that definition. Both must leave it passing.
  expect(await rolledBack(upgradeAdmin,async client=>{
   const first=await replaceRoutine(client,routine,"scratch control: a later body that itself contains $function$");
   expect(first.now.definition).not.toBe(first.was.definition);expect(first.now.body).toContain("$function$");
   expect(first.now.definition,"the collision made PostgreSQL print a different delimiter").not.toContain("AS $function$");
   const second=await replaceRoutine(client,routine,"scratch control: replaced a second time");
   expect(second.now.definition).not.toBe(second.was.definition);
   return proofDifferences(client,proof);
  })).toEqual({rows:[],types:[]});
  // (e) a pre-existing row that has gone must fail it: every one of them must still be present.
  const gone=await rolledBack(upgradeAdmin,async client=>{
   await client.query("SET LOCAL session_replication_role=replica");
   expect((await client.query("DELETE FROM app.recovery_claim_line")).rowCount).toBeGreaterThanOrEqual(Object.keys(proof.recovery_claim_line!.rows).length);
   return proofDifferences(client,proof);
  });
  expect(gone.rows).toHaveLength(Object.keys(proof.recovery_claim_line!.rows).length);expect(gone.rows.every(line=>line.startsWith("recovery_claim_line ")&&line.endsWith(": missing"))).toBe(true);expect(gone.types).toEqual([]);
  // (f) a row added after 0123 is ignored (a rolled-back scratch claim line here; the corrected review saved below is a real later row, with its audit events).
  expect(await rolledBack(upgradeAdmin,async client=>{
   await client.query("SET LOCAL session_replication_role=replica");
   expect((await client.query("INSERT INTO app.recovery_claim_line(id,tenant_id,job_id,case_id,review_id,kind,debtor_type,net_pence)SELECT $1::uuid,tenant_id,job_id,case_id,review_id,'fixed_compensation',debtor_type,1 FROM app.recovery_claim_line LIMIT 1",[randomUUID()])).rowCount).toBe(1);
   expect(Object.keys(await proofRows(client,"recovery_claim_line",proof.recovery_claim_line!.names,proof.recovery_claim_line!.pk))).toHaveLength(Object.keys(proof.recovery_claim_line!.rows).length+1);
   return proofDifferences(client,proof);
  })).toEqual({rows:[],types:[]});
  // (g) a review added after 0123 (a rolled-back copy of the saved one, one revision higher) must leave it passing, and the revision the next review has to be
  // appended against is read from the database, not assumed.
  const saved=await currentReviewRevision(upgradeAdmin,c.id);expect(saved).toBeGreaterThanOrEqual(1);
  const later=await rolledBack(upgradeAdmin,async client=>{
   await client.query("SET LOCAL session_replication_role=replica");
   expect((await client.query("INSERT INTO app.recovery_eligibility_v3_review(id,tenant_id,job_id,case_id,revision,case_revision,fixture,source_event_id,actor_membership_id,command_id,payload_hash,result)SELECT $1::uuid,tenant_id,job_id,case_id,revision+1,case_revision,fixture,source_event_id,actor_membership_id,$2::uuid,payload_hash,result FROM app.recovery_eligibility_v3_review WHERE tenant_id=$3 AND case_id=$4 AND revision=$5",[randomUUID(),randomUUID(),T,c.id,saved])).rowCount).toBe(1);
   expect(Object.keys(await proofRows(client,"recovery_eligibility_v3_review",proof.recovery_eligibility_v3_review!.names,proof.recovery_eligibility_v3_review!.pk))).toHaveLength(Object.keys(proof.recovery_eligibility_v3_review!.rows).length+1);
   return {revision:await currentReviewRevision(client,c.id),differences:await proofDifferences(client,proof)};
  });
  expect(later.differences).toEqual({rows:[],types:[]});expect(later.revision).toBe(saved+1);
  // (h) a case revision added after 0123 (a rolled-back claim revision one higher, the shape of an amendment) must leave it passing, and moves the case revision the next
  // review has to be appended against.
  const openedAt=await currentCaseRevision(upgradeAdmin,jobId,c.id);expect(openedAt).toBeGreaterThanOrEqual(c.revision);
  const amended=await rolledBack(upgradeAdmin,async client=>{
   await client.query("SET LOCAL session_replication_role=replica");
   expect((await client.query("INSERT INTO app.recovery_claim_revision(id,tenant_id,job_id,case_id,revision,claimed_net_pence,currency,reviewer_ref,subject_hash,previous_hash)SELECT $1::uuid,tenant_id,job_id,case_id,revision+1,claimed_net_pence,currency,reviewer_ref,encode(sha256(convert_to($2::text,'UTF8')),'hex'),subject_hash FROM app.recovery_claim_revision WHERE tenant_id=$3 AND case_id=$4 ORDER BY revision DESC LIMIT 1",[randomUUID(),randomUUID(),T,c.id])).rowCount).toBe(1);
   return {revision:await currentCaseRevision(client,jobId,c.id),differences:await proofDifferences(client,proof)};
  });
  expect(amended.differences).toEqual({rows:[],types:[]});expect(amended.revision).toBe(openedAt+1);
  const repo=new RecoveryEligibilityV3Repository(practiceMaterialPool(upgradeRuntime,auth.digest),"synthetic_demo");
  // The corrected review is appended against the case revision (read by the case repository's own reader) and the review revision the database holds now, so a case or
  // review a later migration appended is allowed, and any number of reviews may exist.
  const caseNow=(await cases.listForMember(ctx,jobId,actor)).find(x=>x.id===c.id);expect(caseNow?.revision).toBe(await currentCaseRevision(upgradeAdmin,jobId,c.id));
  const current=await currentReviewRevision(upgradeAdmin,c.id);expect(current).toBeGreaterThanOrEqual(saved);
  const corrected=await repo.review(ctx,jobId,review({id:c.id,revision:caseNow!.revision},"F17",current),actor,auth.digest);
  expect(corrected.result).toMatchObject({outcome:"excluded",qualifyingPrincipal:{pence:0,currency:"GBP"},reason:"Paid before you opened this case"});
  expect(corrected.revision).toBe(current+1);
  expect(await proofDifferences(upgradeAdmin,proof)).toEqual({rows:[],types:[]});
 }finally{
  await closeTestPools(upgradeRuntime,upgradeAdmin);await admin.query(`DROP DATABASE ${database}`);
 }
});
