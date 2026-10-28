import { projectMeterJobTimeline } from "@jobguard/core";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withTenant } from "../src/tenant-context.js";
import { JobWorkStateRepository } from "../src/job-work-state-repository.js";
import { closeWorkFixture, createWorkFixture, seedWorkJob, workTenant, boundaryLock, prepareWorkAccount, type WorkFixture, type WorkJob } from "./job-work-state-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";
import { FinalAccountLockRepository } from "../src/final-account-lock-repository.js";
import { activateMeterJob } from "./meter-journey-fixtures.js";
import { historicalAgreement } from "./subscription-persistence-fixtures.js";

// CI PostgreSQL only. Activation parents are explicit storage fixtures;
// resume/reopen execute the real checked command, receipt and audit path.
describe("MON-1 work admission attacks", () => {
 let f: WorkFixture;
 beforeAll(async () => { f = await createWorkFixture(); }, 60000);
 afterAll(async () => closeWorkFixture(f));
 const activation = (a: WorkJob, small = false, stage = false) => activateMeterJob(f,a,small,stage);
 const repo = () => new JobWorkStateRepository(f.runtime);
 const command = (a: WorkJob, action: string, revision: number, extra = {}) => repo().command(a.context, a.jobId, a.actorId,
  { version: "job-work-state-command.v1", commandId: randomUUID(), action, expectedRevision: revision, ...extra });
 async function company(count = 0, plan: "Solo" | "Builder" = "Solo") {
  const a = await meterCompany(f); await historicalAgreement(f, a, plan);
  for (let i = 0; i < count; i++) await activation(await seedWorkJob(f, a.tenantId));
  return a;
 }
 const events = async (a: WorkJob) => (await f.admin.query("SELECT id,kind FROM app.job_work_state_event WHERE tenant_id=$1 AND job_id=$2 ORDER BY sequence", [a.tenantId, a.jobId])).rows;
 it("reserves unstarted jobs and refuses a seventh reopen without a successful receipt", async () => {
  const a = await company(6); await activation(a);
  const closed = await command(a, "close", 0, { reason: "other", note: "Fictional closure" });
  const before = await events(a);
  await expect(command(a, "reopen", 1, { closeEventId: closed.events[0]!.id })).rejects.toMatchObject({ code: "METER_UPGRADE_REQUIRED" });
  expect(await events(a)).toEqual(before);
  expect((await f.admin.query("SELECT count(*)::int n FROM app.command_receipt WHERE tenant_id=$1 AND command_type='WorkState.reopen'", [a.tenantId])).rows[0].n).toBe(0);
 });
 it("concurrent reopens compete for one grace place", async () => {
  const a = await company(5), b = await seedWorkJob(f, a.tenantId); await activation(a); await activation(b);
  const ca = await command(a, "close", 0, { reason: "other", note: "Fictional closure A" });
  const cb = await command(b, "close", 0, { reason: "other", note: "Fictional closure B" });
  const result = await Promise.allSettled([command(a, "reopen", 1, { closeEventId: ca.events[0]!.id }), command(b, "reopen", 1, { closeEventId: cb.events[0]!.id })]);
  expect(result.filter(x => x.status === "fulfilled")).toHaveLength(1);
  expect(result.filter(x => x.status === "rejected").map(x => x.reason.code)).toEqual(["METER_UPGRADE_REQUIRED"]);
 });
 it("identical resumes replay once; changed payload, stale revision, foreign tenant and revoked actor refuse", async () => {
  const a = await company(); await activation(a);
  const input = { version: "job-work-state-command.v1", commandId: randomUUID(), action: "resume", expectedRevision: 0 };
  const run = () => repo().command(a.context, a.jobId, a.actorId, input);
  const first = await Promise.all([run(), run()]); expect(first[0]).toEqual(first[1]); expect(await events(a)).toHaveLength(1);
  await expect(repo().command(a.context, a.jobId, a.actorId, { ...input, action: "finish" })).rejects.toThrow("IDEMPOTENCY_CONFLICT");
  await expect(command(a, "resume", 0)).rejects.toThrow("WORK_STATE_STALE_REVISION");
  const foreign = await company();
  await expect(repo().command(foreign.context, a.jobId, foreign.actorId, input)).rejects.toThrow("WORK_STATE_FORBIDDEN");
  await f.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [a.tenantId, a.actorId]);
  await expect(run()).rejects.toThrow("WORK_STATE_FORBIDDEN");
 });
 it("locked jobs cannot resume or change their lock; Builder remains unblocked beyond grace", async () => {
  const a = await company(14, "Builder"); await activation(a);
  await expect(command(a, "resume", 0)).resolves.toMatchObject({ events: [{ kind: "resumed" }] });
  await boundaryLock(f, a);
  const snapshot = async () => (await f.admin.query("SELECT to_jsonb(l) value FROM app.final_account_lock l WHERE tenant_id=$1 AND job_id=$2", [a.tenantId, a.jobId])).rows;
  const before = await snapshot(); await expect(command(a, "resume", 1)).rejects.toThrow("POST_LOCK_WORK_REQUIRES_LINKED_JOB"); expect(await snapshot()).toEqual(before);
 });
 it("small allowance cannot be replaced by a client count, amount or shadow flag", async () => {
  const a = await company(6); await activation(a, true); await expect(command(a, "resume", 0)).resolves.toBeDefined();
  for (const extra of [{ countedPlaces: 0 }, { plan: "Builder" }, { amountPence: -1 }, { small: true }, { sourceHash: "a".repeat(64) }, { shadowSignals: [] }]) await expect(command(a, "resume", 1, extra)).rejects.toThrow("INVALID_WORK_STATE_INPUT");
  expect(await events(a)).toHaveLength(1);
 });
 it("one customer and site shares a place, but two customers at one site remain separate", async () => {
  for (const shareCustomer of [true, false]) {
   const a = await company(6); await activation(a);
   const closed = await command(a, "close", 0, { reason: "other", note: "Fictional closure" });
   await workTenant(f.admin, a.tenantId, async db => {
    await db.query("SET LOCAL session_replication_role='replica'");
    await db.query(`UPDATE app.job_party_binding target SET site_id=other.site_id,
     customer_id=CASE WHEN $3::boolean THEN other.customer_id ELSE target.customer_id END
     FROM (SELECT b.customer_id,b.site_id FROM app.job_activation ac JOIN app.job_party_binding b
      ON(b.tenant_id,b.job_id,b.id)=(ac.tenant_id,ac.job_id,ac.party_binding_id)
      WHERE ac.tenant_id=$1 AND ac.job_id<>$2 LIMIT 1) other
     WHERE target.tenant_id=$1 AND target.job_id=$2`, [a.tenantId, a.jobId, shareCustomer]);
   });
   const attempt = command(a, "reopen", 1, { closeEventId: closed.events[0]!.id });
   if (shareCustomer) await expect(attempt).resolves.toBeDefined();
   else await expect(attempt).rejects.toThrow("METER_UPGRADE_REQUIRED");
  }
 });
 it("London midnight stops survive the DST change and exact-stop activity", async () => {
  const a = await company(); await activation(a);
  // Explicit historical ledger fixture: no public backdate or provider route.
  const first = randomUUID(), finished = randomUUID();
  await workTenant(f.admin, a.tenantId, async db => {
   await db.query("SET LOCAL session_replication_role='replica'");
   await db.query(`INSERT INTO app.job_work_state_event(tenant_id,job_id,id,sequence,kind,fact_at,recorded_at,actor_membership_id,command_id,source_receipt_id,request_hash,audit_event_id)
    VALUES($1,$2,$3,1,'first_site_evidence','2026-10-20T11:00Z','2026-10-20T11:00Z',NULL,NULL,$4,$5,$6),
    ($1,$2,$7,2,'finished_on_site','2026-10-23T11:00Z','2026-10-23T11:00Z',$8,$9,NULL,$5,$10)`,
    [a.tenantId,a.jobId,first,randomUUID(),"a".repeat(64),randomUUID(),finished,a.actorId,randomUUID(),randomUUID()]);
  });
  const committed = (cutoff: string) => workTenant(f.admin, a.tenantId, async db =>
   (await db.query("SELECT app.mon1_work_committed($1,$2,'2026-10-01T11:00Z',$3::timestamptz) value", [a.tenantId,a.jobId,cutoff])).rows[0].value);
  // 7 London dates cross the clock change: 30 Oct midnight is UTC midnight.
  expect(await committed("2026-10-29T23:59:59.999999Z")).toBe(true);
  expect(await committed("2026-10-30T00:00:00Z")).toBe(false);
  await workTenant(f.admin, a.tenantId, async db => {
   await db.query("SET LOCAL session_replication_role='replica'");
   await db.query(`INSERT INTO app.job_work_state_event(tenant_id,job_id,id,sequence,kind,fact_at,recorded_at,source_receipt_id,request_hash,audit_event_id)
    VALUES($1,$2,$3,3,'site_activity','2026-10-30T00:00Z','2026-10-30T00:00Z',$4,$5,$6)`, [a.tenantId,a.jobId,randomUUID(),randomUUID(),"a".repeat(64),randomUUID()]);
  });
  expect(await committed("2026-10-30T00:00:00Z")).toBe(false);
  await workTenant(f.admin, a.tenantId, async db => {
   await db.query("SET LOCAL session_replication_role='replica'");
   await db.query(`INSERT INTO app.job_work_state_event(tenant_id,job_id,id,sequence,kind,fact_at,recorded_at,source_receipt_id,request_hash,audit_event_id)
    VALUES($1,$2,$3,4,'site_activity','2026-10-30T00:00:00.000001Z','2026-10-30T00:00:00.000001Z',$4,$5,$6)`, [a.tenantId,a.jobId,randomUUID(),randomUUID(),"a".repeat(64),randomUUID()]);
  });
  expect(await committed("2026-10-30T00:00:00.000001Z")).toBe(true);
  expect(await committed("2026-11-29T00:00Z")).toBe(false);
 });
 const snapshots = async (a: WorkJob) => (await f.admin.query("SELECT source_hash,jobs FROM app.meter_work_ledger WHERE tenant_id=$1 ORDER BY recorded_at,source_hash", [a.tenantId])).rows;
 const moneyRows = async (a: WorkJob) => {
  const rows:Record<string,unknown>={};
  for(const table of ['journal','recovery_fee_journal','platform_statement','synthetic_obligation']) rows[table]=(await f.admin.query(`SELECT to_jsonb(t) value FROM app.${table} t WHERE tenant_id=$1 ORDER BY to_jsonb(t)::text`,[a.tenantId])).rows;
  return rows;
 };
 const currentCommitment = async (a: WorkJob) => (await snapshots(a)).at(-1)!.jobs.find((job: { jobId: string }) => job.jobId === a.jobId)?.committed;
 it("each command refreshes stored commitments in the same transaction, including the real lock command", async () => {
  const a = await company(); await activation(a);
  const moneyBefore=await moneyRows(a);
  const initial = { version: "job-work-state-command.v1", commandId: randomUUID(), action: "resume", expectedRevision: 0 };
  await repo().command(a.context,a.jobId,a.actorId,initial);
  expect(await currentCommitment(a)).toBe(true);
  const closed = await command(a,"close",1,{reason:"other",note:"Fictional stop"});
  expect(await currentCommitment(a)).toBe(false);
  const afterClose = await snapshots(a);
  // A duplicate retains the first command result but cannot restore old capacity.
  await repo().command(a.context,a.jobId,a.actorId,initial);
  expect(await snapshots(a)).toEqual(afterClose);
  await command(a,"reopen",2,{closeEventId:closed.events.at(-1)!.id});
  expect(await currentCommitment(a)).toBe(true);
  await command(a,"resume",3);
  expect(await currentCommitment(a)).toBe(true);
  const account = await prepareWorkAccount(f,a), lock = new FinalAccountLockRepository(f.runtime);
  await lock.acceptTerms(a.context,{actorMembershipId:a.actorId,commandId:randomUUID(),termsVersion:"synthetic_final_check_terms.v1"});
  await lock.disposition(a.context,{jobId:a.jobId,actorMembershipId:a.actorId,commandId:randomUUID(),scopeItemId:a.scopeId,disposition:"done"});
  await lock.lock(a.context,{jobId:a.jobId,actorMembershipId:a.actorId,commandId:randomUUID(),finalAccountRevisionId:account.revisionId,expectedRevision:1,declarationVersion:"final_account_declaration.v1"});
  expect(await currentCommitment(a)).toBe(false);
  await expect(command(a,"resume",4)).rejects.toThrow("POST_LOCK_WORK_REQUIRES_LINKED_JOB");
  expect(await moneyRows(a)).toEqual(moneyBefore);
 });
 it("a ledger write failure rolls back the command event, receipt and audit together", async () => {
  const a = await company(); await activation(a); await command(a,"resume",0);
  const before = await snapshots(a), eventBefore = await events(a);
  const receipts = async () => (await f.admin.query("SELECT count(*)::int n FROM app.command_receipt WHERE tenant_id=$1",[a.tenantId])).rows[0].n;
  const receiptBefore = await receipts();
  const audits=async()=>(await f.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1",[a.tenantId])).rows[0].n;
  const auditBefore=await audits();
  await f.admin.query(`CREATE FUNCTION app.mon1_test_ledger_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'fixture ledger write failed'; END$$;
   CREATE TRIGGER mon1_test_ledger_failure BEFORE INSERT ON app.meter_work_ledger FOR EACH ROW EXECUTE FUNCTION app.mon1_test_ledger_failure()`);
  try {
   await expect(command(a,"close",1,{reason:"other",note:"Fictional failed close"})).rejects.toThrow("fixture ledger write failed");
   expect(await events(a)).toEqual(eventBefore); expect(await snapshots(a)).toEqual(before); expect(await receipts()).toBe(receiptBefore); expect(await audits()).toBe(auditBefore);
  } finally { await f.admin.query("ALTER TABLE app.meter_work_ledger DISABLE TRIGGER mon1_test_ledger_failure"); }
 });
 it("a corrupted stored projection cannot authorize admission, and runtime cannot alter it", async () => {
  const a = await company(); await activation(a); await command(a,"resume",0);
  const hash = (await snapshots(a)).at(-1)!.source_hash, before = await events(a);
  await f.admin.query("ALTER TABLE app.meter_work_ledger DISABLE TRIGGER immutable");
  try { await f.admin.query("UPDATE app.meter_work_ledger SET jobs='[]' WHERE tenant_id=$1 AND source_hash=$2",[a.tenantId,hash]); }
  finally { await f.admin.query("ALTER TABLE app.meter_work_ledger ENABLE TRIGGER immutable"); }
  await expect(command(a,"resume",1)).rejects.toMatchObject({code:"METER_PROJECTION_MISMATCH"});
  expect(await events(a)).toEqual(before);
  const b = await company();
  expect(await workTenant(f.admin,b.tenantId,async db=>{await db.query("SET LOCAL ROLE jobguard_migration");return (await db.query("SELECT * FROM app.meter_work_ledger WHERE source_hash=$1",[hash])).rows;})).toEqual([]);
  await expect(workTenant(f.runtime,a.tenantId,db=>db.query("SELECT * FROM app.meter_work_ledger"))).rejects.toThrow("permission denied");
  await expect(workTenant(f.runtime,a.tenantId,db=>db.query("SELECT app.mon1_refresh_work_ledger($1)",[a.tenantId]))).rejects.toThrow("permission denied");
 });
 it("missing accepted terms and legacy live imports are explicitly refused, never zero-filled", async () => {
  const a = await meterCompany(f); await activation(a);
  await expect(command(a,"resume",0)).rejects.toThrow("CAPACITY_ADMISSION_UNAVAILABLE");
  expect(await events(a)).toEqual([]);
  const b = await company();
  await workTenant(f.admin,b.tenantId,async db=>{
   await db.query("SET LOCAL session_replication_role='replica'");
   await db.query("UPDATE app.job SET provenance='imported' WHERE tenant_id=$1 AND id=$2",[b.tenantId,b.jobId]);
  });
  await expect(workTenant(f.admin,b.tenantId,async db=>{await db.query("SET LOCAL ROLE jobguard_migration");return db.query("SELECT app.mon1_refresh_work_ledger($1)",[b.tenantId]);})).rejects.toThrow("CAPACITY_ADMISSION_UNAVAILABLE");
 });
 it("distinct activation terms race for the last Solo grace place under the tenant serializer", async () => {
  const a=await company(5),b=await seedWorkJob(f,a.tenantId);
  const first=await activation(a,false,true), second=await activation(b,false,true);
  // Parent activations are explicit synthetic fixtures. Enable the real
  // admission trigger during replica fixture insertion so its guard is tested.
  await f.admin.query("ALTER TABLE app.job_activation_terms ENABLE ALWAYS TRIGGER mon1_live_admission");
  try {
   const insert=(job:WorkJob,staged:typeof first)=>withTenant(f.admin,job.context,async db=>{
    await db.$client.query("SET LOCAL session_replication_role='replica'");
    await db.$client.query("SET LOCAL ROLE jobguard_migration");
    return db.$client.query(staged.sql,staged.values);
   });
   const outcomes=await Promise.allSettled([insert(a,first),insert(b,second)]);
   expect(outcomes.filter(r=>r.status==='fulfilled')).toHaveLength(1);
   expect(outcomes.filter(r=>r.status==='rejected').map(r=>r.reason.message)).toEqual(['METER_UPGRADE_REQUIRED']);
   expect((await f.admin.query("SELECT count(*)::int n FROM app.job_activation_terms WHERE tenant_id=$1",[a.tenantId])).rows[0].n).toBe(6);
  } finally {await f.admin.query("ALTER TABLE app.job_activation_terms ENABLE TRIGGER mon1_live_admission");}
 });
 it("an automatic small-job trip refreshes classification beyond grace and cannot be reversed", async () => {
  const a=await company(6); await activation(a,true); await command(a,'resume',0);
  const source=(await f.admin.query("SELECT activation_id,baseline_quote_version_id FROM app.job_activation_terms WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId])).rows[0];
  await f.admin.query("ALTER TABLE app.job_small_trip_event ENABLE ALWAYS TRIGGER mon1_trip_refresh");
  try {
   await workTenant(f.admin,a.tenantId,async db=>{
    await db.query("SET LOCAL session_replication_role='replica'");
    await db.query(`INSERT INTO app.job_small_trip_event(tenant_id,job_id,id,activation_id,baseline_quote_version_id,source_kind,source_id,effective_at,net_pence,source_hash,policy_version)
     VALUES($1,$2,$3,$4,$5,'variation_approval',$6,clock_timestamp(),400001,$7,'meter-small-trip.v1')`,[a.tenantId,a.jobId,randomUUID(),source.activation_id,source.baseline_quote_version_id,randomUUID(),'a'.repeat(64)]);
   });
   const last=(await snapshots(a)).at(-1)!.jobs.find((j:{jobId:string})=>j.jobId===a.jobId);
   expect(last).toMatchObject({small:false,committed:true});
   await expect(workTenant(f.admin,a.tenantId,db=>db.query("UPDATE app.job_small_trip_event SET net_pence=400002 WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId]))).rejects.toThrow();
   expect((await snapshots(a)).at(-1)!.jobs).toContainEqual(last);
  } finally {await f.admin.query("ALTER TABLE app.job_small_trip_event ENABLE TRIGGER mon1_trip_refresh");}
 });
 it("the SQL commitment clock agrees with the approved core counting intervals after start", async () => {
  const activated="2026-10-01T11:00:00.000000Z", first={kind:"first_site_evidence",at:"2026-10-05T11:00:00.000000Z"};
  const finish={kind:"finished_on_site",at:"2026-10-23T11:00:00.000000Z"};
  const cases=[
   {facts:[],cutoff:"2026-10-31T00:00:00.000000Z"},
   {facts:[first],cutoff:"2026-11-04T00:00:00.000000Z"},
   {facts:[first,finish],cutoff:"2026-10-30T00:00:00.000000Z"},
   {facts:[first,finish,{kind:"finished_cancelled",at:"2026-10-25T12:00:00.000000Z"}],cutoff:"2026-10-30T00:00:00.000000Z"},
   {facts:[first,{kind:"site_activity",at:"2026-11-04T00:00:00.000000Z"}],cutoff:"2026-11-04T00:00:00.000000Z"},
   {facts:[first,{kind:"site_activity",at:"2026-11-04T00:00:00.000001Z"}],cutoff:"2026-11-04T00:00:00.000001Z"},
   {facts:[first,{kind:"closed",at:"2026-10-10T12:00:00.000000Z"},{kind:"reopened",at:"2026-10-15T12:00:00.000000Z"},{kind:"resumed",at:"2026-10-18T12:00:00.000000Z"}],cutoff:"2026-10-19T12:00:00.000000Z"},
  ];
  for(const scenario of cases) {
   const a=await seedWorkJob(f), seen=new Map<string,string>();
   const facts=scenario.facts.map((fact,i)=>{
    const id=randomUUID(),site=['first_site_evidence','site_activity'].includes(fact.kind);
    const target=fact.kind==='finished_cancelled'?'finished_on_site':fact.kind==='reopened'?'closed':null;
    const event={version:'job-work-state-event.v1',id,jobId:a.jobId,sequence:i+1,kind:fact.kind,factAt:fact.at,recordedAt:fact.at,
     sourceReceiptId:site?randomUUID():null,commandId:site?null:randomUUID(),predecessorId:target?seen.get(target)!:null,
     closeReason:fact.kind==='closed'?'other':null,closeNote:fact.kind==='closed'?'Fictional closure':null};
    seen.set(fact.kind,id);return event;
   });
   await workTenant(f.admin,a.tenantId,async db=>{
    await db.query("SET LOCAL session_replication_role='replica'");
    for(const fact of facts) await db.query(`INSERT INTO app.job_work_state_event(tenant_id,job_id,id,sequence,kind,fact_at,recorded_at,actor_membership_id,command_id,source_receipt_id,predecessor_id,close_reason,close_note,request_hash,audit_event_id)
     VALUES($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,[a.tenantId,a.jobId,fact.id,fact.sequence,fact.kind,fact.factAt,a.actorId,fact.commandId,fact.sourceReceiptId,fact.predecessorId,fact.closeReason,fact.closeNote,'a'.repeat(64),randomUUID()]);
   });
   const input={version:'meter-lifecycle-input.v1',tenantId:a.tenantId,jobId:a.jobId,sourceRevision:1,
    activation:{id:randomUUID(),at:activated,termsId:randomUUID(),termsRevision:1,track:'small_builder',partyBindingId:randomUUID(),customerId:randomUUID(),siteId:randomUUID(),small:false},
    events:facts,lock:null,trip:null,trial:{status:'unavailable'},policy:{version:'meter-lifecycle-policy.v1',revision:'london-midnight-stops.v1',clockStatus:'approved'},
    asOf:scenario.cutoff,startDate:'2026-10-01',endDateExclusive:'2026-12-01'};
   const expected=projectMeterJobTimeline(input).intervals.some(interval=>interval.start<=scenario.cutoff && (interval.end===null || scenario.cutoff<interval.end));
   expect(await workTenant(f.admin,a.tenantId,async db=>(await db.query("SELECT app.mon1_work_committed($1,$2,$3,$4) value",[a.tenantId,a.jobId,activated,scenario.cutoff])).rows[0].value)).toBe(expected);
  }
 });
 it("private helpers have neither runtime execution nor shadow dependencies", async () => {
  const definitions = (await f.admin.query(`SELECT pg_get_functiondef(oid) definition,has_function_privilege('jobguard_runtime',oid,'EXECUTE') runtime
   FROM pg_proc WHERE pronamespace='app'::regnamespace AND proname IN('mon1_work_committed','ch4_admit_place','mon1_admit_work_event','mon1_admit_live_source','mon1_refresh_work_ledger','mon1_refresh_after_source')`)).rows;
  expect(definitions).toHaveLength(6);
  for (const row of definitions) { expect(row.runtime).toBe(false); expect(row.definition).not.toMatch(/app\.(shadow|finding|recovery|eligibility)/u); }
 });
});
