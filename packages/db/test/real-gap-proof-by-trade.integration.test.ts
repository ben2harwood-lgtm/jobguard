import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createWatchdogHarness } from "./watchdog-command-harness.js";
import { JobProofStatementService, readJobProofStatement } from "../src/job-proof-statement.js";
import { withTenant } from "../src/tenant-context.js";
import { startBlankPracticeCompany } from "../src/blank-practice-company.js";
import { authenticatePracticeSession } from "../src/practice-session.js";
import { seedHomeOwner } from "./contractor-practice-session-fixtures.js";
import { DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID } from "../src/demo-seed.js";
import { workTenant } from "./job-work-state-fixtures.js";

// Main's work-state helpers: the expected revision is the job's current event head
// (site evidence may already have appended events), and an owner-only historical
// upload is a bound-membership import fixture, as in job-work-state-fixtures.insertPhoto.
async function workRevision(admin: Parameters<typeof workTenant>[0], tenant: string, job: string) {
 return Number((await admin.query("SELECT coalesce(max(sequence),0) revision FROM app.job_work_state_event WHERE tenant_id=$1 AND job_id=$2",[tenant,job])).rows[0]!.revision);
}
async function historicalUpload(admin: Parameters<typeof workTenant>[0], tenant: string, member: string, values: unknown[]) {
 await workTenant(admin, tenant, async db => {
  await db.query("SET LOCAL session_replication_role='replica'");
  await db.query("INSERT INTO app.evidence_upload(id,tenant_id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at) VALUES($1,$2,$3,$4,$5,$6,'image/png',100,'standard_evidence',clock_timestamp()+interval '1 day')", values);
 }, { membershipId: member });
}

// Same transaction-bound, exact-shape permit used by practice-session tests.
async function insertPracticeJob(client: { query: (sql: string, values?: unknown[]) => Promise<unknown> }, owner: Awaited<ReturnType<typeof authenticatePracticeSession>>, job: string, title: string, status: string) {
 const initialStatus=status==="live"?"quoting":status;
 await client.query("SELECT set_config('app.tenant_id',$1,true)",[owner.context.tenantId]);
 await client.query(`INSERT INTO app.lp_job_insert_permit(tenant_id,job_id,backend_pid,transaction_id,operation,insert_shape,actor_membership_id)
  VALUES($1,$2,pg_backend_pid(),pg_current_xact_id(),'practice_home',
   app.lp_job_insert_shape(jsonb_populate_record(NULL::app.job,jsonb_build_object(
    'tenant_id',$1::uuid,'id',$2::uuid,'title',$3::text,'status',$4::text,'revision',0,
    'practice_session_digest',$5::text,'practice_scenario','home','provenance','system_generated_quote'))),$6)`,
  [owner.context.tenantId,job,title,initialStatus,owner.digest,owner.membershipId]);
 await client.query("INSERT INTO app.job(tenant_id,id,title,status,practice_session_digest,practice_scenario) VALUES($1,$2,$3,$4,$5,'home')",
  [owner.context.tenantId,job,title,initialStatus,owner.digest]);
 if(status==="live") {
  // The job insert itself uses the normal permit and guards. Retain the
  // suite's existing owner-only synthetic live prerequisites after admission.
  await client.query("SET LOCAL session_replication_role='replica'");
  await client.query("UPDATE app.job SET status='live' WHERE tenant_id=$1 AND id=$2",[owner.context.tenantId,job]);
  await client.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'small_builder','synthetic_demo','backfilled_synthetic_fixture')",[owner.context.tenantId,job]);
 }
}

const base = createWatchdogHarness("real-gap-proof-by-trade", 63300);
let practice: Awaited<ReturnType<typeof authenticatePracticeSession>>;
const scopeIds = new Map<string,string>();
// Explicit owner fixtures prepare only fictional prerequisites. Every statement,
// upload, completion and receipt under test executes through the runtime role.
const h = {
 get admin() { return base.admin; }, get runtime() { return base.runtime; },
 get ctx() { return practice.context; }, get tenant() { return DEMO_TENANT_ID; },
 get member() { return DEMO_MEMBERSHIP_ID; }, get repos() { return base.repos; },
 get storage() { return base.storage; }, get png() { return base.png; }, get pngHash() { return base.pngHash; },
 pre: { async scope(job: string) { return scopeIds.get(job)!; } },
 async live() {
  const job = randomUUID(), scope = randomUUID(), client = await base.admin.connect();
  try {
   await client.query("BEGIN");
   await insertPracticeJob(client,practice,job,"Fictional decorating","live");
   await client.query("SET LOCAL session_replication_role='replica'");
   await client.query("INSERT INTO app.scope_identity(tenant_id,job_id,id,state) VALUES($1,$2,$3,'confirmed')",[DEMO_TENANT_ID,job,scope]);
   await client.query("INSERT INTO app.scope_progress(tenant_id,job_id,scope_item_id,stage) VALUES($1,$2,$3,'in_progress')",[DEMO_TENANT_ID,job,scope]);
   await client.query("COMMIT");
  } catch(error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  scopeIds.set(job,scope); return job;
 }
};
let service: JobProofStatementService;
beforeAll(async () => {
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
 await base.boot();
 await seedHomeOwner({ admin: base.admin } as Parameters<typeof seedHomeOwner>[0]);
 const token = await startBlankPracticeCompany(h.runtime,{version:"blank-practice-company.v1",action:"start"});
 practice = await authenticatePracticeSession(h.runtime,token);
 service = new JobProofStatementService(h.runtime);
}, 240_000);
afterAll(async () => { await base.stop(); vi.unstubAllEnvs(); });
const answer = (job: string, includesElectricalWork: boolean, commandId = randomUUID()) => service.answer(h.ctx, job, { version: "practice-proof-command.v1", action: "answer_statement", commandId, includesElectricalWork });
const read = (job: string) => withTenant(h.runtime, h.ctx, db => readJobProofStatement(db, job));
async function upload(job: string, persist?: () => Promise<void>) {
 const scopeItemId = await h.pre.scope(job);
 const result = await h.repos.evidence.beginUpload(h.ctx, { jobId: job, scopeItemId, expectedSha256: h.pngHash, contentType: "image/png", maximumBytes: h.png.length, expiresAt: new Date("2099-01-01") }, async (db, u) => {
  await db.$client.query(`INSERT INTO app.synthetic_evidence_original(tenant_id,upload_id,job_id,scope_item_id,object_key,object_version_id,environment,content_type,bytes) VALUES($1,$2,$3,$4,$5,'v1','synthetic_demo','image/png',$6)`, [h.tenant,u.id,job,scopeItemId,u.objectKey,h.png]);
  if (persist) await persist();
 });
 h.storage.put(result.objectKey,"v1",h.png);
 return { ...result, scopeItemId };
}
async function finish(job: string, electrical: boolean) {
 const u = await upload(job), type = electrical ? "electrical_certificate" : "completion_photo";
 await h.repos.evidence.finalize(h.ctx, { commandId: randomUUID(), uploadId: u.id, objectVersionId: "v1", evidenceType: type });
 const command = { version: "proof.complete.v1", commandId: randomUUID(), actorMembershipId: h.member, jobId: job, scopeItemId: u.scopeItemId, stage: electrical ? "electrical-stage" : "completion-photo-stage", evidenceId: u.id, requiredEvidenceType: type, decisionId: null };
 return { u, command, result: await h.repos.proof.complete(h.ctx, command) };
}

describe("explicit job proof statements", () => {
 it("absent statement preserves legacy scoped proof admission without inventing a trade from the job title", async () => {
  const job = await h.live();
  expect(await read(job)).toMatchObject({ statement: null, requiredEvidenceType: "electrical_certificate", stage:"electrical-stage", blockage:null });
  await expect(upload(job)).resolves.toMatchObject({scopeItemId:await h.pre.scope(job)});
  expect((await h.admin.query("SELECT count(*)::int n FROM app.evidence_upload WHERE job_id=$1",[job])).rows[0].n).toBe(1);
 });
 it.each([true,false])("%s derives the exact evidence type and distinct stage, preserving completion and invalidation replay", async electrical => {
  const job = await h.live(), statement = await answer(job,electrical);
  expect(await read(job)).toMatchObject({ statement: statement.statement, requiredEvidenceType: electrical ? "electrical_certificate" : "completion_photo", stage: electrical ? "electrical-stage" : "completion-photo-stage" });
  const completed = await finish(job,electrical);
  await expect(answer(job,!electrical)).rejects.toThrow("PROOF_STATEMENT_FROZEN");
  await expect(answer(job,electrical)).rejects.toThrow("PROOF_STATEMENT_FROZEN");
  await expect(h.repos.proof.complete(h.ctx,{...completed.command,commandId:randomUUID(),stage:electrical?"completion-photo-stage":"electrical-stage"})).rejects.toThrow();
  await h.repos.proof.invalidate(h.ctx,{version:"proof.invalidate.v1",commandId:randomUUID(),actorMembershipId:h.member,evidenceId:completed.u.id,reasonCode:"verification_invalid"});
  expect(await h.repos.proof.complete(h.ctx,completed.command)).toEqual(completed.result);
  expect((await h.admin.query("SELECT count(*)::int n FROM app.stage_review_event WHERE stage_completion_id=$1",[completed.result.completionId])).rows[0].n).toBe(1);
 });
 it("keeps same-answer timestamps and results, rejects changed-payload replay, and gives Yes → No → Yes three immutable identities", async () => {
  const job=await h.live(), id=randomUUID(), first=await answer(job,true,id);
  expect(await answer(job,true,id)).toEqual(first);
  expect(await answer(job,true)).toEqual(first);
  await expect(answer(job,false,id)).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  const no=await answer(job,false), yes=await answer(job,true);
  expect(new Set([first.statement.id,no.statement.id,yes.statement.id]).size).toBe(3);
  expect((await h.admin.query("SELECT revision FROM app.job_proof_statement WHERE job_id=$1 ORDER BY revision",[job])).rows.map(r=>r.revision)).toEqual([1,2,3]);
  expect((await h.admin.query("SELECT count(*)::int n FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2 AND status='succeeded'",[h.tenant,id])).rows[0].n).toBe(1);
 });
 it("refuses direct runtime statement, binding and result forgery", async () => {
  const job=await h.live();await answer(job,false);
  expect((await h.runtime.query("SELECT has_column_privilege(current_user,'public.jobguard_schema_migration','migration_name','SELECT') allowed")).rows[0].allowed).toBe(false);
  for(const table of ["job_proof_statement","final_account_proof_statement"]){
   await expect(withTenant(h.runtime,h.ctx,db=>db.$client.query(`SELECT * FROM app.${table}`))).rejects.toMatchObject({code:"42501"});
   await expect(withTenant(h.runtime,h.ctx,db=>db.$client.query(`INSERT INTO app.${table} DEFAULT VALUES`))).rejects.toMatchObject({code:"42501"});
  }
 });
 it("refuses another blank firm sharing the tenant before reading the statement", async () => {
  const old=process.env.JOBGUARD_ENV;process.env.JOBGUARD_ENV="synthetic_demo";
  try {
   const one=await startBlankPracticeCompany(h.runtime,{version:"blank-practice-company.v1",action:"start"});
   const two=await startBlankPracticeCompany(h.runtime,{version:"blank-practice-company.v1",action:"start"});
   const first=await authenticatePracticeSession(h.runtime,one),other=await authenticatePracticeSession(h.runtime,two);
   const job=randomUUID();
   await withTenant(h.admin,first.context,db=>insertPracticeJob(db.$client,first,job,"Fictional decorating","draft"));
   await withTenant(h.runtime,first.context,db=>readJobProofStatement(db,job));
   await expect(withTenant(h.runtime,other.context,db=>readJobProofStatement(db,job))).rejects.toThrow("NOT_FOUND");
  } finally {if(old===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=old;}
 });
 it("checks revocation before returning an unchanged command result", async () => {
  const job=await h.live(), id=randomUUID();await answer(job,true,id);
  await h.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[h.tenant,h.member]);
  try {await expect(answer(job,true,id)).rejects.toThrow();}
  finally {await h.admin.query("UPDATE app.membership SET revoked_at=NULL WHERE tenant_id=$1 AND id=$2",[h.tenant,h.member]);}
 });
 it("rechecks a changed statement after waiting for an upload admission", async () => {
  const job=await h.live();await answer(job,false);
  let entered!:()=>void,release!:()=>void;
  const ready=new Promise<void>(done=>{entered=done}),gate=new Promise<void>(done=>{release=done});
  const writing=upload(job,async()=>{entered();await gate;});await ready;
  const changing=answer(job,true);release();
  await writing;await expect(changing).rejects.toThrow("PROOF_STATEMENT_FROZEN");
  expect((await read(job)).statement?.includesElectricalWork).toBe(false);
 });
 it("a legacy upload stays usable and freezes a later answer", async () => {
  const job=await h.live(),scope=await h.pre.scope(job);
  await historicalUpload(h.admin,h.tenant,h.member,[randomUUID(),h.tenant,job,scope,"historical/original",createHash("sha256").update("fictional").digest("hex")]);
  expect(await read(job)).toMatchObject({statement:null,canChange:false,requiredEvidenceType:"electrical_certificate",blockage:null});
  await expect(answer(job,false)).rejects.toThrow("PROOF_STATEMENT_FROZEN");
 });
});

describe("statement receipt custody", () => {
 it("refuses real-identity credentials even for an unanswered unowned practice job", async () => {
  const job=await base.live();
  await expect(service.answer(base.ctx,job,{version:"practice-proof-command.v1",action:"answer_statement",commandId:randomUUID(),includesElectricalWork:false})).rejects.toThrow("FORBIDDEN");
  await expect(withTenant(base.runtime,base.ctx,db=>db.$client.query("SELECT app.read_job_proof_statement($1)",[job]))).rejects.toThrow("FORBIDDEN");
 });
 it("rejects direct forged successes and all callable generic receipt producers", async () => {
  const job=await h.live(),cid=randomUUID(),first=await answer(job,false);
  const resource={tenantId:h.tenant,actorMembershipId:h.member,subjectType:"job",subjectRef:job};
  // Inspect installed definitions and EXECUTE permissions, rather than assuming
  // table revocation alone closes the definer paths.
  const paths=(await h.admin.query(`SELECT p.oid::regprocedure::text signature,pg_get_userbyid(p.proowner) owner,
   pg_get_functiondef(p.oid) definition,has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') callable
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='app' AND p.proname IN('begin_command','complete_command','record_repository_command','lp5_command_result','lp5b_projection_result') ORDER BY p.proname`)).rows;
  expect(paths.find(p=>p.signature.startsWith("app.begin_command("))).toMatchObject({callable:true,owner:"jobguard_command_writer"});
  expect(paths.find(p=>p.signature.startsWith("app.complete_command("))).toMatchObject({callable:true,owner:"jobguard_command_writer"});
  for(const type of ["proof.statement","proof.complete"]){
   for(const forged of [first,{...first,jobId:randomUUID()},{...first,statement:{...first.statement,id:randomUUID()}}]) {
    await expect(withTenant(h.runtime,h.ctx,db=>db.$client.query(`INSERT INTO app.command_receipt(tenant_id,command_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)
     VALUES($1,$2,$3,$4,$5,'succeeded',$6,$7,clock_timestamp())`,[h.tenant,cid,type,`proof-statement:${job}:${cid}`,"a".repeat(64),forged,h.member]))).rejects.toThrow();
   }
  }
  await expect(withTenant(h.runtime,h.ctx,db=>db.$client.query("SELECT app.begin_command($1,$2,$3,$4,$5,$6,$7)",["practice-proof-command.v1",cid,"proof.statement",`proof-statement:${job}:${cid}`,resource,{}, {includesElectricalWork:false}]))).rejects.toThrow();
  for(const result of [first,{}, {statementId:first.statement.id},{id:first.statement.id},{locked:true}]) {
   await expect(withTenant(h.runtime,h.ctx,db=>db.$client.query("SELECT app.complete_command($1,$2)",[cid,result]))).rejects.toThrow();
  }
  for(const path of paths.filter(p=>p.callable&&!p.signature.startsWith("app.begin_command(")&&!p.signature.startsWith("app.complete_command("))) {
   expect(path.signature).toMatch(/^app\.record_repository_command\(uuid\)$/);
   await expect(withTenant(h.runtime,h.ctx,db=>db.$client.query("SELECT app.record_repository_command($1)",[cid]))).rejects.toThrow();
  }
  expect((await h.admin.query("SELECT count(*)::int n FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2",[h.tenant,cid])).rows[0].n).toBe(0);
 });
 it("rejects processing-to-success manufacture and changed identities on successful receipts", async () => {
  const job=await h.live(),cid=randomUUID();await answer(job,true,cid);
  for(const sql of [
   "UPDATE app.command_receipt SET status='processing' WHERE tenant_id=$1 AND command_id=$2",
   "UPDATE app.command_receipt SET status='succeeded',result='{}' WHERE tenant_id=$1 AND command_id=$2",
   "UPDATE app.command_receipt SET command_type='proof.complete' WHERE tenant_id=$1 AND command_id=$2",
   "DELETE FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2",
  ]) await expect(withTenant(h.runtime,h.ctx,db=>db.$client.query(sql,[h.tenant,cid]))).rejects.toThrow();
 });
 it("rolls back statement, successful receipt and audit when a failure is injected before commit", async () => {
  const job=await h.live(),cid=randomUUID();
  await expect(withTenant(h.runtime,h.ctx,async db=>{
   await db.$client.query("SELECT app.answer_job_proof_statement($1,$2)",[job,{version:"practice-proof-command.v1",action:"answer_statement",commandId:cid,includesElectricalWork:false}]);
   throw new Error("injected-before-commit");
  })).rejects.toThrow("injected-before-commit");
  expect((await h.admin.query("SELECT count(*)::int n FROM app.job_proof_statement WHERE tenant_id=$1 AND job_id=$2",[h.tenant,job])).rows[0].n).toBe(0);
  expect((await h.admin.query("SELECT count(*)::int n FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2",[h.tenant,cid])).rows[0].n).toBe(0);
  expect((await h.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND payload->'references'->>'commandId'=$2",[h.tenant,cid])).rows[0].n).toBe(0);
 });
 it("allows only the exact successful authorized retry after proof admission", async () => {
  const job=await h.live(),cid=randomUUID(),first=await answer(job,false,cid);
  await upload(job);
  expect(await answer(job,false,cid)).toEqual(first);
  await expect(answer(job,false)).rejects.toThrow("PROOF_STATEMENT_FROZEN");
  await expect(answer(job,true,cid)).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  await expect(answer(await h.live(),false,cid)).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  expect((await h.admin.query("SELECT count(*)::int n FROM app.job_proof_statement WHERE job_id=$1",[job])).rows[0].n).toBe(1);
 });
});

it("No requires verified completion photo; absent statement preserves legacy hashes on populated upgrade", async () => {
 const { startBeforeMigration }=await import("./contractor-practice-session-fixtures.js");
 const { preparedTrialFixture }=await import("./free-first-job-lifecycle-fixtures.js");
 const { FinalAccountCommandService }=await import("../src/final-account-repository.js");
 const { FinalAccountLockRepository }=await import("../src/final-account-lock-repository.js");
 const { ProofCommandService }=await import("../src/proof-repository.js");
 const { JobWorkStateRepository }=await import("../src/job-work-state-repository.js");
 const { migrate }=await import("../src/migrate.js");
 const c=await startBeforeMigration("0943_job_proof_statement.sql","jobguard_synthetic_demo");
 try {
  const f=c as unknown as import("./job-work-state-fixtures.js").WorkFixture;
  const a=await preparedTrialFixture(f,{withTrial:false}),locked=await preparedTrialFixture(f,{withTrial:false});
  const assembly=new FinalAccountCommandService(c.runtime),locks=new FinalAccountLockRepository(c.runtime);
  const assemble=(value:typeof a)=>assembly.assemble(value.context,{version:"final-account.assemble.v1",commandId:randomUUID(),actorMembershipId:value.actorId,jobId:value.jobId});
  expect(await withTenant(c.runtime,a.context,db=>readJobProofStatement(db,a.jobId))).toMatchObject({statement:null,requiredEvidenceType:"electrical_certificate"});
  await expect(new JobProofStatementService(c.runtime).answer(a.context,a.jobId,{version:"practice-proof-command.v1",action:"answer_statement",commandId:randomUUID(),includesElectricalWork:false})).rejects.toThrow("PROOF_SCHEMA_UNAVAILABLE");
  const first=await assemble(a);
  expect(first.sourceHash).toBe(createHash("sha256").update(first.canonicalSource).digest("hex"));
  const proof=new ProofCommandService(c.runtime,a.storage),item=a.proofs[0]!;
  const commandId=(await c.admin.query("SELECT command_id FROM app.stage_completion WHERE tenant_id=$1 AND id=$2",[a.tenantId,item.completionId])).rows[0].command_id;
  const completion={version:"proof.complete.v1",commandId,actorMembershipId:a.actorId,jobId:a.jobId,scopeItemId:item.scopeId,stage:"electrical-stage",evidenceId:item.evidenceId,requiredEvidenceType:"electrical_certificate",decisionId:null};
  const replay=await proof.complete(a.context,completion);
  await proof.invalidate(a.context,{version:"proof.invalidate.v1",commandId:randomUUID(),actorMembershipId:a.actorId,evidenceId:item.evidenceId,reasonCode:"verification_invalid"});
  const invalidated=await assemble(a);
  const invalidations=(await c.admin.query("SELECT i.id,i.evidence_id FROM app.evidence_invalidation i JOIN app.evidence_object e ON(e.tenant_id,e.id)=(i.tenant_id,i.evidence_id) WHERE i.tenant_id=$1 AND e.job_id=$2 ORDER BY i.id",[a.tenantId,a.jobId])).rows;
  expect(invalidated.sourceHash).toBe(createHash("sha256").update(JSON.stringify({source:invalidated.canonicalSource,proofInvalidations:invalidations})).digest("hex"));
  expect(invalidated.sourceHash).not.toBe(first.sourceHash);
  const lockedAccount=await assemble(locked);
  await new JobWorkStateRepository(c.runtime).finish(locked.context,locked.jobId,locked.actorId,{version:"job-work-state-command.v1",commandId:randomUUID(),action:"finish",expectedRevision:await workRevision(c.admin,locked.tenantId,locked.jobId)});
  await locks.acceptTerms(locked.context,{actorMembershipId:locked.actorId,commandId:randomUUID(),termsVersion:"synthetic_final_check_terms.v1"});
  await locks.disposition(locked.context,{jobId:locked.jobId,actorMembershipId:locked.actorId,commandId:randomUUID(),scopeItemId:locked.scopeId,disposition:"done"});
  const lockInput={jobId:locked.jobId,actorMembershipId:locked.actorId,commandId:randomUUID(),finalAccountRevisionId:lockedAccount.id,expectedRevision:lockedAccount.revision,declarationVersion:"final_account_declaration.v1" as const};
  const historicalLock=await locks.lock(locked.context,lockInput);
  const snapshot=async()=>{
   const rows:Record<string,string[]>={};
   for(const table of ["evidence_upload","evidence_object","evidence_link","stage_completion","evidence_invalidation","stage_review_event","final_account_revision","final_account_proof","final_account_lock"])
    rows[table]=(await c.admin.query(`SELECT row_to_json(x)::text bytes FROM app.${table} x WHERE tenant_id=ANY($1::uuid[]) ORDER BY row_to_json(x)::text`,[[a.tenantId,locked.tenantId]])).rows.map(r=>r.bytes);
   return rows;
  };
  const before=await snapshot(),beforeRead=await assembly.read(a.context,a.jobId);
  // The migration and its ledger record are installed atomically by the real loader.
  await migrate(c.admin);await migrate(c.admin);
  expect(await snapshot()).toEqual(before);
  expect(await assembly.read(a.context,a.jobId)).toEqual(beforeRead);
  expect(await assemble(a)).toMatchObject({id:invalidated.id,sourceHash:invalidated.sourceHash,reused:true});
  expect(await proof.complete(a.context,completion)).toEqual(replay);
  expect(await locks.lock(locked.context,lockInput)).toEqual(historicalLock);
  expect((await c.admin.query("SELECT count(*)::int n FROM app.final_account_proof_statement")).rows[0].n).toBe(0);
  const token=await startBlankPracticeCompany(c.runtime,{version:"blank-practice-company.v1",action:"start"});
  const owner=await authenticatePracticeSession(c.runtime,token),fresh=randomUUID(),scope=randomUUID();
  const fixture=await c.admin.connect();
  try {
   await fixture.query("BEGIN");
   await insertPracticeJob(fixture,owner,fresh,"Fictional completion photo","live");
   await fixture.query("SET LOCAL session_replication_role='replica'");
   await fixture.query("INSERT INTO app.scope_identity(tenant_id,job_id,id,state) VALUES($1,$2,$3,'confirmed')",[owner.context.tenantId,fresh,scope]);
   await fixture.query("INSERT INTO app.scope_progress(tenant_id,job_id,scope_item_id,stage) VALUES($1,$2,$3,'in_progress')",[owner.context.tenantId,fresh,scope]);
   await fixture.query("COMMIT");
  } catch(error){await fixture.query("ROLLBACK");throw error;}finally{fixture.release();}
  const no=await new JobProofStatementService(c.runtime).answer(owner.context,fresh,{version:"practice-proof-command.v1",action:"answer_statement",commandId:randomUUID(),includesElectricalWork:false});
  expect(no.statement.includesElectricalWork).toBe(false);
  expect(await withTenant(c.runtime,owner.context,db=>readJobProofStatement(db,fresh))).toMatchObject({requiredEvidenceType:"completion_photo",stage:"completion-photo-stage"});
 } finally {await c.close();}
},300_000);

describe("schema presence and command serialization", () => {
 it("fails closed for partial installed objects and uses complete objects without ledger access", async () => {
  const job=await h.live();
  await h.admin.query("ALTER FUNCTION app.job_proof_requirement(uuid,uuid) RENAME TO proof_requirement_missing_fixture");
  try {
   await expect(read(job)).rejects.toThrow("PROOF_SCHEMA_INCONSISTENT");
   await expect(answer(job,false)).rejects.toThrow("PROOF_SCHEMA_INCONSISTENT");
  } finally { await h.admin.query("ALTER FUNCTION app.proof_requirement_missing_fixture(uuid,uuid) RENAME TO job_proof_requirement"); }
  await h.admin.query("UPDATE public.jobguard_schema_migration SET migration_name='0943_missing_record_fixture.sql' WHERE migration_name='0943_job_proof_statement.sql'");
  try { expect(await read(job)).toMatchObject({statement:null,requiredEvidenceType:"electrical_certificate"}); }
  finally { await h.admin.query("UPDATE public.jobguard_schema_migration SET migration_name='0943_job_proof_statement.sql' WHERE migration_name='0943_missing_record_fixture.sql'"); }
  expect(await read(job)).toMatchObject({statement:null,requiredEvidenceType:"electrical_certificate"});
 });
 it("answer-first serialization lets the later upload use only that saved requirement", async () => {
  const job=await h.live(),cid=randomUUID();
  let enter!:()=>void,release!:()=>void;
  const entered=new Promise<void>(resolve=>{enter=resolve}),gate=new Promise<void>(resolve=>{release=resolve});
  const writing=withTenant(h.runtime,h.ctx,async db=>{
   const result=(await db.$client.query("SELECT app.answer_job_proof_statement($1,$2) result",[job,{version:"practice-proof-command.v1",action:"answer_statement",commandId:cid,includesElectricalWork:false}])).rows[0].result;
   enter();await gate;return result;
  });
  await entered;
  const uploading=upload(job);
  release();
  await writing;const u=await uploading;
  expect((await read(job)).requiredEvidenceType).toBe("completion_photo");
  await h.repos.evidence.finalize(h.ctx,{commandId:randomUUID(),uploadId:u.id,objectVersionId:"v1",evidenceType:"electrical_certificate"});
  await expect(h.repos.proof.complete(h.ctx,{version:"proof.complete.v1",commandId:randomUUID(),actorMembershipId:h.member,jobId:job,scopeItemId:u.scopeItemId,stage:"electrical-stage",evidenceId:u.id,requiredEvidenceType:"electrical_certificate",decisionId:null})).rejects.toThrow("PROOF_NOT_FINAL");
 });
 it("No refuses missing originals, wrong proof and invalidation without weakening historical completion replay", async () => {
  const job=await h.live();await answer(job,false);
  const u=await upload(job);
  await h.repos.evidence.finalize(h.ctx,{commandId:randomUUID(),uploadId:u.id,objectVersionId:"v1",evidenceType:"completion_photo"});
  const command={version:"proof.complete.v1",commandId:randomUUID(),actorMembershipId:h.member,jobId:job,scopeItemId:u.scopeItemId,stage:"completion-photo-stage",evidenceId:u.id,requiredEvidenceType:"completion_photo",decisionId:null};
  const missingJob=await h.live();await answer(missingJob,false);
  const missingScope=await h.pre.scope(missingJob);
  const missing=await h.repos.evidence.beginUpload(h.ctx,{jobId:missingJob,scopeItemId:missingScope,expectedSha256:h.pngHash,contentType:"image/png",maximumBytes:h.png.length,expiresAt:new Date("2099-01-01")});
  // The external adapter has bytes, but there is no immutable practice original.
  // Completion must independently refuse that incomplete evidence chain.
  h.storage.put(missing.objectKey,"v1",h.png);
  await h.repos.evidence.finalize(h.ctx,{commandId:randomUUID(),uploadId:missing.id,objectVersionId:"v1",evidenceType:"completion_photo"});
  await expect(h.repos.proof.complete(h.ctx,{...command,commandId:randomUUID(),jobId:missingJob,scopeItemId:missingScope,evidenceId:missing.id})).rejects.toThrow("PROOF_NOT_FINAL");
  const completed=await h.repos.proof.complete(h.ctx,command);
  await h.repos.proof.invalidate(h.ctx,{version:"proof.invalidate.v1",commandId:randomUUID(),actorMembershipId:h.member,evidenceId:u.id,reasonCode:"verification_invalid"});
  expect(await h.repos.proof.complete(h.ctx,command)).toEqual(completed);
  await expect(h.repos.proof.complete(h.ctx,{...command,commandId:randomUUID()})).rejects.toThrow();
 });
});

async function ownedAccount(job: string) {
 const { exactTarget }=await import("./free-first-job-lifecycle-fixtures.js");
 const scope=await h.pre.scope(job);
 const target=await exactTarget({admin:h.admin,runtime:h.runtime} as Parameters<typeof exactTarget>[0],{tenantId:h.tenant,actorId:h.member,jobId:job,scopeId:scope,context:h.ctx} as Parameters<typeof exactTarget>[1]);
 const revision=randomUUID(),client=await h.admin.connect();
 try {
  await client.query("BEGIN");await client.query("SET LOCAL session_replication_role='replica'");
  await client.query("INSERT INTO app.scope_revision(id,tenant_id,job_id,scope_item_id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence) VALUES($1,$2,$3,$4,1,'Fictional decorating','1','item',100000,100000)",[revision,h.tenant,job,scope]);
  await client.query("INSERT INTO app.quote_line(id,tenant_id,job_id,quote_revision_id,scope_item_id,scope_revision_id,origin,description,included,quantity_decimal,unit,unit_rate_pence,discount_decimal,tax_treatment,rate_provenance,ordinal) VALUES($1,$2,$3,$4,$5,$6,'human','Fictional decorating',true,'1','item',100000,'0','standard_rate_20','entered',1)",[randomUUID(),h.tenant,job,target.revisionId,scope,revision]);
  await client.query("UPDATE app.job SET status='live',baseline_quote_version_id=$3,accepted_net_value_pence=100000,fee_policy_version='reference_fee_policy_v3',recovery_cap_pence=NULL WHERE tenant_id=$1 AND id=$2",[h.tenant,job,target.documentId]);
  await client.query("COMMIT");
 }catch(error){await client.query("ROLLBACK");throw error;}finally{client.release();}
 const {FinalAccountCommandService}=await import("../src/final-account-repository.js");
 const assembly=new FinalAccountCommandService(h.runtime);
 const command=()=>({version:"final-account.assemble.v1",commandId:randomUUID(),actorMembershipId:h.member,jobId:job});
 return {assembly,command,scope};
}

// Transparent runtime pool observation, following the existing proof-invalidation
// race harness. Only the first matching real SQL response is paused; no DB fact
// or successful application response is substituted.
function pauseStatement(needle: string) {
 let entered!:()=>void,release!:()=>void,paused=false;
 const ready=new Promise<void>(resolve=>{entered=resolve}),gate=new Promise<void>(resolve=>{release=resolve});
 const pool=new Proxy(h.runtime,{get(target,key){
  if(key==="connect")return async()=>{
   const client=await target.connect();
   return new Proxy(client,{get(connection,property){
    if(property==="query")return async(sql:string,values?:unknown[])=>{
     const result=await connection.query(sql,values);
     if(!paused&&sql.includes(needle)){paused=true;entered();await gate;}
     return result;
    };
    const value=Reflect.get(connection,property);return typeof value==="function"?value.bind(connection):value;
   }});
  };
  const value=Reflect.get(target,key);return typeof value==="function"?value.bind(target):value;
 }});
 return {pool,ready,release};
}

describe("revision statement identity and assembly serialization",()=>{
 it("assembly-first keeps its unanswered revision unbound; answer-first binds the exact saved identity",async()=>{
  const {FinalAccountCommandService}=await import("../src/final-account-repository.js");
  for(const first of ["assembly","answer"]){
   const job=await h.live(),a=await ownedAccount(job),pause=pauseStatement(first==="assembly"?"INSERT INTO app.final_account_revision":"SELECT app.answer_job_proof_statement");
   const cid=randomUUID(),answerCommand={version:"practice-proof-command.v1",action:"answer_statement",commandId:cid,includesElectricalWork:false};
   if(first==="assembly"){
    const assembling=new FinalAccountCommandService(pause.pool).assemble(h.ctx,a.command());
    await pause.ready;const answering=answer(job,false,cid);pause.release();
    const old=await assembling,saved=await answering;
    expect(await withTenant(h.runtime,h.ctx,db=>readJobProofStatement(db,job,old.id))).toMatchObject({statement:null});
    const next=await a.assembly.assemble(h.ctx,a.command());
    expect(next.sourceHash).not.toBe(old.sourceHash);
    expect(await a.assembly.read(h.ctx,job)).toMatchObject({proofStatement:saved.statement});
   }else{
    const answering=new JobProofStatementService(pause.pool).answer(h.ctx,job,answerCommand);
    await pause.ready;const assembling=a.assembly.assemble(h.ctx,a.command());pause.release();
    const saved=await answering,current=await assembling;
    expect(await withTenant(h.runtime,h.ctx,db=>readJobProofStatement(db,job,current.id))).toMatchObject({statement:saved.statement});
   }
  }
 });
 it("Yes to No to Yes creates fresh source hashes and cannot reuse either earlier revision",async()=>{
  const job=await h.live(),a=await ownedAccount(job),ids:string[]=[],hashes:string[]=[];
  for(const electrical of [true,false,true]){
   const saved=await answer(job,electrical),revision=await a.assembly.assemble(h.ctx,a.command());
   ids.push(revision.id);hashes.push(revision.sourceHash);
   expect(await a.assembly.read(h.ctx,job)).toMatchObject({proofStatement:saved.statement});
  }
  expect(new Set(ids).size).toBe(3);expect(new Set(hashes).size).toBe(3);
 });
 it("No completes only with a verified original photo and assembles it into the explicit source",async()=>{
  const job=await h.live(),a=await ownedAccount(job),saved=await answer(job,false);
  const blocked=await a.assembly.assemble(h.ctx,a.command());expect(blocked.issueBlocked).toBe(true);
  const completed=await finish(job,false),current=await a.assembly.assemble(h.ctx,a.command());
  expect(current.issueBlocked).toBe(false);
  expect(current.proof.map(p=>p.evidenceType)).toEqual(["completion_photo"]);
  expect(await a.assembly.read(h.ctx,job)).toMatchObject({proofStatement:saved.statement});
  expect((await h.admin.query("SELECT statement_id,source_hash FROM app.final_account_proof_statement WHERE tenant_id=$1 AND job_id=$2 AND revision_id=$3",[h.tenant,job,current.id])).rows).toEqual([{statement_id:saved.statement.id,source_hash:current.sourceHash}]);
  await h.repos.proof.invalidate(h.ctx,{version:"proof.invalidate.v1",commandId:randomUUID(),actorMembershipId:h.member,evidenceId:completed.u.id,reasonCode:"verification_invalid"});
  expect(await a.assembly.assemble(h.ctx,a.command())).toMatchObject({issueBlocked:true});
 });
});

async function lockablePhotoAccount() {
 const {FinalAccountLockRepository}=await import("../src/final-account-lock-repository.js");
 const {JobWorkStateRepository}=await import("../src/job-work-state-repository.js");
 const job=await h.live(),a=await ownedAccount(job),statementCommand=randomUUID(),saved=await answer(job,false,statementCommand),proof=await finish(job,false);
 const account=await a.assembly.assemble(h.ctx,a.command()),locks=new FinalAccountLockRepository(h.runtime);
 expect(account.issueBlocked).toBe(false);
 await new JobWorkStateRepository(h.runtime).finish(h.ctx,job,practice.digest,{version:"job-work-state-command.v1",commandId:randomUUID(),action:"finish",expectedRevision:await workRevision(h.admin,h.tenant,job)});
 await locks.acceptTerms(h.ctx,{actorMembershipId:h.member,commandId:randomUUID(),termsVersion:"synthetic_final_check_terms.v1"});
 await locks.disposition(h.ctx,{jobId:job,actorMembershipId:h.member,commandId:randomUUID(),scopeItemId:a.scope,disposition:"done"});
 const input={jobId:job,actorMembershipId:h.member,commandId:randomUUID(),finalAccountRevisionId:account.id,expectedRevision:account.revision,declarationVersion:"final_account_declaration.v1" as const};
 return {job,a,account,locks,input,proof,saved,statementCommand};
}

describe("explicit lock enforcement and invalidation serialization",()=>{
 it("rejects runtime source/binding forgery and keeps exact statement replay after a real lock",async()=>{
  const p=await lockablePhotoAccount();
  for(const sql of [
   "UPDATE app.final_account_revision SET issue_blocked=false WHERE tenant_id=$1 AND job_id=$2",
   "UPDATE app.final_account_proof_statement SET source_hash=repeat('0',64) WHERE tenant_id=$1 AND job_id=$2",
   "INSERT INTO app.final_account_proof_statement(tenant_id,job_id,revision_id,statement_id,source_hash) SELECT tenant_id,job_id,revision_id,statement_id,source_hash FROM app.final_account_proof_statement WHERE tenant_id=$1 AND job_id=$2",
  ])await expect(withTenant(h.runtime,h.ctx,db=>db.$client.query(sql,[h.tenant,p.job]))).rejects.toThrow();
  const locked=await p.locks.lock(h.ctx,p.input);
  expect(await answer(p.job,false,p.statementCommand)).toEqual(p.saved);
  await expect(answer(p.job,false)).rejects.toThrow("PROOF_STATEMENT_FROZEN");
  expect(await p.locks.lock(h.ctx,p.input)).toEqual(locked);
 });
 it("invalidation-first prevents the waiting lock from accepting its stale proof",async()=>{
  const {ProofCommandService}=await import("../src/proof-repository.js");
  const p=await lockablePhotoAccount(),pause=pauseStatement("INSERT INTO app.evidence_invalidation");
  const invalidating=new ProofCommandService(pause.pool,h.storage).invalidate(h.ctx,{version:"proof.invalidate.v1",commandId:randomUUID(),actorMembershipId:h.member,evidenceId:p.proof.u.id,reasonCode:"verification_invalid"});
  await pause.ready;const locking=p.locks.lock(h.ctx,p.input);pause.release();
  await invalidating;await expect(locking).rejects.toThrow();
  expect((await h.admin.query("SELECT count(*)::int n FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2",[h.tenant,p.job])).rows[0].n).toBe(0);
 });
 it("lock-first retains its immutable lock when invalidation subsequently requires proof review",async()=>{
  const {FinalAccountLockRepository}=await import("../src/final-account-lock-repository.js");
  const p=await lockablePhotoAccount(),pause=pauseStatement("FROM app.lock_final_account");
  const locking=new FinalAccountLockRepository(pause.pool).lock(h.ctx,p.input);
  await pause.ready;const invalidating=h.repos.proof.invalidate(h.ctx,{version:"proof.invalidate.v1",commandId:randomUUID(),actorMembershipId:h.member,evidenceId:p.proof.u.id,reasonCode:"verification_invalid"});
  pause.release();const locked=await locking;
  await invalidating;
  expect(await p.locks.lock(h.ctx,p.input)).toEqual(locked);
  expect((await h.admin.query("SELECT count(*)::int n FROM app.stage_review_event WHERE tenant_id=$1 AND stage_completion_id=$2",[h.tenant,p.proof.result.completionId])).rows[0].n).toBe(1);
 });
});

it("statement IDs conflict with evidence IDs in both directions, including historical unclaimed uploads",async()=>{
 const statementJob=await h.live(),uploadJob=await h.live(),cid=randomUUID();
 await answer(statementJob,false,cid);
 await expect(h.repos.evidence.beginUpload(h.ctx,{id:cid,jobId:uploadJob,scopeItemId:await h.pre.scope(uploadJob),expectedSha256:h.pngHash,contentType:"image/png",maximumBytes:h.png.length,expiresAt:new Date("2099-01-01")})).rejects.toThrow("IDEMPOTENCY_CONFLICT");
 const u=await upload(uploadJob);
 await expect(answer(await h.live(),false,u.id)).rejects.toThrow("IDEMPOTENCY_CONFLICT");
 const orphan=randomUUID();
 await expect(withTenant(h.runtime,h.ctx,db=>db.$client.query("INSERT INTO app.watchdog_command_identity(tenant_id,command_id,job_id,command_type,request_hash) VALUES($1,$2,$3,'proof.statement',$4)",[h.tenant,orphan,statementJob,"a".repeat(64)]))).rejects.toThrow("PROOF_STATEMENT_RECEIPT_INVALID");
 const historical=randomUUID(),scope=await h.pre.scope(uploadJob);
 await historicalUpload(h.admin,h.tenant,h.member,[historical,h.tenant,uploadJob,scope,`fictional/${historical}`,h.pngHash]);
 await expect(answer(await h.live(),false,historical)).rejects.toThrow("IDEMPOTENCY_CONFLICT");
});
