import { testTenantContext } from "./tenant-context-test-utils.js";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate, RecoveryCaseRepository, type VerifiedTenantContext, withTenant } from "../src/index.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { PostgresRecoveryOutcomePostingPort } from "../src/recovery-repository.js";
import { rolledBack } from "./upgrade-proof-utils.js";
// Test-only shared contract import from source: DB tests need no API build artifact.
import { recoveryCommandRefusalV1, recoveryCommandRefusalRulesV1, recoveryCaseCommandResponseV1 } from "../../../apps/api/src/recovery-case.contracts.js";

const T="10000000-0000-4000-8000-000000000001",J="20000000-0000-4000-8000-000000000002",C1="30000000-0000-4000-8000-000000000003",C2="30000000-0000-4000-8000-000000000004",R="40000000-0000-4000-8000-000000000004",E="50000000-0000-4000-8000-000000000005",EA1="60000000-0000-4000-8000-000000000006",LA1="70000000-0000-4000-8000-000000000007",EA2="60000000-0000-4000-8000-000000000008",LA2="70000000-0000-4000-8000-000000000009";
const context=testTenantContext(T);const owner={membershipId:randomUUID(),identityUserId:randomUUID()},owner2={membershipId:randomUUID(),identityUserId:randomUUID()};let pg:EmbeddedPostgres,admin:Pool,runtime:Pool,dir:string;
beforeAll(async()=>{dir=await mkdtemp(join(tmpdir(),"recovery-pg-"));const port=await freePort(57600,100);pg=new EmbeddedPostgres({databaseDir:dir,port,user:"postgres",password:"synthetic",persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C"],onLog:()=>undefined});await pg.initialise();await pg.start(); await pg.createDatabase("jobguard_synthetic_demo");admin=new Pool({host:"127.0.0.1",port,user:"postgres",password:"synthetic", database: "jobguard_synthetic_demo"});await migrate(admin);await installLegacySyntheticPartyFixtures(admin);
 await admin.query(`SET session_replication_role=replica;INSERT INTO control_plane.tenant(id)VALUES('${T}');INSERT INTO identity.identity_user(id)VALUES('${owner.identityUserId}');INSERT INTO app.account(id,tenant_id,name)VALUES('${T}','${T}','Synthetic account');INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)VALUES('${owner.membershipId}','${T}','${T}','${owner.identityUserId}','owner');INSERT INTO app.job(id,tenant_id,title,status,revision)VALUES('${J}','${T}','Synthetic recovery','live',1);INSERT INTO app.job_activation(id,tenant_id,job_id,accepted_document_id,accepted_document_version,accepted_document_hash,mode,activation_terms_version,fee_policy_version,actor_membership_id,activated_at)VALUES(gen_random_uuid(),'${T}','${J}',gen_random_uuid(),1,'${"a".repeat(64)}','synthetic_demo','synthetic_demo_illustrative.v1','reference_fee_policy_v1',gen_random_uuid(),now());INSERT INTO app.cap_snapshot(id,tenant_id,job_id,activation_id,baseline_quote_version_id,accepted_net_value_pence,currency,recovery_cap_pence,fee_policy_version,illustrative)SELECT gen_random_uuid(),tenant_id,job_id,id,gen_random_uuid(),1880000,'GBP',28200,'reference_fee_policy_v1',true FROM app.job_activation;INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,state,object_version_id,server_verified_at,expires_at)VALUES(gen_random_uuid(),'${T}','${J}','synthetic/upload','${"b".repeat(64)}','application/pdf',1,'standard_evidence','verified','v1',now(),now()+interval '1 hour');INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)SELECT '${E}','${T}',id,'${J}','original','synthetic_bank_receipt','synthetic/key','v1','${"b".repeat(64)}',1,'application/pdf','standard_evidence',now(),now() FROM app.evidence_upload WHERE tenant_id='${T}';INSERT INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic)VALUES('${C1}','${T}','${J}',100,'GBP','active',0,true),('${C2}','${T}','${J}',100,'GBP','active',0,true);INSERT INTO app.synthetic_recovery_receipt(id,tenant_id,job_id,source_identity,reconciliation_identity,status,gross_pence,currency,synthetic,settled_at)VALUES('${R}','${T}','${J}','fake-provider-1','cash-1','settled',100,'GBP',true,now());INSERT INTO app.recovery_approval(id,tenant_id,job_id,case_id,kind,expected_case_revision,status,policy_version,expires_at,command_id)VALUES('${EA1}','${T}','${J}','${C1}','eligibility',0,'approved','reference_fee_policy_v1',now()+interval '1 hour',gen_random_uuid()),('${LA1}','${T}','${J}','${C1}','landing',0,'approved','reference_fee_policy_v1',now()+interval '1 hour',gen_random_uuid()),('${EA2}','${T}','${J}','${C2}','eligibility',0,'approved','reference_fee_policy_v1',now()+interval '1 hour',gen_random_uuid()),('${LA2}','${T}','${J}','${C2}','landing',0,'approved','reference_fee_policy_v1',now()+interval '1 hour',gen_random_uuid());SET session_replication_role=origin;CREATE ROLE recovery_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOBYPASSRLS;GRANT jobguard_runtime TO recovery_login;`);runtime=new Pool({host:"127.0.0.1",port,database:"jobguard_synthetic_demo",user:"recovery_login",password:"synthetic",max:4});},60_000);
afterAll(async()=>{await closeTestPools(runtime,admin);await pg.stop();await rm(dir,{recursive:true,force:true});});
const payload=(caseId:string,eligibility:string,landing:string)=>({version:"recovery.landing.approve.v1",allocationId:randomUUID(),derivationId:randomUUID(),journalId:randomUUID(),jobId:J,caseId,receiptId:R,evidenceId:E,eligibilityApprovalId:eligibility,landingApprovalId:landing,grossPence:70,eligibleNetPence:70,currency:"GBP",policyVersion:"reference_fee_policy_v1",expectedCaseRevision:0});
describe("structural recovery fee guard",()=>{
 it("configures only the generated synthetic scenario through the narrow routine after invoicing",async()=>{/* Ruling 103: owner-only lifecycle setup; the narrow routine below still runs as runtime. */await withTenant(admin,context,db=>db.$client.query("SELECT app.transition_job($1,$2,1,'invoiced','issue_invoice',NULL,NULL,NULL,NULL)",[T,J]));const command=randomUUID();await withTenant(runtime,context,db=>db.$client.query(`SELECT app.configure_recovery_demo($1,$2,$3)`,[J,command,"eligible"]));const row=(await withTenant(runtime,context,db=>db.$client.query(`SELECT scenario,evidence_id,receipt_id FROM app.recovery_demo_selection WHERE tenant_id=$1 AND job_id=$2`,[T,J]))).rows[0];expect(row.scenario).toBe("eligible");expect(row.evidence_id).toBeTruthy();expect(row.receipt_id).toBeTruthy();await expect(withTenant(runtime,context,db=>db.$client.query(`INSERT INTO app.recovery_demo_selection(tenant_id,job_id,command_id,scenario,case_id)VALUES($1,$2,$3,'eligible',$4)`,[T,J,randomUUID(),C1]))).rejects.toMatchObject({code:"42501"});});
 it("denies actual direct runtime writes and serializes competing receipt allocations",async()=>{await expect(withTenant(runtime,context,db=>db.$client.query(`INSERT INTO app.recovery_fee_journal(id,tenant_id,job_id,derivation_id,kind,amount_pence,currency,debit_code,credit_code)VALUES(gen_random_uuid(),$1,$2,gen_random_uuid(),'fee_obligation',1,'GBP','a','b')`,[T,J]))).rejects.toMatchObject({code:"42501"});const outcomes=await Promise.allSettled([withTenant(runtime,context,db=>db.$client.query(`SELECT app.approve_synthetic_landing($1::jsonb)`,[payload(C1,EA1,LA1)])),withTenant(runtime,context,db=>db.$client.query(`SELECT app.approve_synthetic_landing($1::jsonb)`,[payload(C2,EA2,LA2)]))]);expect(outcomes.filter(x=>x.status==="fulfilled")).toHaveLength(1);expect(outcomes.filter(x=>x.status==="rejected")).toHaveLength(1);expect((await admin.query(`SELECT sum(gross_pence) total FROM app.landing_allocation WHERE tenant_id=$1 AND receipt_id=$2`,[T,R])).rows[0].total).toBe("70");});
 it("the existing landing routine reads amended workbench claims and revisions", async()=>{
  const repo=new RecoveryCaseRepository(runtime),reviewer=owner;
  let c=await repo.command(context,J,{version:"recovery-case-command.v1",action:"open",commandId:randomUUID(),caseType:"withheld_customer_payment",claimedNetPence:100,counterparty:"Synthetic",book:"builder_customer",sourceType:"customer_invoice",sourceRefs:["Generated customer invoice INV-18800"],expectedRevision:0},reviewer);
  c=await repo.command(context,J,{version:"recovery-case-command.v1",action:"amend_claim",commandId:randomUUID(),caseId:c.id,claimedNetPence:50,expectedRevision:c.revision},reviewer);
  c=await repo.command(context,J,{version:"recovery-case-command.v1",action:"transition",commandId:randomUUID(),caseId:c.id,eventType:"assemble_evidence",expectedRevision:c.revision},reviewer);
  const receipt=randomUUID(),eligibility=randomUUID(),landing=randomUUID();
  await admin.query("INSERT INTO app.synthetic_recovery_receipt(id,tenant_id,job_id,source_identity,reconciliation_identity,status,gross_pence,currency,synthetic,settled_at)VALUES($1::uuid,$2::uuid,$3::uuid,$1::text,$1::text,'settled',100,'GBP',true,now())",[receipt,T,J]);
  for(const [id,kind] of [[eligibility,"eligibility"],[landing,"landing"]])await admin.query("INSERT INTO app.recovery_approval(id,tenant_id,job_id,case_id,kind,expected_case_revision,status,policy_version,expires_at,command_id)VALUES($1,$2,$3,$4,$5,$6,'approved','reference_fee_policy_v1',now()+interval '1 hour',$7)",[id,T,J,c.id,kind,c.revision,randomUUID()]);
  const p={...payload(c.id,eligibility,landing),receiptId:receipt,expectedCaseRevision:c.revision,grossPence:60,eligibleNetPence:60};
  await expect(withTenant(runtime,context,db=>db.$client.query("SELECT app.approve_synthetic_landing($1::jsonb)",[p]))).rejects.toThrow("allocation exceeds available receipt or claim");
  await expect(withTenant(runtime,context,db=>db.$client.query("SELECT app.approve_synthetic_landing($1::jsonb)",[{...p,expectedCaseRevision:0}]))).rejects.toThrow("eligible current synthetic case required");
  // Execute the positive path and roll back only this test's financial effect.
  await withTenant(runtime,context,async db=>{
   await db.$client.query("SAVEPOINT valid_landing");
   const result=await db.$client.query("SELECT app.approve_synthetic_landing($1::jsonb) id",[{...p,grossPence:40,eligibleNetPence:40}]);
   expect(result.rows[0].id).toBe(p.derivationId);
   await db.$client.query("ROLLBACK TO SAVEPOINT valid_landing");
  });
 });
 describe("M4-1-S-R repair 3: financial path and fee projection", () => {
  const E2 = randomUUID(), T2 = randomUUID();
  type World = { tenant: string; ctx: VerifiedTenantContext; job: string; evidence: string; reviewer: { membershipId: string; identityUserId: string } };
  const base: World = { tenant: T, ctx: context, job: J, evidence: E2, reviewer: owner };
  const second = { tenant: T2, ctx: testTenantContext(T2), reviewer: owner2 };
  // These tests keep their landings; they use their own evidence object so that the later invalidation test (which invalidates E) sees only its own derivation.
  beforeAll(async () => {
   const upload = randomUUID();
   await admin.query(`SET session_replication_role=replica;INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,state,object_version_id,server_verified_at,expires_at)VALUES('${upload}','${T}','${J}','synthetic/upload-r3','${"c".repeat(64)}','application/pdf',1,'standard_evidence','verified','v1',now(),now()+interval '1 hour');INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)VALUES('${E2}','${T}','${upload}','${J}','original','synthetic_bank_receipt','synthetic/key-r3','v1','${"c".repeat(64)}',1,'application/pdf','standard_evidence',now(),now());INSERT INTO control_plane.tenant(id)VALUES('${T2}');INSERT INTO app.account(id,tenant_id,name)VALUES('${T2}','${T2}','Second account');INSERT INTO identity.identity_user(id)VALUES('${owner2.identityUserId}');INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)VALUES('${owner2.membershipId}','${T2}','${T2}','${owner2.identityUserId}','owner');SET session_replication_role=origin`);
  });
  // A job in its own tenant (so its landing reversals do not add rows the tenant-wide invalidation test counts) with a cap, evidence, and
  // optionally a settled plan fee, which is what lets the reference fee be offset by plan credit.
  async function createWorld(planCredit: boolean): Promise<World> {
   const job = randomUUID(), evidence = randomUUID(), upload = randomUUID(), activation = randomUUID(), obligation = randomUUID(), digest = planCredit ? "d" : "e";
   await admin.query(`SET session_replication_role=replica;INSERT INTO app.job(id,tenant_id,title,status,revision)VALUES('${job}','${T2}','Second tenant recovery','live',1);INSERT INTO app.job_activation(id,tenant_id,job_id,accepted_document_id,accepted_document_version,accepted_document_hash,mode,activation_terms_version,fee_policy_version,actor_membership_id,activated_at)VALUES('${activation}','${T2}','${job}',gen_random_uuid(),1,'${"a".repeat(64)}','synthetic_demo','synthetic_demo_illustrative.v1','reference_fee_policy_v1',gen_random_uuid(),now());INSERT INTO app.cap_snapshot(id,tenant_id,job_id,activation_id,baseline_quote_version_id,accepted_net_value_pence,currency,recovery_cap_pence,fee_policy_version,illustrative)VALUES(gen_random_uuid(),'${T2}','${job}','${activation}',gen_random_uuid(),1880000,'GBP',28200,'reference_fee_policy_v1',true);${planCredit ? `INSERT INTO app.synthetic_obligation(id,tenant_id,job_id,activation_id,principal_pence,currency,state,label)VALUES('${obligation}','${T2}','${job}','${activation}',7900,'GBP','owed_unpaid','illustrative_only');INSERT INTO app.simulated_settlement_event(id,tenant_id,job_id,obligation_id,provider_event_id,amount_pence,currency,label,simulated_at)VALUES(gen_random_uuid(),'${T2}','${job}','${obligation}','credit-settlement-${randomUUID()}',7900,'GBP','simulated_not_collected',now());` : ""}INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,state,object_version_id,server_verified_at,expires_at)VALUES('${upload}','${T2}','${job}','synthetic/upload-${job}','${digest.repeat(64)}','application/pdf',1,'standard_evidence','verified','v1',now(),now()+interval '1 hour');INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)VALUES('${evidence}','${T2}','${upload}','${job}','original','synthetic_bank_receipt','synthetic/key-${job}','v1','${digest.repeat(64)}',1,'application/pdf','standard_evidence',now(),now());SET session_replication_role=origin`);
   return { ...second, job, evidence };
  }
  const open = (repo: RecoveryCaseRepository, claimedNetPence: number, w = base) => repo.command(w.ctx, w.job, { version: "recovery-case-command.v1", action: "open", commandId: randomUUID(), caseType: "withheld_customer_payment", claimedNetPence, counterparty: "Synthetic", book: "builder_customer", sourceType: "customer_invoice", sourceRefs: ["Generated customer invoice INV-18800"], expectedRevision: 0 }, w.reviewer);
  const step = (repo: RecoveryCaseRepository, c: { id: string; revision: number }, extra: Record<string, unknown>, w = base) => repo.command(w.ctx, w.job, { version: "recovery-case-command.v1", action: "transition", commandId: randomUUID(), caseId: c.id, expectedRevision: c.revision, ...extra }, w.reviewer);
  // A settled synthetic receipt plus current eligibility and landing approvals for exactly this case revision.
  async function readyToLand(c: { id: string; revision: number }, receiptGross: number, w = base) {
    const receipt = randomUUID(), eligibility = randomUUID(), landing = randomUUID();
    await admin.query("INSERT INTO app.synthetic_recovery_receipt(id,tenant_id,job_id,source_identity,reconciliation_identity,status,gross_pence,currency,synthetic,settled_at)VALUES($1::uuid,$2::uuid,$3::uuid,$1::text,$1::text,'settled',$4,'GBP',true,now())", [receipt, w.tenant, w.job, receiptGross]);
    for (const [id, kind] of [[eligibility, "eligibility"], [landing, "landing"]]) await admin.query("INSERT INTO app.recovery_approval(id,tenant_id,job_id,case_id,kind,expected_case_revision,status,policy_version,expires_at,command_id)VALUES($1,$2,$3,$4,$5,$6,'approved','reference_fee_policy_v1',now()+interval '1 hour',$7)", [id, w.tenant, w.job, c.id, kind, c.revision, randomUUID()]);
    return (gross: number, eligible = gross) => ({ ...payload(c.id, eligibility, landing), jobId: w.job, receiptId: receipt, evidenceId: w.evidence, expectedCaseRevision: c.revision, grossPence: gross, eligibleNetPence: eligible });
  }
  const land = (p: object, w = base) => withTenant(runtime, w.ctx, db => db.$client.query("SELECT app.approve_synthetic_landing($1::jsonb) id", [p]));
  const allocationsAndDerivations = async (caseId: string, w = base) => (await admin.query("SELECT (SELECT count(*) FROM app.landing_allocation WHERE tenant_id=$1 AND case_id=$2)::int allocations,(SELECT count(*) FROM app.recovery_fee_derivation d JOIN app.landing_allocation a ON(a.tenant_id,a.id)=(d.tenant_id,d.source_allocation_id) WHERE d.tenant_id=$1 AND a.case_id=$2)::int derivations,(SELECT count(*) FROM app.recovery_fee_journal j JOIN app.recovery_fee_derivation d ON(d.tenant_id,d.id)=(j.tenant_id,j.derivation_id) JOIN app.landing_allocation a ON(a.tenant_id,a.id)=(d.tenant_id,d.source_allocation_id) WHERE j.tenant_id=$1 AND a.case_id=$2)::int journal", [w.tenant, caseId])).rows[0];
  const reverseApproved = (allocationId: string, amount: number, w = base) => withTenant(runtime, w.ctx, db => db.$client.query("SELECT app.reverse_synthetic_landing($1,$2,$3,$4,$5,$6,$7) id", [w.tenant, randomUUID(), randomUUID(), randomUUID(), allocationId, amount, "Practice receipt reversed"]));
  const viewOf = async (repo: RecoveryCaseRepository, id: string, w = base) => (await repo.list(w.ctx, w.job)).find(x => x.id === id)!;

  it("LATER-SAFETY-17: replays the stored derivation without writes and refuses conflicting reversal identities", async () => {
   const repo = new RecoveryCaseRepository(runtime), port = new PostgresRecoveryOutcomePostingPort(runtime), w = await createWorld(true);
   let c = await open(repo, 400000, w);
   c = await step(repo, c, {eventType:"assemble_evidence"}, w);
   // Each allocation needs its own settled receipt (unique tenant/receipt/case/evidence).
   const first = (await readyToLand(c, 400000, w))(200000); await land(first, w);
   const second = (await readyToLand(c, 400000, w))(200000); await land(second, w);
   const reversal = {version:"recovery.landing.reverse.v1", reversalId:randomUUID(), derivationId:randomUUID(), journalId:randomUUID(), allocationId:first.allocationId, amountPence:200000, reason:"Fictional reversal"};
   const counts = async () => (await admin.query(`SELECT
    (SELECT count(*)::int FROM app.landing_reversal WHERE tenant_id=$1 AND job_id=$2) reversals,
    (SELECT count(*)::int FROM app.recovery_fee_derivation WHERE tenant_id=$1 AND job_id=$2) derivations,
    (SELECT count(*)::int FROM app.recovery_review WHERE tenant_id=$1 AND job_id=$2) reviews,
    (SELECT count(*)::int FROM app.recovery_fee_journal WHERE tenant_id=$1 AND job_id=$2) journals`, [w.tenant,w.job])).rows[0];
   expect(await Promise.all([port.reverseSyntheticLanding(w.ctx,reversal),port.reverseSyntheticLanding(w.ctx,reversal)])).toEqual([reversal.derivationId,reversal.derivationId]);
   const before = await counts();
   expect(before).toEqual({reversals:1,derivations:3,reviews:1,journals:3});
   const retry = {...reversal,derivationId:randomUUID(),journalId:randomUUID()};
   expect(await Promise.all([port.reverseSyntheticLanding(w.ctx,retry),port.reverseSyntheticLanding(w.ctx,retry)])).toEqual([reversal.derivationId,reversal.derivationId]);
   for (const conflict of [{amountPence:1}, {allocationId:second.allocationId}, {reversalId:randomUUID()}]) {
    await expect(port.reverseSyntheticLanding(w.ctx,{...retry,...conflict})).rejects.toMatchObject({code:"23514"});
   }
   // A different job must not turn the ID conflict into a raw primary-key error.
   const other = await createWorld(true);
   let otherCase = await open(repo,100000,other);
   otherCase = await step(repo,otherCase,{eventType:"assemble_evidence"},other);
   const otherLanding = (await readyToLand(otherCase,100000,other))(100000);
   await land(otherLanding,other);
   await expect(port.reverseSyntheticLanding(other.ctx,{...retry,allocationId:otherLanding.allocationId,amountPence:100000})).rejects.toMatchObject({code:"23514"});
   await expect(port.reverseSyntheticLanding(context,retry)).rejects.toMatchObject({code:"23514"});
   await expect(withTenant(runtime,w.ctx,db=>db.$client.query("SELECT app.reverse_synthetic_landing($1,$2,$3,$4,$5,$6,$7)",[T,reversal.reversalId,randomUUID(),randomUUID(),first.allocationId,200000,"Tenant mismatch"]))).rejects.toMatchObject({code:"42501"});
   expect(await counts()).toEqual(before);
   expect((await admin.query("SELECT id FROM app.recovery_fee_derivation WHERE tenant_id=$1 AND source_reversal_id=$2",[w.tenant,reversal.reversalId])).rows).toEqual([{id:reversal.derivationId}]);
  });

  it("LATER-SAFETY-17: selects the v1 cap when a hostile fixture contains another policy snapshot", async () => {
   const repo = new RecoveryCaseRepository(runtime), w = await createWorld(true);
   let c = await open(repo,500000,w);
   c = await step(repo,c,{eventType:"assemble_evidence"},w);
   const approved = (await readyToLand(c,500000,w))(500000);
   await land(approved,w);
   const constraints = async () => (await admin.query("SELECT conname FROM pg_constraint WHERE conrelid='app.cap_snapshot'::regclass ORDER BY conname")).rows;
   const before = await constraints();
   await rolledBack(admin, async db => {
    await db.query("SELECT set_config('app.tenant_id',$1,true)",[w.tenant]);
    // Today's two uniqueness constraints prevent multiple snapshots. Exercise the
    // policy-selection defence in a rollback-only fixture, never a schema migration.
    await db.query("ALTER TABLE app.cap_snapshot DROP CONSTRAINT cap_snapshot_tenant_id_job_id_key, DROP CONSTRAINT cap_snapshot_tenant_id_activation_id_key");
    await db.query("SET LOCAL session_replication_role=replica");
    await db.query("UPDATE app.cap_snapshot SET fee_policy_version='fixture_other_policy',recovery_cap_pence=1 WHERE tenant_id=$1 AND job_id=$2",[w.tenant,w.job]);
    await db.query(`INSERT INTO app.cap_snapshot(id,tenant_id,job_id,activation_id,baseline_quote_version_id,accepted_net_value_pence,currency,recovery_cap_pence,fee_policy_version,illustrative)
     SELECT gen_random_uuid(),tenant_id,job_id,activation_id,baseline_quote_version_id,accepted_net_value_pence,currency,28200,'reference_fee_policy_v1',illustrative FROM app.cap_snapshot WHERE tenant_id=$1 AND job_id=$2`,[w.tenant,w.job]);
    await db.query("SET LOCAL session_replication_role=origin");
    expect((await db.query("SELECT fee_policy_version FROM app.cap_snapshot WHERE tenant_id=$1 AND job_id=$2 ORDER BY fee_policy_version",[w.tenant,w.job])).rows).toEqual([{fee_policy_version:"fixture_other_policy"},{fee_policy_version:"reference_fee_policy_v1"}]);
    await db.query("SET LOCAL ROLE jobguard_runtime");
    const id = randomUUID();
    await db.query("SELECT app.reverse_synthetic_landing($1,$2,$3,$4,$5,$6,$7)",[w.tenant,randomUUID(),id,randomUUID(),approved.allocationId,100000,"Fictional policy cap"]);
    expect((await db.query("SELECT cap_pence,cumulative_landed_pence,capped_fee_pence,liability_pence FROM app.recovery_fee_derivation WHERE tenant_id=$1 AND id=$2",[w.tenant,id])).rows[0]).toEqual({cap_pence:"28200",cumulative_landed_pence:"400000",capped_fee_pence:"28200",liability_pence:"20300"});
   });
   expect(await constraints()).toEqual(before);
  });

  it.each([true, false])("LATER-SAFETY-17: proves the historical defect and preserves cumulative reversals and settled-plan credit (settled=%s)", async (planCredit) => {
   const repo = new RecoveryCaseRepository(runtime), w = await createWorld(planCredit);
   let c = await open(repo,400000,w);
   c = await step(repo,c,{eventType:"assemble_evidence"},w);
   // Each allocation needs its own settled receipt (unique tenant/receipt/case/evidence).
   const first = (await readyToLand(c,400000,w))(200000); await land(first,w);
   const second = (await readyToLand(c,400000,w))(200000); await land(second,w);
   const signature = "app.reverse_synthetic_landing(uuid,uuid,uuid,uuid,uuid,bigint,character varying)";
   const historical = await readFile(new URL("../migrations/0356_unchecked_job_doors.sql",import.meta.url),"utf8");
   const predecessor = "CREATE OR REPLACE FUNCTION app.reverse_synthetic_landing" + historical.split("CREATE OR REPLACE FUNCTION app.reverse_synthetic_landing")[1]!.split("END$$;")[0]! + "END$$;";
   const fixed = (await readFile(new URL("../migrations/0793_synthetic_reversal_money_rules.sql",import.meta.url),"utf8")).split("CREATE OR REPLACE FUNCTION app.reverse_synthetic_landing")[1]!.split("END$$;")[0]!;
   await rolledBack(admin, async db => {
    await db.query("SELECT set_config('app.tenant_id',$1,true)",[w.tenant]);
    const rows = await db.query("SELECT * FROM app.recovery_fee_derivation WHERE tenant_id=$1 AND job_id=$2 ORDER BY id",[w.tenant,w.job]);
    const metadata = async () => (await db.query("SELECT proowner,proacl,prosecdef,proconfig FROM pg_proc WHERE oid=$1::regprocedure",[signature])).rows;
    const before = await metadata();
    const reverseBoth = async () => {
     await db.query("SET LOCAL ROLE jobguard_runtime");
     await db.query("SELECT app.reverse_synthetic_landing($1,$2,$3,$4,$5,$6,$7)",[w.tenant,randomUUID(),randomUUID(),randomUUID(),first.allocationId,100000,"First fictional reversal"]);
     const id = randomUUID();
     await db.query("SELECT app.reverse_synthetic_landing($1,$2,$3,$4,$5,$6,$7)",[w.tenant,randomUUID(),id,randomUUID(),second.allocationId,150000,"Second fictional reversal"]);
     return (await db.query("SELECT cumulative_landed_pence,capped_fee_pence,liability_pence,posting_delta_pence FROM app.recovery_fee_derivation WHERE tenant_id=$1 AND id=$2",[w.tenant,id])).rows[0];
    };
    await db.query("SAVEPOINT predecessor_control");
    await db.query(predecessor);
    const old = await reverseBoth();
    expect(old).toMatchObject({cumulative_landed_pence:"250000",capped_fee_pence:"25000",liability_pence:"17100"});
    expect(old.cumulative_landed_pence).not.toBe("150000");
    await db.query("ROLLBACK TO SAVEPOINT predecessor_control");
    // Own-step replacement over populated v1 facts: the same signature retains
    // privileges, owner and all earlier derivations, without running a down migration.
    await db.query("CREATE OR REPLACE FUNCTION app.reverse_synthetic_landing" + fixed + "END$$;");
    expect(await metadata()).toEqual(before);
    expect((await db.query("SELECT * FROM app.recovery_fee_derivation WHERE tenant_id=$1 AND job_id=$2 ORDER BY id",[w.tenant,w.job])).rows).toEqual(rows.rows);
    expect(await reverseBoth()).toEqual({cumulative_landed_pence:"150000",capped_fee_pence:"15000",liability_pence:planCredit ? "7100" : "15000",posting_delta_pence:"-13200"});
   });
  });

  it("repair 17: delayed original, below-settled retry, approved reversal and late execution keep the browser attempt unknown until replay", async () => {
   const repo = new RecoveryCaseRepository(runtime), w = await createWorld(false);
   let c = await open(repo, 250000, w);
   c = await step(repo, c, {eventType:"assemble_evidence"}, w);
   const body = {version:"recovery-case-command.v1",action:"amend_claim",commandId:randomUUID(),caseId:c.id,expectedRevision:c.revision,claimedNetPence:90000};
   let release!:()=>void, started!:()=>void;
   const gate = new Promise<void>(resolve=>{release=resolve}), entered = new Promise<void>(resolve=>{started=resolve});
   // Only the original's connection is gated, before its transaction. All queries,
   // runtime permissions, replay lookups, posting routines and commits are real PG.
   const delayedPool = new Proxy(runtime,{get(target,key){
    if(key==="connect")return async()=>{started();await gate;return target.connect()};
    const value=Reflect.get(target,key);return typeof value==="function"?value.bind(target):value;
   }});
   const original = new RecoveryCaseRepository(delayedPool).command(w.ctx,w.job,body,w.reviewer);
   const late = original.then(value=>({value}),error=>({error}));
   try {
    await entered;
    const approved = (await readyToLand(c,100000,w))(100000);
    await land(approved,w);
    expect(await viewOf(repo,c.id,w)).toMatchObject({revision:c.revision,claimedNetPence:250000,approvedLandedNetPence:100000});
    const failure = await repo.command(w.ctx,w.job,body,w.reviewer).then(()=>{throw new Error("Expected below-settled refusal")},error=>error as Error & {code:string});
    expect(failure.code).toBe("RECOVERY_CLAIM_BELOW_SETTLED");
    const retry = {status:400,body:{code:failure.code}};
    expect(recoveryCommandRefusalV1.parse(retry)).toEqual(retry);
    expect(recoveryCommandRefusalRulesV1["RECOVERY_CLAIM_BELOW_SETTLED"].settlesUnknown).toBe(false);
    expect((await admin.query("SELECT count(*)::int n FROM app.recovery_case_event WHERE tenant_id=$1 AND command_id=$2",[w.tenant,body.commandId])).rows[0].n).toBe(0);
    await reverseApproved(approved.allocationId,100000,w);
    expect(await viewOf(repo,c.id,w)).toMatchObject({revision:c.revision,claimedNetPence:250000,approvedLandedNetPence:0,landedNetPence:0});
    release();
    const result = await late;
    expect(result).not.toHaveProperty("error");
    if(!("value" in result))throw result.error;
    expect(result.value).toMatchObject({id:c.id,claimedNetPence:90000,revision:c.revision+2});
    // The old retry refusal still cannot settle the attempt after the original commits.
    expect(recoveryCommandRefusalV1.parse(retry)).toEqual(retry);
    expect(recoveryCommandRefusalRulesV1["RECOVERY_CLAIM_BELOW_SETTLED"].settlesUnknown).toBe(false);
    const replay = await repo.command(w.ctx,w.job,body,w.reviewer);
    expect(replay).toEqual(result.value);
    expect(recoveryCaseCommandResponseV1.parse({version:"recovery-case-workbench.v1",environment:"synthetic_demo",realExternalActions:0,affectedCaseId:c.id,cases:[replay]})).toMatchObject({affectedCaseId:c.id,cases:[{claimedNetPence:90000}]});
    expect((await admin.query("SELECT count(*)::int n FROM app.recovery_case_event WHERE tenant_id=$1 AND command_id=$2",[w.tenant,body.commandId])).rows[0].n).toBe(1);
    expect((await admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='recovery.amend_claim'",[w.tenant,c.id])).rows[0].n).toBe(1);
   } finally {release();await late}
  });

  it("shows a computed per-case fee; eligibility approval creates neither a landing nor a fee, and an approved landing does (Sol P2, Opus P1 fee label)", async () => {
   const repo = new RecoveryCaseRepository(runtime);
   let c = await open(repo, 100000);
   c = await step(repo, c, { eventType: "assemble_evidence" });
   await repo.eligibilityCommand(context, J, { version: "recovery-eligibility-command.v1", action: "review", commandId: randomUUID(), caseId: c.id, scenario: "evidence_backed_withheld_payment", expectedCaseRevision: c.revision, evidenceRevision: 1, policyVersion: "reference-d03.v1", policyRevision: 1 }, owner);
   const reviewed = (await repo.list(context, J)).find(x => x.id === c.id)!.eligibility!;
   await repo.eligibilityCommand(context, J, { version: "recovery-eligibility-command.v1", action: "approve", commandId: randomUUID(), caseId: c.id, expectedCaseRevision: c.revision, expectedEvidenceRevision: reviewed.evidenceRevision, expectedPolicyRevision: 1, expectedReviewRevision: reviewed.revision }, owner);
   let view = (await repo.list(context, J)).find(x => x.id === c.id)!;
   expect(view.eligibility?.status).toBe("approved");
   expect(view).toMatchObject({ landedNetPence: 0, feeObligationsPostedPence: 0, feeCompensationsPostedPence: 0 });
   expect(await allocationsAndDerivations(c.id)).toEqual({ allocations: 0, derivations: 0, journal: 0 });
   const p = await readyToLand(c, 100000), landing = p(50000);
   expect((await land(landing)).rows[0].id).toBeTruthy();
   view = (await repo.list(context, J)).find(x => x.id === c.id)!;
   const posted = Number((await admin.query("SELECT posting_delta_pence FROM app.recovery_fee_derivation WHERE tenant_id=$1 AND source_allocation_id=$2", [T, landing.allocationId])).rows[0].posting_delta_pence);
   expect(posted).toBeGreaterThan(0);
   const jobLiability = Number((await admin.query("SELECT COALESCE(sum(CASE kind WHEN 'fee_obligation' THEN amount_pence ELSE -amount_pence END),0) liability FROM app.recovery_fee_journal WHERE tenant_id=$1 AND job_id=$2", [T, J])).rows[0].liability);
   expect(view.feeObligationsPostedPence).toBe(posted);
   expect(view.feeCompensationsPostedPence).toBe(0);
   expect(view.feeJobLiabilityPence).toBe(jobLiability); // job-level: shared cap and plan credit, not attributed to one case
   expect(await allocationsAndDerivations(c.id)).toEqual({ allocations: 1, derivations: 1, journal: 1 });
  });


  it("repair 15: overlapping manual receipt and its reversal keep approved full principal and replay-safe received state", async () => {
   const repo = new RecoveryCaseRepository(runtime), w = await createWorld(true);
   let c = await open(repo,250000,w);
   c = await step(repo,c,{eventType:"assemble_evidence"},w);
   const approval = (await readyToLand(c,250000,w))(250000);
   await land(approval,w);
   expect(await viewOf(repo,c.id,w)).toMatchObject({state:"evidence_assembled",approvedLandedNetPence:250000,landedNetPence:250000,outstandingNetPence:0});
   const record = {version:"recovery-case-command.v1",action:"transition",commandId:randomUUID(),caseId:c.id,eventType:"record_landing",amountPence:100000,expectedRevision:c.revision};
   c = await repo.command(w.ctx,w.job,record,w.reviewer);
   expect(c).toMatchObject({state:"landed",landedNetPence:250000,approvedLandedNetPence:250000,outstandingNetPence:0});
   expect((await repo.command(w.ctx,w.job,record,w.reviewer)).revision).toBe(c.revision);
   c = await step(repo,c,{eventType:"close_recovered"},w);
   await expect(step(repo,c,{eventType:"reverse_landing",amountPence:100001},w)).rejects.toThrow(/is not allowed/);
   const reverse = {...record,commandId:randomUUID(),eventType:"reverse_landing",expectedRevision:c.revision};
   c = await repo.command(w.ctx,w.job,reverse,w.reviewer);
   expect(c).toMatchObject({state:"landed",landedNetPence:250000,approvedLandedNetPence:250000,outstandingNetPence:0});
   expect((await repo.command(w.ctx,w.job,reverse,w.reviewer)).revision).toBe(c.revision);
   expect((await admin.query("SELECT manual_landed,approved_landed,landed,state FROM app.recovery_case_current WHERE id=$1",[c.id])).rows).toEqual([{manual_landed:"0",approved_landed:"250000",landed:"250000",state:"landed"}]);
   expect((await admin.query("SELECT event_type,to_state FROM app.recovery_case_event WHERE case_id=$1 AND event_type IN('record_landing','reverse_landing') ORDER BY sequence",[c.id])).rows).toEqual([{event_type:"record_landing",to_state:"landed"},{event_type:"reverse_landing",to_state:"landed"}]);
   await expect(step(repo,c,{eventType:"reverse_landing",amountPence:1},w)).rejects.toThrow(/is not allowed/);
   expect(await step(repo,c,{eventType:"close_recovered"},w)).toMatchObject({state:"closed_recovered",outstandingNetPence:0});
  });

  it("reconciles approved landings and their reversals with the case accounting exactly once, without double counting manual records (Sol P2)", async () => {
   const repo = new RecoveryCaseRepository(runtime), w = await createWorld(true);
   let c = await open(repo, 250000, w);
   c = await step(repo, c, { eventType: "assemble_evidence" }, w);
   const approved = (await readyToLand(c, 300000, w))(100000);
   await land(approved, w);
   // The approved landing is received principal; the fee and the money agree (100,000 earns a 10,000 fee, 7,900 offset by plan credit).
   let v = await viewOf(repo, c.id, w);
   expect(v).toMatchObject({ landedNetPence: 100000, approvedLandedNetPence: 100000, outstandingNetPence: 150000, writtenOffPence: 0, feeJobLiabilityPence: 2100, feeObligationsPostedPence: 2100, feeCompensationsPostedPence: 0 });
   // Recording the same 600.00 by hand does not count it twice; more than the approved amount raises the total to the larger figure.
   c = await step(repo, c, { eventType: "record_landing", amountPence: 60000 }, w);
   expect(await viewOf(repo, c.id, w)).toMatchObject({ landedNetPence: 100000, outstandingNetPence: 150000 });
   c = await step(repo, c, { eventType: "record_landing", amountPence: 60000 }, w);
   expect(await viewOf(repo, c.id, w)).toMatchObject({ landedNetPence: 120000, approvedLandedNetPence: 100000, outstandingNetPence: 130000 });
   // A claim can not be amended below the received principal; a write-off covers only what is still outstanding.
   await expect(repo.command(w.ctx, w.job, { version: "recovery-case-command.v1", action: "amend_claim", commandId: randomUUID(), caseId: c.id, claimedNetPence: 119999, expectedRevision: c.revision }, w.reviewer)).rejects.toThrow("RECOVERY_CLAIM_BELOW_SETTLED");
   c = await step(repo, c, { eventType: "write_off" }, w);
   expect(await viewOf(repo, c.id, w)).toMatchObject({ state: "closed_no_recovery", landedNetPence: 120000, writtenOffPence: 130000, outstandingNetPence: 0 });
   // Reversing the approved landing removes only the approved principal and its fee; the manual 1,200.00 record stands.
   await reverseApproved(approved.allocationId, 100000, w);
   v = await viewOf(repo, c.id, w);
   expect(v).toMatchObject({ landedNetPence: 120000, approvedLandedNetPence: 0, feeJobLiabilityPence: 0, feeObligationsPostedPence: 2100, feeCompensationsPostedPence: 2100, writtenOffPence: 130000, outstandingNetPence: 0 });
   // The workbench can reverse only its own manual records, never more than they hold.
   await expect(step(repo, c, { eventType: "reverse_landing", amountPence: 120001 }, w)).rejects.toThrow(/is not allowed/);
   c = await step(repo, c, { eventType: "reverse_landing", amountPence: 120000 }, w);
   v = await viewOf(repo, c.id, w);
   expect(v).toMatchObject({ landedNetPence: 0, writtenOffPence: 130000, outstandingNetPence: 120000 });
   expect(v.landedNetPence + v.writtenOffPence + v.outstandingNetPence).toBe(v.claimedNetPence);
  });

  it("does not let the workbench reverse a landing that exists only as an approved allocation, and keeps the legacy landing path unchanged (Sol P2)", async () => {
   const repo = new RecoveryCaseRepository(runtime);
   let c = await open(repo, 100000);
   c = await step(repo, c, { eventType: "assemble_evidence" });
   await land((await readyToLand(c, 100000))(50000));
   expect(await viewOf(repo, c.id)).toMatchObject({ landedNetPence: 50000, approvedLandedNetPence: 50000, outstandingNetPence: 50000 });
   await expect(step(repo, c, { eventType: "reverse_landing", amountPence: 100 })).rejects.toThrow(/is not allowed/);
   // A legacy case with no workbench history is still read from its own row by the routine.
   const legacy = (await admin.query("SELECT state,claim_pence,revision FROM app.recovery_case_current WHERE id=$1", [C1])).rows[0];
   expect(legacy).toMatchObject({ claim_pence: "100", revision: 0 });
  });

  it("describes an approved landing whose fee is fully offset by plan credit as approved with a zero fee (Sol P3)", async () => {
   const repo = new RecoveryCaseRepository(runtime), w = await createWorld(true);
   let c = await open(repo, 100000, w);
   c = await step(repo, c, { eventType: "assemble_evidence" }, w);
   const landing = (await readyToLand(c, 100000, w))(5000);
   await land(landing, w);
   const derivation = (await admin.query("SELECT capped_fee_pence,credit_used_pence,liability_pence,posting_delta_pence FROM app.recovery_fee_derivation WHERE tenant_id=$1 AND source_allocation_id=$2", [w.tenant, landing.allocationId])).rows[0];
   expect(derivation).toEqual({ capped_fee_pence: "500", credit_used_pence: "500", liability_pence: "0", posting_delta_pence: "0" });
   // A qualifying landing exists, yet no fee is posted: the view must say so, not "no approved landing".
   const v = await viewOf(repo, c.id, w);
   expect(v).toMatchObject({ approvedLandedNetPence: 5000, feeJobLiabilityPence: 0, feeObligationsPostedPence: 0, feeCompensationsPostedPence: 0, landedNetPence: 5000 });
   expect((await allocationsAndDerivations(c.id, w)).allocations).toBe(1);
  });

  it("keeps the job's current fee liability apart from signed per-case postings: approve A, approve B, reverse A (Sol P2)", async () => {
   const repo = new RecoveryCaseRepository(runtime), w = await createWorld(true);
   const prepare = async () => { let c = await open(repo, 250000, w); c = await step(repo, c, { eventType: "assemble_evidence" }, w); return c; };
   const a = await prepare(), b = await prepare();
   const landingA = (await readyToLand(a, 300000, w))(100000), landingB = (await readyToLand(b, 300000, w))(100000);
   await land(landingA, w); await land(landingB, w);
   await reverseApproved(landingA.allocationId, 100000, w);
   // Job level: 200,000 landed then A reversed leaves 100,000 landed = 10,000 fee less the 7,900 plan credit = 2,100 owed.
   const [viewA, viewB] = [await viewOf(repo, a.id, w), await viewOf(repo, b.id, w)];
   expect(viewA.feeJobLiabilityPence).toBe(2100);
   expect(viewB.feeJobLiabilityPence).toBe(2100);
   // Per-case postings are reported separately and honestly: A's own obligation and the job-level compensation its reversal triggered.
   expect(viewA).toMatchObject({ approvedLandedNetPence: 0, feeObligationsPostedPence: 2100, feeCompensationsPostedPence: 10000 });
   expect(viewB).toMatchObject({ approvedLandedNetPence: 100000, feeObligationsPostedPence: 10000, feeCompensationsPostedPence: 0 });
   const journal = Number((await admin.query("SELECT COALESCE(sum(CASE kind WHEN 'fee_obligation' THEN amount_pence ELSE -amount_pence END),0) n FROM app.recovery_fee_journal WHERE tenant_id=$1 AND job_id=$2", [w.tenant, w.job])).rows[0].n);
   expect(journal).toBe(2100);
  });

  it("restores claim capacity when an approved landing is reversed, with write-off history: a fresh receipt may land again (Sol P2)", async () => {
   const repo = new RecoveryCaseRepository(runtime), w = await createWorld(true);
   const writtenOffCase = async (approvedAmount: number) => {
    let c = await open(repo, 250000, w);
    c = await step(repo, c, { eventType: "assemble_evidence" }, w);
    c = await step(repo, c, { eventType: "start_pursuit" }, w);
    const approved = (await readyToLand(c, 300000, w))(approvedAmount);
    await land(approved, w);
    c = await step(repo, c, { eventType: "write_off" }, w);
    return { c, approved };
   };
   // Full reversal: 250,000 claim, 100,000 approved, 150,000 written off, 100,000 approved principal reversed -> 100,000 recoverable again.
   let { c, approved } = await writtenOffCase(100000);
   await reverseApproved(approved.allocationId, 100000, w);
   expect(await viewOf(repo, c.id, w)).toMatchObject({ approvedLandedNetPence: 0, writtenOffPence: 150000, outstandingNetPence: 100000 });
   const fresh = await readyToLand(c, 300000, w);
   await expect(land(fresh(100001), w)).rejects.toThrow("allocation exceeds available receipt or claim");
   await land(fresh(100000), w);
   expect(await viewOf(repo, c.id, w)).toMatchObject({ approvedLandedNetPence: 100000, landedNetPence: 100000, outstandingNetPence: 0 });
   // Partial reversal: 40,000 of a 100,000 approval reversed -> exactly 40,000 of capacity returns.
   ({ c, approved } = await writtenOffCase(100000));
   await reverseApproved(approved.allocationId, 40000, w);
   expect(await viewOf(repo, c.id, w)).toMatchObject({ approvedLandedNetPence: 60000, writtenOffPence: 150000, outstandingNetPence: 40000 });
   const partial = await readyToLand(c, 300000, w);
   await expect(land(partial(40001), w)).rejects.toThrow("allocation exceeds available receipt or claim");
   await land(partial(40000), w);
   expect(await viewOf(repo, c.id, w)).toMatchObject({ approvedLandedNetPence: 100000, outstandingNetPence: 0 });
  });

  it("refuses to relabel received money as 'Prevented before payment', and leaves case, allocations, journal and audit untouched (Sol P2)", async () => {
   const repo = new RecoveryCaseRepository(runtime), w = await createWorld(true);
   // The landing routine accepts a landing while the workbench stage is still "identified"; prevention must not then erase it.
   const c = await open(repo, 250000, w);
   expect(c.state).toBe("identified");
   const approved = (await readyToLand(c, 300000, w))(100000);
   await land(approved, w);
   const snapshot = async () => ({
    view: await viewOf(repo, c.id, w),
    parts: await allocationsAndDerivations(c.id, w),
    events: Number((await admin.query("SELECT count(*) n FROM app.recovery_case_event WHERE tenant_id=$1 AND case_id=$2", [w.tenant, c.id])).rows[0].n),
    audit: Number((await admin.query("SELECT count(*) n FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2", [w.tenant, c.id])).rows[0].n),
    journal: Number((await admin.query("SELECT count(*) n FROM app.recovery_fee_journal WHERE tenant_id=$1 AND job_id=$2", [w.tenant, w.job])).rows[0].n),
   });
   const before = await snapshot();
   expect(before.view).toMatchObject({ state: "identified", landedNetPence: 100000, approvedLandedNetPence: 100000 });
   await expect(step(repo, c, { eventType: "prevent" }, w)).rejects.toThrow(/is not allowed/);
   expect(await snapshot()).toEqual(before);
   // Once the approved landing is reversed nothing remains received, so prevention is legitimate again.
   await reverseApproved(approved.allocationId, 100000, w);
   const prevented = await step(repo, c, { eventType: "prevent" }, w);
   expect(prevented).toMatchObject({ state: "prevented", landedNetPence: 0 });
  });

  it("refuses to allocate principal the workbench has written off (Sol P2: SQL landing path)", async () => {
   const repo = new RecoveryCaseRepository(runtime);
   let c = await open(repo, 250000);
   c = await step(repo, c, { eventType: "assemble_evidence" });
   c = await step(repo, c, { eventType: "record_landing", amountPence: 100000 });
   c = await step(repo, c, { eventType: "write_off" });
   expect(c).toMatchObject({ state: "closed_no_recovery", landedNetPence: 100000, writtenOffPence: 150000 });
   const p = await readyToLand(c, 300000);
   // Only 100,000 of principal remains recoverable (250,000 claimed - 150,000 written off).
   await expect(land(p(100001))).rejects.toThrow("allocation exceeds available receipt or claim");
   await withTenant(runtime, context, async db => {
    await db.$client.query("SAVEPOINT within_remaining");
    expect((await db.$client.query("SELECT app.approve_synthetic_landing($1::jsonb) id", [p(100000)])).rows[0].id).toBeTruthy();
    await db.$client.query("ROLLBACK TO SAVEPOINT within_remaining");
   });
   // Writing off everything leaves nothing to allocate at all.
   let all = await open(repo, 250000);
   all = await step(repo, all, { eventType: "assemble_evidence" });
   all = await step(repo, all, { eventType: "start_pursuit" });
   all = await step(repo, all, { eventType: "write_off" });
   expect(all).toMatchObject({ writtenOffPence: 250000, outstandingNetPence: 0 });
   const q = await readyToLand(all, 300000);
   await expect(land(q(1))).rejects.toThrow("allocation exceeds available receipt or claim");
   expect(await allocationsAndDerivations(all.id)).toEqual({ allocations: 0, derivations: 0, journal: 0 });
  });

  it("never deadlocks a landing against concurrent workbench writes on the same case (Opus P3)", async () => {
   const repo = new RecoveryCaseRepository(runtime);
   const rounds = await Promise.all(Array.from({ length: 6 }, async () => {
    let c = await open(repo, 100000);
    c = await step(repo, c, { eventType: "assemble_evidence" });
    const p = await readyToLand(c, 1000);
    const outcomes = await Promise.allSettled([land(p(10)), step(repo, c, { eventType: "record_landing", amountPence: 5 }), step(repo, c, { eventType: "dispute" })]);
    return { caseId: c.id, outcomes };
   }));
   for (const { caseId, outcomes } of rounds) {
    for (const outcome of outcomes) if (outcome.status === "rejected") {
     const failure = outcome.reason as { code?: string; message?: string };
     expect(failure.code).not.toBe("40P01");
     expect(failure.code).not.toBe("55P03");
     expect(String(failure.message)).not.toMatch(/deadlock/iu);
     expect(String(failure.message)).toMatch(/RECOVERY_STALE_REVISION|current landing approval required|current eligibility approval required|eligible current synthetic case required|is not allowed/u);
    }
    const final = (await repo.list(context, J)).find(x => x.id === caseId)!;
    expect(final.landedNetPence + final.writtenOffPence + final.outstandingNetPence).toBe(final.claimedNetPence);
    expect((await allocationsAndDerivations(caseId)).allocations).toBe(outcomes[0].status === "fulfilled" ? 1 : 0);
   }
  });
 });
 it("rejects incomplete proof, pending cash, prevented cases, and stale approval in PostgreSQL",async()=>{for(const statement of [`UPDATE app.synthetic_recovery_receipt SET status='pending',settled_at=NULL WHERE id='${R}'`,`UPDATE app.recovery_case SET state='prevented' WHERE id='${C2}'`,`UPDATE app.recovery_approval SET expires_at=now()-interval '1 second' WHERE id='${EA2}'`]){await admin.query(`SET session_replication_role=replica;${statement};SET session_replication_role=origin`);await expect(withTenant(runtime,context,db=>db.$client.query(`SELECT app.approve_synthetic_landing($1::jsonb)`,[payload(C2,EA2,LA2)]))).rejects.toBeTruthy();}await admin.query(`SELECT set_config('app.tenant_id','${T}',false);SET session_replication_role=replica;INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code)VALUES(gen_random_uuid(),'${T}','${E}',gen_random_uuid(),'verification_invalid');SET session_replication_role=origin`);expect((await admin.query(`SELECT reason FROM app.recovery_review WHERE tenant_id=$1`,[T])).rows).toEqual([{reason:"evidence_invalidated"}]);});
});
