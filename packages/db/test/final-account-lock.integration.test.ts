import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createLockSnapshot, hashLockCaptureRegister, hashLockLineSet, hashLockScopeDispositions, verifyFinalAccountLockSnapshot, captureRegisterNetPence, candidateM1TaxPolicy, money, addMoney } from "@jobguard/core";
import { migrate } from "../src/migrate.js";
import { FinalAccountLockRepository } from "../src/final-account-lock-repository.js";
import { VariationRepository } from "../src/variation-repository.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";

export const LOCK_OWNER = "40000000-0000-4000-8000-000000000004";
export const LOCK_USER = "30000000-0000-4000-8000-000000000003";
export const LOCK_HASH = "a".repeat(64);
export type LockFixture = { postgres: EmbeddedPostgres; directory: string; port: number; credential: string; admin: Pool; runtime: Pool; shadow: Pool; owner: Pool };
export async function createLockFixture(install = true): Promise<LockFixture> {
 const directory = await mkdtemp(join(tmpdir(), "sv4-pg16-")), port = await freePort(58400, 250), credential = randomUUID();
 const connection = { host: "127.0.0.1", port, database: "jobguard_synthetic_demo", user: "postgres", password: credential };
 const postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: credential, persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
 await postgres.initialise(); await postgres.start(); await postgres.createDatabase("jobguard_synthetic_demo"); const admin = new Pool(connection);
 if (install) { await migrate(admin); await installLegacySyntheticPartyFixtures(admin); }
 const pools: Pool[] = [];
 for (const role of ["jobguard_runtime", "jobguard_shadow", "jobguard_migration"]) {
  const login = `sv4_${randomUUID().replaceAll("-", "")}`;
  if (install) await admin.query(`CREATE ROLE ${login} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${credential}'; GRANT ${role} TO ${login}`);
  pools.push(new Pool({ ...connection, user: install ? login : "postgres", max: 4 }));
 }
 return { postgres, directory, port, credential, admin, runtime: pools[0]!, shadow: pools[1]!, owner: pools[2]! };
}
export async function closeLockFixture(f: LockFixture) { await closeTestPools(f.runtime, f.shadow, f.owner, f.admin); await f.postgres.stop(); await rm(f.directory, { recursive: true, force: true }); }
export async function asFixtureTenant<T>(pool: Pool, tenantId: string, work: (db: PoolClient) => Promise<T>): Promise<T> {
 const db = await pool.connect();
 try { await db.query("BEGIN"); await db.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]); const result = await work(db); await db.query("COMMIT"); return result; }
 catch (error) { await db.query("ROLLBACK"); throw error; } finally { db.release(); }
}
export async function seedAccount(admin: Pool, tenantId = randomUUID(), net = 3360000) {
 const tax=candidateM1TaxPolicy.calculateGroup(money(net),"standard_rate_20"),gross=addMoney(money(net),tax);
 const jobId = randomUUID(), scopeItemId = randomUUID(), baselineId = randomUUID(), draftId = randomUUID(), revisionId = randomUUID(), lineId = randomUUID();
 await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1) ON CONFLICT DO NOTHING", [tenantId]);
 await admin.query("INSERT INTO identity.identity_user(id) VALUES($1) ON CONFLICT DO NOTHING", [LOCK_USER]);
 const account = randomUUID();
 await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Synthetic SV-4')", [account, tenantId]);
 await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner') ON CONFLICT DO NOTHING", [LOCK_OWNER, tenantId, account, LOCK_USER]);
 await asFixtureTenant(admin, tenantId, async db => {
  await db.query("INSERT INTO app.job(id,tenant_id,title,status) VALUES($1,$2,'Fictional final account','live')", [jobId, tenantId]);
  await db.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [scopeItemId, tenantId, jobId]);
  await db.query("INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,$5,'accepted')", [baselineId, tenantId, jobId, LOCK_HASH, net]);
  await db.query("INSERT INTO app.final_account_draft(id,tenant_id,job_id) VALUES($1,$2,$3)", [draftId, tenantId, jobId]);
  await db.query(`INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings)
   VALUES($1,$2,$3,$4,1,$5,$6,'GBP','candidate_m1_standard_v1',$7,$8,$9,false,'[]')`, [revisionId, tenantId, jobId, draftId, LOCK_HASH, baselineId, net, tax.pence, gross.pence]);
  await db.query(`INSERT INTO app.final_account_line(id,tenant_id,job_id,final_account_revision_id,line_kind,source_id,scope_item_id,commercial_revision_id,description,net_pence,ordinal)
   VALUES($1,$2,$3,$4,'baseline',$5,$6,$5,'Fictional baseline',$7,1)`, [lineId, tenantId, jobId, revisionId, baselineId, scopeItemId, net]);
  await db.query("UPDATE app.final_account_draft SET current_revision_id=$1,revision=1 WHERE tenant_id=$2 AND id=$3", [revisionId, tenantId, draftId]);
 });
 return { tenantId, jobId, scopeItemId, baselineId, draftId, revisionId, lineId, context: testTenantContext(tenantId), input: { jobId, actorMembershipId: LOCK_OWNER, commandId: randomUUID(), finalAccountRevisionId: revisionId, expectedRevision: 1, declarationVersion: "final_account_declaration.v1" as const } };
}
export async function prepareLock(f: LockFixture, a: Awaited<ReturnType<typeof seedAccount>>) {
 const repo = new FinalAccountLockRepository(f.runtime);
 await repo.acceptTerms(a.context, { actorMembershipId: LOCK_OWNER, commandId: randomUUID(), termsVersion: "synthetic_final_check_terms.v1" });
 await repo.disposition(a.context, { jobId: a.jobId, actorMembershipId: LOCK_OWNER, commandId: randomUUID(), scopeItemId: a.scopeItemId, disposition: "done" });
 return repo;
}
export async function addFixtureCapture(f: LockFixture, a: Awaited<ReturnType<typeof seedAccount>>, net: number | null, review = false) {
 const proposal={version:"variation-proposal.v1",id:randomUUID(),jobId:a.jobId,scopeItemId:randomUUID(),existingScopeItemId:null,lineageParentScopeItemId:null,captureKind:"text",captureText:"Fictional captured extra",description:"Fictional captured extra",suggestion:null};
 const price=net===null?null:{quantity:"1",unit:"item",unitRatePence:net,direction:"addition",confirmedByMembershipId:LOCK_OWNER,rateProvenance:{kind:"human_entered",sourceRef:"synthetic-sv4",sourceHash:LOCK_HASH,rateVersion:"synthetic.v1"}};
 const repo=new VariationRepository(f.runtime);
 if(review)await repo.addFinalReviewExtra(a.context,{version:"final-review-extra.v1",proposal,actorMembershipId:LOCK_OWNER,price,deviceId:null,deviceCapturedAt:null});
 else await repo.logBuilderExtra(a.context,{version:"log-builder-extra.v1",proposal,actorMembershipId:LOCK_OWNER,price,deviceId:null,deviceCapturedAt:null});
 return proposal.id;
}
/** Fixture-only: an `original` evidence_object needs its upload parent row (migration 0002, evidence_object_kind_ck);
 * the upload is inserted first in the same transaction, the way the merged shadow-persistence fixtures do. */
export async function insertFixtureOriginalEvidence(pool: Pool, tenantId: string, jobId: string, scopeItemId: string, evidence: string, objectVersion: string) {
 const upload = randomUUID();
 await asFixtureTenant(pool, tenantId, async db => {
  await db.query(`INSERT INTO app.evidence_upload(id,tenant_id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at,state,object_version_id,server_verified_at) VALUES($1,$2,$3,$4,$5,$6,'image/png',100,'standard_evidence',clock_timestamp()+interval '1 day','verified',$7,clock_timestamp())`, [upload, tenantId, jobId, scopeItemId, `synthetic/${evidence}`, LOCK_HASH, objectVersion]); // set-up only (per C135): its verified object means the upload is verified, so the lock's pending-photo refusal does not apply
  await db.query(`INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,scope_item_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)
   VALUES($1,$2,$3,$4,$5,'original','photo',$6,$7,$8,0,'image/png','standard_evidence',clock_timestamp(),clock_timestamp())`, [evidence, tenantId, upload, jobId, scopeItemId, `synthetic/${evidence}`, objectVersion, LOCK_HASH]);
 });
}
export async function lockRow(f: LockFixture, tenantId: string, jobId: string) { return (await f.admin.query("SELECT * FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2", [tenantId, jobId])).rows[0]!; }

/** Two real, identical database copies, differing only in private evidence-linked signals.
 * Server-generated lock identities/times are copied as immutable history before replay comparison. */
export async function createApplicationIsolationFixture() {
 const zero=await createLockFixture(),many=await createLockFixture();
 const a=await seedAccount(zero.admin,'11111111-1111-4111-8111-111111111111');
 const session=randomUUID(),sessionDigest=(await import('node:crypto')).createHash('sha256').update(session).digest('hex');
 const actor='d1500000-0000-4000-8000-000000000003',user='d1500000-0000-4000-8000-000000000001';
 await zero.admin.query("INSERT INTO identity.identity_user(id) VALUES($1)",[user]);
 await zero.admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) SELECT $1,tenant_id,account_id,$2,'owner' FROM app.membership WHERE tenant_id=$3 AND id=$4",[actor,user,a.tenantId,LOCK_OWNER]);
 // Issue the session through the product's own SECURITY DEFINER routine: the seed trigger on practice_session refuses a direct insert by any other role.
 await zero.admin.query("SELECT app.issue_practice_session($1)",[sessionDigest]);
 await asFixtureTenant(zero.admin,a.tenantId,async db=>{
  await db.query("SET LOCAL session_replication_role='replica'");
  await db.query("UPDATE app.job SET practice_session_digest=$1,practice_scenario='capture' WHERE tenant_id=$2 AND id=$3",[sessionDigest,a.tenantId,a.jobId]);
 });
 await prepareLock(zero,a);
 const evidence=randomUUID(),objectVersion=randomUUID();
 await insertFixtureOriginalEvidence(zero.admin,a.tenantId,a.jobId,a.scopeItemId,evidence,objectVersion);
 const copyPublicHistory=async()=>{
  const tables=(await zero.admin.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname IN ('identity','control_plane','app','audit_control') AND tablename NOT LIKE 'shadow_%' ORDER BY schemaname,tablename")).rows;
  const db=await many.admin.connect();
  try{
   await db.query('BEGIN');await db.query("SET LOCAL session_replication_role='replica'");
   for(const table of tables){
    const name=`"${table.schemaname}"."${table.tablename}"`;
    await db.query(`DELETE FROM ${name}`);
    const rows=(await zero.admin.query(`SELECT row_to_json(t)::text bytes FROM ${name} t`)).rows;
    for(const row of rows)await db.query(`INSERT INTO ${name} SELECT (jsonb_populate_record(NULL::${name},$1::jsonb)).*`,[row.bytes]);
   }
   await db.query('COMMIT');
  }catch(error){await db.query('ROLLBACK');throw error}finally{db.release()}
 };
 await copyPublicHistory();
 const received=(await zero.admin.query("SELECT server_received_at::text time FROM app.evidence_object WHERE id=$1",[evidence])).rows[0].time;
 await asFixtureTenant(many.shadow,a.tenantId,async db=>{for(let n=0;n<25;n++){
  const signal=randomUUID();await db.query(`INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band,state)
   VALUES($1,$2,$3,$4,'possible_extra','deterministic','synthetic-sv4.v1',clock_timestamp(),'Fictional private extra','low','held_for_final_check')`,[a.tenantId,a.jobId,signal,randomUUID()]);
  await db.query("INSERT INTO app.shadow_signal_evidence(tenant_id,job_id,signal_id,evidence_id,object_version_id,sha256,source_received_at) VALUES($1,$2,$3,$4,$5,$6,$7)",[a.tenantId,a.jobId,signal,evidence,objectVersion,LOCK_HASH,received]);
 }});
 expect((await many.admin.query('SELECT count(*)::int n FROM app.shadow_signal_evidence')).rows[0].n).toBe(25);
 expect((await zero.admin.query('SELECT count(*)::int n FROM app.shadow_commercial_signal')).rows[0].n).toBe(0);
 return {zero:zero.runtime,many:many.runtime,session,jobId:a.jobId,
  command:{version:'final-account.lock.v1',commandId:a.input.commandId,finalAccountRevisionId:a.revisionId,expectedRevision:1,declarationVersion:a.input.declarationVersion},
  copyLockedHistory:copyPublicHistory,
  close:async()=>{await closeLockFixture(many);await closeLockFixture(zero)},
 };
}

// Export the fixture without registering this suite when another proof imports it.
if (expect.getState().testPath === fileURLToPath(import.meta.url)) describe("SV-4 final-account lock: DW1–DW5 and tenant authority", () => {
 let f: LockFixture;
 beforeAll(async () => { f = await createLockFixture(); }, 60000); afterAll(async () => closeLockFixture(f));
 it("DW1 capture includes every state, £3,200 logged and £400 reviewed; post-lock review writes nothing",async()=>{
  const a=await seedAccount(f.admin),repo=await prepareLock(f,a),variations=new VariationRepository(f.runtime);
  const logged=await addFixtureCapture(f,a,320000),reviewed=await addFixtureCapture(f,a,40000,true);
  const ids: string[]=[];
  for(const state of ['draft','priced','approved','rejected','withdrawn']){
   const id=await addFixtureCapture(f,a,null); ids.push(id);
   if(state==='withdrawn')await variations.recordWithdrawal(a.context,{version:'variation-withdrawal.v1',id:randomUUID(),jobId:a.jobId,variationId:id,actorMembershipId:LOCK_OWNER,reasonCode:'builder_withdrawn'});
   else if(state!=='draft')await f.admin.query("UPDATE app.variation SET state=$1 WHERE tenant_id=$2 AND id=$3",[state,a.tenantId,id]);
  }
  expect((await repo.read(a.context,a.jobId)).captures.map(c=>c.id)).toEqual(expect.arrayContaining([logged,reviewed,...ids]));
  await repo.lock(a.context,a.input);const row=await lockRow(f,a.tenantId,a.jobId),captures=createLockSnapshot(row.snapshot).snapshot.captureRegister;
  const extras=captures.filter(c=>c.kind!=='baseline'); expect(extras.reduce((n,c)=>n+(c.valuePence??0),0)).toBe(360000);
  expect(captures.every(c=>c.kind!=='baseline')).toBe(true);expect(captureRegisterNetPence(row.snapshot)).toBe(360000);
  expect(extras.map(c=>c.id)).toEqual(expect.arrayContaining([logged,reviewed,...ids]));
  expect(extras.filter(c=>ids.includes(c.id)).map(c=>c.state).sort()).toEqual(['approved','draft','priced','rejected','withdrawn']);
  expect((await f.admin.query("SELECT variation_id,kind FROM app.extra_origin WHERE variation_id=ANY($1) ORDER BY kind",[[logged,reviewed]])).rows).toEqual([{variation_id:logged,kind:'builder_logged'},{variation_id:reviewed,kind:'final_review'}]);
  const before=(await f.admin.query("SELECT count(*)::int n FROM app.variation WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows[0].n;
  await expect(addFixtureCapture(f,a,1,true)).rejects.toMatchObject({code:'FINAL_REVIEW_CLOSED'});
  expect((await f.admin.query("SELECT count(*)::int n FROM app.variation WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows[0].n).toBe(before);
 });
 it("DW2 refuses missing dispositions and terms through repository and runtime routine without side effects", async () => {
  const a = await seedAccount(f.admin), repo = new FinalAccountLockRepository(f.runtime);
  const direct = () => asFixtureTenant(f.runtime, a.tenantId, db => db.query("SELECT * FROM app.lock_final_account($1,$2,$3,$4,$5,$6,$7)", [a.tenantId, a.jobId, LOCK_OWNER, a.input.commandId, a.revisionId, 1, a.input.declarationVersion]));
  await repo.acceptTerms(a.context, { actorMembershipId: LOCK_OWNER, commandId: randomUUID(), termsVersion: "synthetic_final_check_terms.v1" });
  await expect(repo.lock(a.context, a.input)).rejects.toMatchObject({ code: "SCOPE_DISPOSITION_MISSING" });
  await expect(direct()).rejects.toThrow("SCOPE_DISPOSITION_MISSING");
  const b = await seedAccount(f.admin); await repo.disposition(b.context, { jobId: b.jobId, actorMembershipId: LOCK_OWNER, commandId: randomUUID(), scopeItemId: b.scopeItemId, disposition: "done" });
  await expect(repo.lock(b.context, b.input)).rejects.toMatchObject({ code: "DISCLOSURE_TERMS_NOT_ACCEPTED" });
  await expect(asFixtureTenant(f.runtime, b.tenantId, db => db.query("SELECT * FROM app.lock_final_account($1,$2,$3,$4,$5,$6,$7)", [b.tenantId, b.jobId, LOCK_OWNER, b.input.commandId, b.revisionId, 1, b.input.declarationVersion]))).rejects.toThrow("DISCLOSURE_TERMS_NOT_ACCEPTED");
  expect((await f.admin.query("SELECT count(*)::int n FROM app.final_account_lock WHERE tenant_id=ANY($1)", [[a.tenantId,b.tenantId]])).rows[0].n).toBe(0);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.command_receipt WHERE command_id=ANY($1)", [[a.input.commandId,b.input.commandId]])).rows[0].n).toBe(0);
 });
 it("DW4 replay, altered payload and two concurrent commands create one lock and one matching audit event", async () => {
  const a = await seedAccount(f.admin), repo = await prepareLock(f,a);
  const results = await Promise.all([repo.lock(a.context,a.input),repo.lock(a.context,a.input)]); expect(results[1]).toEqual(results[0]);
  await expect(repo.lock(a.context,{...a.input,expectedRevision:2})).rejects.toMatchObject({code:"IDEMPOTENCY_CONFLICT"});
  await expect(repo.lock(a.context,{...a.input,commandId:randomUUID()})).rejects.toMatchObject({code:"FINAL_ACCOUNT_ALREADY_LOCKED",existingLockId:results[0]!.id});
  const row=await lockRow(f,a.tenantId,a.jobId);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND id=$2",[a.tenantId,row.audit_event_id])).rows[0].n).toBe(1);
  const b=await seedAccount(f.admin), next=await prepareLock(f,b);
  const raced=await Promise.allSettled([next.lock(b.context,b.input),next.lock(b.context,{...b.input,commandId:randomUUID()})]);
  expect(raced.filter(x=>x.status==='fulfilled')).toHaveLength(1); expect(raced.filter(x=>x.status==='rejected')).toHaveLength(1);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2",[b.tenantId,b.jobId])).rows[0].n).toBe(1);
  const racedLock=await lockRow(f,b.tenantId,b.jobId);expect((await f.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND id=$2",[b.tenantId,racedLock.audit_event_id])).rows[0].n).toBe(1);
 });
 it("capture and lock sharing one command identity serialize before receipt claim without deadlock",async()=>{
  const a=await seedAccount(f.admin),repo=await prepareLock(f,a),variations=new VariationRepository(f.runtime);
  const proposal={version:'variation-proposal.v1',id:a.input.commandId,jobId:a.jobId,scopeItemId:randomUUID(),existingScopeItemId:null,lineageParentScopeItemId:null,captureKind:'text',captureText:'Fictional simultaneous extra',description:'Fictional simultaneous extra',suggestion:null};
  const results=await Promise.allSettled([variations.logBuilderExtra(a.context,{version:'log-builder-extra.v1',proposal,actorMembershipId:LOCK_OWNER,price:null,deviceId:null,deviceCapturedAt:null}),repo.lock(a.context,a.input)]);
  expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
  for(const r of results)if(r.status==='rejected')expect(['COMMAND_CONFLICT','IDEMPOTENCY_CONFLICT']).toContain(r.reason.code);
  const effects=(await f.admin.query("SELECT (SELECT count(*)::int FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2) locks,(SELECT count(*)::int FROM app.variation WHERE tenant_id=$1 AND job_id=$2) captures",[a.tenantId,a.jobId])).rows[0];
  expect(effects.locks+effects.captures).toBe(1);
 });
 it("DW3 recomputes all source hashes and detects separate capture, line and disposition corruption", async () => {
  const a=await seedAccount(f.admin), repo=await prepareLock(f,a); await addFixtureCapture(f,a,10000); await repo.lock(a.context,a.input); const row=await lockRow(f,a.tenantId,a.jobId);
  const snapshot=createLockSnapshot(row.snapshot); expect(snapshot.digest).toBe(row.snapshot_digest);
  expect(hashLockCaptureRegister(snapshot.snapshot.captureRegister)).toBe(row.capture_register_hash);
  expect(hashLockLineSet(snapshot.snapshot.lines)).toBe(row.line_set_hash);
  expect(hashLockScopeDispositions(snapshot.snapshot.scopeDispositions)).toBe(row.scope_disposition_hash);
  expect(await repo.verify(a.context,a.jobId)).toEqual({verified:true,mismatches:[]});
  for(const [table,mutation,hash] of [
   ['variation',"description='Tampered synthetic capture'",'capture_register_hash'],
   ['final_account_line',"net_pence=net_pence+1",'line_set_hash'],
   ['final_account_scope_disposition',"disposition='deferred'",'scope_disposition_hash'],
   ['final_account_revision',"source_hash=repeat('d',64)",'line_set_hash'],
  ] as const) {
   const db=await f.admin.connect(); try { await db.query('BEGIN'); await db.query("SET LOCAL session_replication_role='replica'"); await db.query(`UPDATE app.${table} SET ${mutation} WHERE tenant_id=$1 AND job_id=$2`,[a.tenantId,a.jobId]);
    // Verify on the same transaction so corruption is rolled back rather than persisted.
    const sources=(await db.query("SELECT app.read_final_account_lock_sources($1,$2,$3) sources",[a.tenantId,a.jobId,a.revisionId])).rows[0].sources;
    const rebuilt=createLockSnapshot({...row.snapshot,...sources});
    const digest=hash==='capture_register_hash'?hashLockCaptureRegister(rebuilt.snapshot.captureRegister):hash==='line_set_hash'?hashLockLineSet(rebuilt.snapshot.lines):hashLockScopeDispositions(rebuilt.snapshot.scopeDispositions); expect(digest,hash).not.toBe(row[hash]);
    const verified=verifyFinalAccountLockSnapshot(rebuilt.snapshot,{digest:row.snapshot_digest,captureRegisterHash:row.capture_register_hash,lineSetHash:row.line_set_hash,scopeDispositionHash:row.scope_disposition_hash});expect(verified.verified).toBe(false);expect(verified.mismatches).toContain(hash==='capture_register_hash'?'captureRegisterHash':hash==='line_set_hash'?'lineSetHash':'scopeDispositionHash');
   } finally { await db.query('ROLLBACK'); db.release(); }
  }
 });
 it("DW5 runtime, shadow and migration owner cannot mutate the lock; later revisions do not change it",async()=>{
  const a=await seedAccount(f.admin),repo=await prepareLock(f,a);await repo.lock(a.context,a.input);
  const bytes=async()=>(await f.admin.query("SELECT row_to_json(t)::text bytes FROM app.final_account_lock t WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows[0].bytes;
  const before=await bytes();
  for(const pool of [f.runtime,f.shadow,f.owner,f.admin])for(const sql of ["UPDATE app.final_account_lock SET declaration=declaration WHERE tenant_id=$1 AND job_id=$2","DELETE FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2"])
   await expect(asFixtureTenant(pool,a.tenantId,db=>db.query(sql,[a.tenantId,a.jobId]))).rejects.toThrow();
  await f.admin.query("INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,previous_revision_id,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings,created_at) SELECT gen_random_uuid(),tenant_id,job_id,final_account_draft_id,2,id,$1,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings,clock_timestamp() FROM app.final_account_revision WHERE tenant_id=$2 AND id=$3",['b'.repeat(64),a.tenantId,a.revisionId]);
  expect(await bytes()).toBe(before);
 });
 it("DW8 zero versus 25 held signals with evidence links leaves persisted lock views and replay byte-identical",async()=>{
  const a=await seedAccount(f.admin),repo=await prepareLock(f,a),evidence=randomUUID(),objectVersion=randomUUID();
  await insertFixtureOriginalEvidence(f.admin,a.tenantId,a.jobId,a.scopeItemId,evidence,objectVersion);
  const first=await repo.lock(a.context,a.input),zeroLocked=JSON.stringify(await repo.read(a.context,a.jobId));
  const received=(await f.admin.query("SELECT server_received_at::text time FROM app.evidence_object WHERE tenant_id=$1 AND id=$2",[a.tenantId,evidence])).rows[0].time;
  await asFixtureTenant(f.shadow,a.tenantId,async db=>{for(let index=0;index<25;index++){
   const signal=randomUUID();await db.query(`INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band,state)
    VALUES($1,$2,$3,$4,'possible_extra','deterministic','synthetic-sv4.v1',$5::timestamptz,'Fictional held evidence','low','held_for_final_check')`,[a.tenantId,a.jobId,signal,randomUUID(),first.lockedAt]);
   await db.query("INSERT INTO app.shadow_signal_evidence(tenant_id,job_id,signal_id,evidence_id,object_version_id,sha256,source_received_at) VALUES($1,$2,$3,$4,$5,$6,$7::timestamptz)",[a.tenantId,a.jobId,signal,evidence,objectVersion,LOCK_HASH,received]);
  }});
  const client=await f.runtime.connect(),connect=vi.spyOn(f.runtime,'connect').mockImplementation(async()=>client),release=vi.spyOn(client,'release').mockImplementation(()=>undefined),queries=vi.spyOn(client,'query');
  try{
   expect(JSON.stringify(await repo.read(a.context,a.jobId))).toBe(zeroLocked);expect(await repo.lock(a.context,a.input)).toEqual(first);
   const statements=queries.mock.calls.map(call=>typeof call[0]==='string'?call[0]:JSON.stringify(call[0])).join('\n');expect(statements).not.toMatch(/\b(?:shadow_commercial_signal|shadow_signal_evidence|shadow_reconciliation_run)\b/);
  }finally{queries.mockRestore();release.mockRestore();connect.mockRestore();client.release()}
  // Independently exercise the pre-lock read boundary with 25 held, evidence-linked rows.
  const unlocked=await seedAccount(f.admin,a.tenantId),unlockedRepo=await prepareLock(f,unlocked);const review=JSON.stringify(await unlockedRepo.read(unlocked.context,unlocked.jobId)),ownEvidence=randomUUID(),ownVersion=randomUUID();
  await insertFixtureOriginalEvidence(f.admin,a.tenantId,unlocked.jobId,unlocked.scopeItemId,ownEvidence,ownVersion);
  const ownReceived=(await f.admin.query("SELECT server_received_at::text time FROM app.evidence_object WHERE tenant_id=$1 AND id=$2",[a.tenantId,ownEvidence])).rows[0].time;
  await asFixtureTenant(f.shadow,a.tenantId,async db=>{for(let index=0;index<25;index++){
   const signal=randomUUID();await db.query(`INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band,state)
    VALUES($1,$2,$3,$4,'possible_extra','deterministic','synthetic-sv4.v1',clock_timestamp(),'Fictional held evidence','low','held_for_final_check')`,[a.tenantId,unlocked.jobId,signal,randomUUID()]);
   await db.query("INSERT INTO app.shadow_signal_evidence(tenant_id,job_id,signal_id,evidence_id,object_version_id,sha256,source_received_at) VALUES($1,$2,$3,$4,$5,$6,$7::timestamptz)",[a.tenantId,unlocked.jobId,signal,ownEvidence,ownVersion,LOCK_HASH,ownReceived]);
  }});
  expect(JSON.stringify(await unlockedRepo.read(unlocked.context,unlocked.jobId))).toBe(review);
 });
 it("audit failure rolls back lock and its command receipt atomically",async()=>{
  const a=await seedAccount(f.admin),repo=await prepareLock(f,a);
  await f.admin.query(`CREATE FUNCTION app.sv4_test_fail_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='final_account.locked' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER sv4_test_fail_audit BEFORE INSERT ON app.audit_event FOR EACH ROW EXECUTE FUNCTION app.sv4_test_fail_audit()`);
  try{await expect(repo.lock(a.context,a.input)).rejects.toThrow('synthetic audit failure')}finally{await f.admin.query("DROP TRIGGER sv4_test_fail_audit ON app.audit_event; DROP FUNCTION app.sv4_test_fail_audit()")}
  expect((await f.admin.query("SELECT count(*)::int n FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows[0].n).toBe(0);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2",[a.tenantId,a.input.commandId])).rows[0].n).toBe(0);
 });
 it("new command and private routines have exact EXECUTE grantees",async()=>{
  for(const signature of ['lock_final_account(uuid,uuid,uuid,uuid,uuid,integer,text)','record_final_account_disposition(uuid,uuid,uuid,uuid,uuid,text)','accept_final_check_terms(uuid,uuid,uuid,text)','issue_lock_bound_customer_invoice(uuid,uuid,uuid,uuid,uuid,text,text,date,text)','read_final_account_lock_verification(uuid,uuid)','prepare_final_review_extra(uuid,uuid,uuid)']){
   const rows=(await f.admin.query("SELECT CASE a.grantee WHEN 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=$1::regprocedure AND a.privilege_type='EXECUTE' ORDER BY grantee",[`app.${signature}`])).rows;
   expect(rows).toEqual([{grantee:'jobguard_migration'},{grantee:'jobguard_runtime'}]);
  }
  for(const signature of ['read_final_account_lock_sources(uuid,uuid,uuid)','guard_final_account_lock_check()','guard_final_account_invoiced_line()','final_lock_canonical(jsonb)','final_lock_hash(jsonb)','final_lock_require_owner(uuid,uuid)','append_final_lock_audit(uuid,uuid,uuid,text,jsonb,jsonb)','serialize_final_account_source()','serialize_final_review_receipt()']){
   const rows=(await f.admin.query("SELECT CASE a.grantee WHEN 0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=$1::regprocedure AND a.privilege_type='EXECUTE' ORDER BY grantee",[`app.${signature}`])).rows;
   expect(rows).toEqual([...(signature==='final_lock_canonical(jsonb)' ? [{grantee:'jobguard_audit_writer'}] : []),{grantee:'jobguard_migration'}]);
  }
 });
 it("C4 minimal grants, FORCE RLS, owner and append-only posture on all six new tables",async()=>{
  for(const table of ['final_account_lock','final_account_scope_disposition','final_check_terms_acceptance','final_account_lock_check','final_account_invoice_binding','final_account_invoiced_line']){
   const row=(await f.admin.query("SELECT c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) owner FROM pg_class c WHERE c.oid=$1::regclass",[`app.${table}`])).rows[0];
   expect(row).toEqual({relrowsecurity:true,relforcerowsecurity:true,owner:'jobguard_migration'});
   expect((await f.admin.query("SELECT has_table_privilege('jobguard_runtime',$1,'SELECT') permitted",[`app.${table}`])).rows[0].permitted).toBe(true);
   expect((await f.admin.query("SELECT has_table_privilege('jobguard_runtime',$1,'INSERT') permitted",[`app.${table}`])).rows[0].permitted).toBe(false);
   expect((await f.admin.query("SELECT has_table_privilege('jobguard_shadow',$1,'SELECT') permitted",[`app.${table}`])).rows[0].permitted).toBe(false);
   expect((await f.admin.query("SELECT has_table_privilege('jobguard_shadow',$1,'INSERT') permitted",[`app.${table}`])).rows[0].permitted).toBe(table==='final_account_lock_check');
   for(const role of ['jobguard_infrastructure','jobguard_shadow_emergency_access'])expect((await f.admin.query("SELECT has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') permitted",[role,`app.${table}`])).rows[0].permitted).toBe(false);

   for(const role of ['jobguard_runtime','jobguard_shadow'])for(const privilege of ['UPDATE','DELETE','TRUNCATE']) expect((await f.admin.query("SELECT has_table_privilege($1,$2,$3) permitted",[role,`app.${table}`,privilege])).rows[0].permitted).toBe(false);
   expect((await f.admin.query("SELECT attnotnull FROM pg_attribute WHERE attrelid=$1::regclass AND attname='tenant_id'",[`app.${table}`])).rows[0].attnotnull).toBe(true);
  }
  for(const table of ['final_account_lock','final_account_lock_check'])expect((await f.admin.query("SELECT has_table_privilege('jobguard_runtime',$1,'INSERT') permitted",[`app.${table}`])).rows[0].permitted).toBe(false);
  expect((await f.admin.query("SELECT has_table_privilege('jobguard_shadow','app.final_account_lock_check','INSERT') permitted")).rows[0].permitted).toBe(true);
 });
 it("owner authority, tenant mismatch, wrong-job references and missing tenant context fail closed",async()=>{
  const a=await seedAccount(f.admin),repo=await prepareLock(f,a),b=await seedAccount(f.admin);
  await expect(repo.lock(testTenantContext(b.tenantId),a.input)).rejects.toThrow();
  await expect(repo.disposition(a.context,{jobId:a.jobId,actorMembershipId:LOCK_OWNER,commandId:randomUUID(),scopeItemId:b.scopeItemId,disposition:'done'})).rejects.toThrow();
  await expect(f.runtime.query("SELECT * FROM app.lock_final_account($1,$2,$3,$4,$5,$6,$7)",[a.tenantId,a.jobId,LOCK_OWNER,a.input.commandId,a.revisionId,1,a.input.declarationVersion])).rejects.toThrow();
  await f.admin.query("UPDATE app.membership SET role='office' WHERE tenant_id=$1 AND id=$2",[a.tenantId,LOCK_OWNER]);
  try{await expect(repo.lock(a.context,a.input)).rejects.toMatchObject({code:'42501',message:'FORBIDDEN'})}finally{await f.admin.query("UPDATE app.membership SET role='owner' WHERE tenant_id=$1 AND id=$2",[a.tenantId,LOCK_OWNER])}
  await expect(repo.lock(a.context,{...a.input,actorMembershipId:randomUUID()})).rejects.toMatchObject({code:'42501',message:'FORBIDDEN'});
 });
 it("C4 actual logins cannot insert or mutate protected facts, even empty tables; owner triggers reject mutation",async()=>{
  const a=await seedAccount(f.admin),repo=await prepareLock(f,a);await repo.lock(a.context,a.input);
  for(const table of ['final_account_lock','final_account_scope_disposition','final_check_terms_acceptance','final_account_lock_check','final_account_invoice_binding','final_account_invoiced_line']){
   await expect(asFixtureTenant(f.runtime,a.tenantId,db=>db.query(`INSERT INTO app.${table} SELECT * FROM app.${table} WHERE false`))).rejects.toMatchObject({code:'42501'});
   for(const pool of [f.runtime,f.shadow,f.owner])for(const sql of [`UPDATE app.${table} SET tenant_id=tenant_id`,`DELETE FROM app.${table}`,`TRUNCATE app.${table} CASCADE`])
    await expect(asFixtureTenant(pool,a.tenantId,db=>db.query(sql))).rejects.toMatchObject({code:pool===f.owner?'55000':'42501'});
  }
 });
 it("C4 lock and disposition composite keys reject foreign tenants and same-tenant wrong jobs",async()=>{
  const a=await seedAccount(f.admin),repo=await prepareLock(f,a);await repo.lock(a.context,a.input);
  const same=await seedAccount(f.admin,a.tenantId),foreign=await seedAccount(f.admin);
  for(const target of [same,foreign]){
   await expect(asFixtureTenant(f.admin,target.tenantId,db=>db.query(`INSERT INTO app.final_account_lock SELECT (jsonb_populate_record(NULL::app.final_account_lock,to_jsonb(l)||jsonb_build_object('id',$3::uuid,'tenant_id',$4::uuid,'job_id',$5::uuid))).* FROM app.final_account_lock l WHERE tenant_id=$1 AND job_id=$2`,[a.tenantId,a.jobId,randomUUID(),target.tenantId,target.jobId]))).rejects.toMatchObject({code:'23503'});
   await expect(asFixtureTenant(f.admin,target.tenantId,db=>db.query(`INSERT INTO app.final_account_scope_disposition SELECT (jsonb_populate_record(NULL::app.final_account_scope_disposition,to_jsonb(d)||jsonb_build_object('id',$3::uuid,'command_id',$4::uuid,'tenant_id',$5::uuid,'job_id',$6::uuid))).* FROM app.final_account_scope_disposition d WHERE tenant_id=$1 AND job_id=$2`,[a.tenantId,a.jobId,randomUUID(),randomUUID(),target.tenantId,target.jobId]))).rejects.toMatchObject({code:'23503'});
  }
 });

 it("synthetic-only lock and final-review routines refuse a pilot track without writes",async()=>{
  const a=await seedAccount(f.admin),repo=await prepareLock(f,a);
  await asFixtureTenant(f.admin,a.tenantId,async db=>{await db.query("SET LOCAL session_replication_role='replica'");await db.query("UPDATE app.job_commercial_track SET environment='pilot_no_charge' WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])});
  await expect(repo.lock(a.context,a.input)).rejects.toMatchObject({code:'42501',message:'FORBIDDEN'});
  await expect(addFixtureCapture(f,a,40000,true)).rejects.toMatchObject({code:'42501',message:'FORBIDDEN'});
  expect((await f.admin.query("SELECT count(*)::int n FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows[0].n).toBe(0);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.variation WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows[0].n).toBe(0);
 });

});
