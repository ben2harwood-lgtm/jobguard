import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FreeFirstJobEligibilityRepository, trialEligibilityReadV1 } from "../src/free-first-job-eligibility-repository.js";
import { seedSyntheticPartyFixture } from "../src/synthetic-party-fixture.js";
import { keyParent, snapshot, store } from "./free-first-job-keys-fixtures.js";
import { verifiedTenantContextForQueuedJob } from "../src/tenant-context.js";
import { createWorkFixture, closeWorkFixture, meterCompany, verifyBusiness, requestCard, recordCard, resultFixture, ownCounts, denyAdmission, workTenant, type WorkFixture, type TrialCompany } from "./free-first-job-admission-fixtures.js";

const read = (f: WorkFixture, a: TrialCompany, job: string = a.jobId, digest: string = a.digest) => workTenant(f.runtime, a.tenantId, async db =>
 (await db.query("SELECT app.mon3_read_eligibility($1,$2,$3) result", [a.tenantId, digest, job])).rows[0].result);

// Private synthetic source fixture ONLY. Like A's keyParent, predecessor
// commercial parent rows are installed with owner trigger bypass. This is not
// a command journey or a successful trial admission. The reader runs normally.
async function exactTarget(f: WorkFixture, a: TrialCompany) {
 const documentId = randomUUID(), revisionId = randomUUID(), acceptanceId = randomUUID();
 await workTenant(f.admin, a.tenantId, async db => {
  await db.query("SET LOCAL session_replication_role='replica'");
  await seedSyntheticPartyFixture(db, a.tenantId, a.jobId);
  await db.query("INSERT INTO app.quote_revision(id,tenant_id,job_id,quote_draft_id,revision,currency,tax_policy_version,subtotal_pence,discount_pence,net_pence,tax_pence,total_pence,issuable,blockers) VALUES($1,$2,$3,$4,1,'GBP','candidate_m1_standard_v1',100000,0,100000,20000,120000,true,'[]')", [revisionId,a.tenantId,a.jobId,randomUUID()]);
  await db.query(`INSERT INTO app.quote_document_version(id,tenant_id,job_id,quote_revision_id,document_version,reference,content_hash,object_key,object_version_id,pdf_byte_length,issuer,customer,snapshot,parties_snapshot)
   SELECT $1,$2,$3,$4,1,'ELIG-FIXTURE',$5,'synthetic/elig','fixture-v1',1,'{}','{}','{"netPence":100000,"totalPence":120000}',snapshot FROM app.job_party_snapshot WHERE tenant_id=$2 AND job_id=$3`, [documentId,a.tenantId,a.jobId,revisionId,'a'.repeat(64)]);
  await db.query("INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,100000,'accepted')", [documentId,a.tenantId,a.jobId,'a'.repeat(64)]);
  await db.query(`INSERT INTO app.quote_acceptance(id,tenant_id,job_id,document_id,document_version,document_hash,accepted_total_pence,currency,acceptance_kind,actor_membership_id,stated_customer_name,stated_method,accepted_at)
   VALUES($1,$2,$3,$4,1,$5,120000,'GBP','builder_attestation',$6,'Fictional customer','verbal',clock_timestamp())`, [acceptanceId,a.tenantId,a.jobId,documentId,'a'.repeat(64),a.actorId]);
  await db.query(`INSERT INTO app.quote_send(id,tenant_id,job_id,document_id,content_hash,authorization_id,outbox_action_id,recipients) VALUES($1,$2,$3,$4,$5,$6,$7,'["fixture@example.invalid"]')`, [randomUUID(),a.tenantId,a.jobId,documentId,'a'.repeat(64),randomUUID(),randomUUID()]);
  await db.query("UPDATE app.job SET status='accepted',accepted_quote_version_id=$3,revision=revision+1 WHERE tenant_id=$1 AND id=$2", [a.tenantId,a.jobId,documentId]);
  await db.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'small_builder','synthetic_demo','backfilled_synthetic_fixture') ON CONFLICT(tenant_id,job_id) DO UPDATE SET provenance='backfilled_synthetic_fixture',source_id=NULL", [a.tenantId,a.jobId]);
 });
 return {documentId, revisionId, acceptanceId};
}

// These run without opening a socket when selected with -t 'source-only'.
describe("source-only ELIG adapter and guard mutation checks", () => {
 const jobId = randomUUID();
 const sources = { documentId: randomUUID(), acceptanceId: randomUUID(), partyBindingId: randomUUID(), verificationId: randomUUID(), cardResultId: null, termsId: null };
 const value = () => ({ version: "trial-eligibility-read.v1", environment: "synthetic_demo", hypothetical: true, jobId, jobRevision: 1,
  targetStatus: "unavailable", reasons: ["KEY_CHECK_UNAVAILABLE", "ADMISSION_DISABLED"], identity: "verified", cardGate: "optional_first", cardAction: null,
  offerSkip: true, keyCheck: "unavailable", admission: "disabled", sources: { ...sources }, revisionDigest: "a".repeat(64) });
 it("strict schema mutations reject authority, identity leakage and contradictory offers", () => {
  expect(trialEligibilityReadV1.safeParse(value()).success).toBe(true);
  for (const mutation of [{ admission: "enabled" }, { activationAuthorized: true }, { companyNumber: "secret" }, { targetStatus: "eligible" }, { keyCheck: "clear" },
   { reasons: [] }, { cardGate: "add_card" }, { identity: "unavailable" }, { targetStatus: "ineligible" }, { sources: { ...value().sources, fingerprint: "secret" } }]) {
   expect(trialEligibilityReadV1.safeParse({ ...value(), ...mutation }).success, JSON.stringify(mutation)).toBe(false);
  }
 });
 it("repository checks environment and input before pool access, validates output and binds the target", async () => {
  const old = process.env.JOBGUARD_ENV;
  const statements: string[] = []; let result: unknown = value();
  const pool = { connect: async () => ({ query: async (sql: string) => { statements.push(sql); return { rows: [{ result }] }; }, release() {} }) } as unknown as import("pg").Pool;
  const repository = new FreeFirstJobEligibilityRepository(pool), context = verifiedTenantContextForQueuedJob(randomUUID());
  try {
   for (const environment of ["production", "pilot_no_charge", "development"]) {
    process.env.JOBGUARD_ENV = environment;
    await expect(repository.read(context, "a".repeat(64), jobId)).rejects.toMatchObject({ code: "FREE_FIRST_JOB_SYNTHETIC_ONLY" });
   }
   expect(statements).toEqual([]);
   process.env.JOBGUARD_ENV = "synthetic_demo";
   for (const args of [["bad", jobId], ["a".repeat(64), "bad"]] as const) await expect(repository.read(context, args[0], args[1])).rejects.toMatchObject({ code: "INVALID_FREE_FIRST_JOB_INPUT" });
   expect(statements).toEqual([]);
   expect(await repository.read(context, "a".repeat(64), jobId)).toEqual(value());
   result = { ...value(), activationAuthorized: true };
   await expect(repository.read(context, "a".repeat(64), jobId)).rejects.toMatchObject({ code: "INVALID_FREE_FIRST_JOB_INPUT" });
   expect(statements.at(-1)).toBe("ROLLBACK");
   result = { ...value(), jobId: randomUUID() };
   await expect(repository.read(context, "a".repeat(64), jobId)).rejects.toMatchObject({ code: "FREE_FIRST_JOB_UNAVAILABLE" });
   expect(statements.at(-1)).toBe("ROLLBACK");
  } finally { if (old === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = old; }
 });
 it("environment changes during connection/query roll back; authority errors are normalized", async () => {
  const old=process.env.JOBGUARD_ENV, context=verifiedTenantContextForQueuedJob(randomUUID());
  try {
   for(const stage of ['connect','result','METER_FORBIDDEN','FREE_FIRST_JOB_ACCESS_DENIED']){
    const statements:string[]=[];process.env.JOBGUARD_ENV='synthetic_demo';
    const pool={connect:async()=>{
     if(stage==='connect')process.env.JOBGUARD_ENV='production';
     return {query:async(sql:string)=>{
      statements.push(sql);
      if(sql.includes('app.mon3_read_eligibility')){
       if(stage==='result')process.env.JOBGUARD_ENV='production';
       else if(stage!=='connect')throw new Error(stage);
      }
      return {rows:[{result:value()}]};
     },release(){}};
    }} as unknown as import('pg').Pool;
    await expect(new FreeFirstJobEligibilityRepository(pool).read(context,'a'.repeat(64),jobId)).rejects.toMatchObject({code:stage==='connect'||stage==='result'?'FREE_FIRST_JOB_SYNTHETIC_ONLY':'FREE_FIRST_JOB_ACCESS_DENIED'});
    expect(statements.at(-1)).toBe('ROLLBACK');expect(statements).not.toContain('COMMIT');
   }
  }finally{if(old===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=old;}
 });
 it("every marked SQL guard has a source mutation control (structural evidence only)", async () => {
  const sql = await readFile(new URL("../migrations/0236_free_first_job_eligibility.sql", import.meta.url), "utf8");
  const guards = [
   "actor:=app.mon3_owner(t,digest);", "target.id IS NULL OR target.practice_session_digest IS NOT NULL",
   "target.provenance IS DISTINCT FROM 'system_generated_quote'", "kind IN('closed','reopened','resumed')",
   "job_track='small_builder' AND environment='synthetic_demo'", "document.parties_snapshot IS DISTINCT FROM parties",
   "r.verification_id=business.id AND r.outcome='completed'", "identity_state:=CASE WHEN business.id IS NOT NULL AND (business.company_number IS NOT NULL OR (business.normalized_phone IS NOT NULL AND card.id IS NOT NULL))",
   "prior_count>0 AND card.id IS NULL", "reasons:=array_append(reasons,'KEY_CHECK_UNAVAILABLE');", "PERFORM app.mon3_owner(t,digest);",
   "IF identity_state='unavailable' THEN", "IF local_conflict THEN", "IF NOT target_ok OR local_conflict THEN",
   "IF business.company_number IS NOT NULL THEN keys", "IF business.normalized_phone IS NOT NULL AND card.id IS NOT NULL THEN keys",
   "IF terms IS NULL THEN", "environment='synthetic_demo' AND cadence='monthly'",
   "REVOKE ALL ON FUNCTION app.mon3_read_eligibility(uuid,text,uuid) FROM PUBLIC;",
   "GRANT EXECUTE ON FUNCTION app.mon3_read_eligibility(uuid,text,uuid) TO jobguard_runtime;",
   "SECURITY DEFINER SET search_path=pg_catalog", "a.grantee<>p.proowner AND a.grantee<>0",
   "ALTER FUNCTION app.mon3_read_eligibility(uuid,text,uuid) OWNER TO jobguard_migration;",
   "EXCEPTION WHEN insufficient_privilege OR invalid_text_representation THEN",
  ];
  const structuralCheck = (source: string) => guards.every(guard => source.includes(guard)) && !/\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO|app\.)/u.test(source);
  expect(structuralCheck(sql)).toBe(true);
  for (const guard of guards) expect(structuralCheck(sql.replace(guard, "/* removed guard */")), guard).toBe(false);
  // This asserts source guard presence, not PostgreSQL execution or behavioral mutation proof.
 });
});

describe("MON-3C ELIG private advisory PostgreSQL foundation", () => {
 let f: WorkFixture;
 beforeAll(async () => { f = await createWorkFixture(); }, 60000);
 afterAll(async () => closeWorkFixture(f));
 it("ELIG-01/03/05/06/12 missing checked facts stay held; reads consume zero keys and admission refuses", async () => {
  const a = await meterCompany(f), before = await ownCounts(f, a);
  const result = trialEligibilityReadV1.parse(await read(f, a));
  expect(result.reasons).toEqual(expect.arrayContaining(["STALE_QUOTE_OR_PARTIES", "IDENTITY_UNAVAILABLE", "KEY_CHECK_UNAVAILABLE", "TERMS_UNAVAILABLE", "ADMISSION_DISABLED"]));
  expect(result.offerSkip).toBe(false); expect(result.targetStatus).toBe("ineligible");
  expect(await ownCounts(f, a)).toEqual(before);
  await expect(denyAdmission(f, a)).rejects.toThrow("FREE_FIRST_JOB_ADMISSION_DISABLED_AWAITING_C");
  expect(await ownCounts(f, a)).toEqual(before);
 });
 it("ELIG-01/06 exact fresh target offers first skip without granting entitlement; stale parties/quote refuse", async () => {
  const a = await meterCompany(f); await exactTarget(f,a); await verifyBusiness(f,a);
  const before = await ownCounts(f,a), first = trialEligibilityReadV1.parse(await read(f,a));
  expect(first.offerSkip).toBe(true); expect(first.identity).toBe("verified");
  expect(first.targetStatus).toBe("unavailable"); expect(first.admission).toBe("disabled");
  expect(first.reasons).toEqual(["KEY_CHECK_UNAVAILABLE","TERMS_UNAVAILABLE","ADMISSION_DISABLED"]);
  expect(await ownCounts(f,a)).toEqual(before);
  await f.admin.query("DELETE FROM app.job_party_current WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId]);
  const stale = await read(f,a); expect(stale.reasons).toContain("STALE_QUOTE_OR_PARTIES"); expect(stale.offerSkip).toBe(false);
  expect(stale.revisionDigest).not.toBe(first.revisionDigest);
  await workTenant(f.admin,a.tenantId,async db=>{
   await db.query("SET LOCAL session_replication_role='replica'");
   await db.query("INSERT INTO app.job_party_current(tenant_id,job_id,binding_id) VALUES($1,$2,$3)",[a.tenantId,a.jobId,first.sources.partyBindingId]);
   await db.query("UPDATE app.quote_version SET content_hash=$3 WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId,'b'.repeat(64)]);
  });
  const staleQuote=await read(f,a);expect(staleQuote.reasons).toContain('STALE_QUOTE_OR_PARTIES');expect(staleQuote.offerSkip).toBe(false);
 });
 it("ELIG-02 imported, pilot, historical activation and reopened histories cannot become first targets", async () => {
  for (const change of ["imported", "pilot", "activated", "reopened"]) {
   const a=await meterCompany(f); await exactTarget(f,a); await verifyBusiness(f,a);
   await workTenant(f.admin,a.tenantId,async db=>{
    await db.query("SET LOCAL session_replication_role='replica'");
    if(change==='imported')await db.query("UPDATE app.job SET provenance='imported',accepted_quote_version_id=NULL WHERE tenant_id=$1 AND id=$2",[a.tenantId,a.jobId]);
    if(change==='pilot')await db.query("UPDATE app.job_commercial_track SET environment='pilot_no_charge' WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId]);
    if(change==='activated')await db.query("INSERT INTO app.job_activation(id,tenant_id,job_id,accepted_document_id,accepted_document_version,accepted_document_hash,mode,activation_terms_version,fee_policy_version,actor_membership_id,activated_at) SELECT $3,$1,$2,accepted_quote_version_id,1,$4,'synthetic_demo','synthetic_demo_activation.v3','reference_fee_policy_v3',$5,clock_timestamp() FROM app.job WHERE tenant_id=$1 AND id=$2",[a.tenantId,a.jobId,randomUUID(),'a'.repeat(64),a.actorId]);
    if(change==='reopened')await db.query("INSERT INTO app.job_work_state_event(tenant_id,job_id,id,sequence,kind,fact_at,actor_membership_id,command_id,predecessor_id,request_hash,audit_event_id) VALUES($1,$2,$3,1,'reopened',clock_timestamp(),$4,$5,$6,$7,$8)",[a.tenantId,a.jobId,randomUUID(),a.actorId,randomUUID(),randomUUID(),'a'.repeat(64),randomUUID()]);
   });
   const value=await read(f,a); expect(value.targetStatus).toBe('ineligible'); expect(value.offerSkip).toBe(false);
   expect(value.reasons).toContain(change==='imported'?'IMPORTED_TARGET':change==='pilot'?'SUPPORTED_TRACK_UNAVAILABLE':'HISTORICAL_TARGET');
  }
 });
 it("ELIG-04 every local available tuple checked; foreign collisions remain identical unavailable without key writes", async () => {
  const a=await meterCompany(f);await exactTarget(f,a);
  const parent=await keyParent(f), source={...snapshot(parent),fingerprint:'sim_fp_card_a'};
  await verifyBusiness(f,a,source.company,source.phone);
  const card=await requestCard(f,a);await recordCard(f,a,resultFixture(card.attemptId));
  const before=await ownCounts(f,a), clean=await read(f,a);
  await store(f,source);
  const value=await read(f,a);expect(value).toEqual(clean);
  expect(value.keyCheck).toBe('unavailable');expect(value.targetStatus).toBe('unavailable');
  expect(await ownCounts(f,a)).toEqual(before);
  // Local phone/card collision must be checked even when company tuple is fresh.
  const b=await meterCompany(f);await exactTarget(f,b);await verifyBusiness(f,b);
  const local=await keyParent(f,b.tenantId), identity=snapshot(local);
  const verification=(await f.admin.query("SELECT company_number,normalized_phone FROM app.trial_business_verification WHERE tenant_id=$1",[b.tenantId])).rows[0];
  await store(f,{...identity,company:'different-company',phone:verification.normalized_phone,fingerprint:'sim_fp_card_a'});
  const attempt=await requestCard(f,b);await recordCard(f,b,resultFixture(attempt.attemptId));
  expect((await read(f,b)).targetStatus).toBe('ineligible');
 });
 it("ELIG-07/08 distinct second small/shared-place jobs require same-business completed card", async () => {
  for(const outcome of ['requested','redirect_only','cancelled','failed','outcome_unknown','completed']){
   const a=await meterCompany(f);await exactTarget(f,a);await verifyBusiness(f,a);
   await keyParent(f,a.tenantId); // distinct prior activation; no meter/place inference
   const attempt=await requestCard(f,a);if(outcome!=='requested')await recordCard(f,a,resultFixture(attempt.attemptId,outcome));
   const before=await ownCounts(f,a),value=await read(f,a);
   expect(value.offerSkip).toBe(false);expect(value.cardGate).toBe(outcome==='completed'?'completed':'add_card');
   expect(value.cardAction).toBe(outcome==='completed'?null:'Add a card');expect(await ownCounts(f,a)).toEqual(before);
  }
 });
 it("ELIG-05/08 phone alone never completes identity; only B's joined completed card qualifies", async () => {
  for (const outcome of ["requested", "redirect_only", "cancelled", "failed", "outcome_unknown", "completed"]) {
   const a = await meterCompany(f); await verifyBusiness(f, a, null);
   const attempt = await requestCard(f, a);
   if (outcome !== "requested") await recordCard(f, a, resultFixture(attempt.attemptId, outcome));
   const before = await ownCounts(f, a), result = trialEligibilityReadV1.parse(await read(f, a));
   expect(result.identity).toBe(outcome === "completed" ? "verified" : "unavailable");
   expect(result.cardGate).toBe(outcome === "completed" ? "completed" : "optional_first");
   expect(result.offerSkip).toBe(false); // no exact accepted quote/track yet
   expect(await ownCounts(f, a)).toEqual(before);
   expect(JSON.stringify(result)).not.toMatch(/sim_fp_|sim_ref_|demo_|fictional_/u);
  }
 });
 it("ELIG-08/10 foreign completion and shared-company requests do not grant company access", async () => {
  const a=await meterCompany(f),b=await meterCompany(f);await exactTarget(f,a);await verifyBusiness(f,a);await verifyBusiness(f,b);
  await keyParent(f,a.tenantId);
  const attempt=await requestCard(f,b);await recordCard(f,b,resultFixture(attempt.attemptId));
  const value=await read(f,a);expect(value.cardGate).toBe('add_card');expect(value.cardAction).toBe('Add a card');expect(value.sources.cardResultId).toBeNull();
  const shared='11111111-1111-4111-8111-111111111111';
  await expect(workTenant(f.runtime,shared,db=>db.query("SELECT app.mon3_read_eligibility($1,$2,$3)",[shared,a.digest,a.jobId]))).rejects.toThrow('FREE_FIRST_JOB_ACCESS_DENIED');
  await expect(read(f,a,undefined,b.digest)).rejects.toThrow('FREE_FIRST_JOB_ACCESS_DENIED');
 });
 it("ELIG-09/10 unknown, foreign, wrong session, admin, revoked and expired authority disclose identically", async () => {
  const a = await meterCompany(f), b = await meterCompany(f);
  for (const [job, digest] of [[randomUUID(), a.digest], [b.jobId, a.digest], [a.jobId, b.digest]]) await expect(read(f, a, job, digest)).rejects.toMatchObject({ code: "42501" });
  await f.admin.query("UPDATE app.membership SET role='admin' WHERE tenant_id=$1 AND id=$2", [a.tenantId, a.actorId]);
  await expect(read(f, a)).rejects.toThrow("FREE_FIRST_JOB_ACCESS_DENIED");
  await f.admin.query("UPDATE app.membership SET role='owner' WHERE tenant_id=$1 AND id=$2", [a.tenantId, a.actorId]);
  await f.admin.query("UPDATE identity.session SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [a.sessionId]);
  await expect(read(f, a)).rejects.toThrow("FREE_FIRST_JOB_ACCESS_DENIED");
  await f.admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1", [b.sessionId]);
  await expect(read(f, b)).rejects.toThrow("FREE_FIRST_JOB_ACCESS_DENIED");
  await expect(f.runtime.query("SELECT app.mon3_read_eligibility($1,$2,$3)", [a.tenantId, a.digest, a.jobId])).rejects.toThrow("FREE_FIRST_JOB_ACCESS_DENIED");
 });
 it("ELIG-11 only the checked runtime signature is exposed", async () => {
  const row = (await f.admin.query(`SELECT r.rolname owner,p.prosecdef,p.proconfig,
   has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') runtime,
   has_function_privilege('jobguard_infrastructure',p.oid,'EXECUTE') infrastructure,
   EXISTS(SELECT 1 FROM aclexplode(p.proacl) WHERE grantee=0) public
   FROM pg_proc p JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid='app.mon3_read_eligibility(uuid,text,uuid)'::regprocedure`)).rows[0];
  expect(row).toEqual({ owner: "jobguard_migration", prosecdef: true, proconfig: ["search_path=pg_catalog"], runtime: true, infrastructure: false, public: false });
 });
});
