import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { withTenant } from "../src/tenant-context.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

// Owner-only fictional legacy records: never seed authoritative money effects.
export async function legacyRecoveryFixture(admin: Pool, runtime: Pool) {
  const LEGACY_TENANT = randomUUID();
  const LEGACY_CONTEXT = testTenantContext(LEGACY_TENANT);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [LEGACY_TENANT]);
  async function world(planCredit: boolean) {
    const job = randomUUID(), evidence = randomUUID(), upload = randomUUID(), activation = randomUUID(), obligation = randomUUID(), digest = planCredit ? "d" : "e";
    await admin.query(`SET session_replication_role=replica;
INSERT INTO app.job(id,tenant_id,title,status,revision)VALUES('${job}','${LEGACY_TENANT}','Legacy recovery','live',1);
INSERT INTO app.job_activation(id,tenant_id,job_id,accepted_document_id,accepted_document_version,accepted_document_hash,mode,activation_terms_version,fee_policy_version,actor_membership_id,activated_at)VALUES('${activation}','${LEGACY_TENANT}','${job}',gen_random_uuid(),1,'${"a".repeat(64)}','synthetic_demo','synthetic_demo_illustrative.v1','reference_fee_policy_v1',gen_random_uuid(),now());
INSERT INTO app.cap_snapshot(id,tenant_id,job_id,activation_id,baseline_quote_version_id,accepted_net_value_pence,currency,recovery_cap_pence,fee_policy_version,illustrative)VALUES(gen_random_uuid(),'${LEGACY_TENANT}','${job}','${activation}',gen_random_uuid(),1880000,'GBP',28200,'reference_fee_policy_v1',true);${planCredit ? `INSERT INTO app.synthetic_obligation(id,tenant_id,job_id,activation_id,principal_pence,currency,state,label)VALUES('${obligation}','${LEGACY_TENANT}','${job}','${activation}',7900,'GBP','owed_unpaid','illustrative_only');
INSERT INTO app.simulated_settlement_event(id,tenant_id,job_id,obligation_id,provider_event_id,amount_pence,currency,label,simulated_at)VALUES(gen_random_uuid(),'${LEGACY_TENANT}','${job}','${obligation}','credit-settlement-${randomUUID()}',7900,'GBP','simulated_not_collected',now());` : ""}INSERT INTO app.evidence_upload(id,tenant_id,job_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,state,object_version_id,server_verified_at,expires_at)VALUES('${upload}','${LEGACY_TENANT}','${job}','synthetic/upload-${job}','${digest.repeat(64)}','application/pdf',1,'standard_evidence','verified','v1',now(),now()+interval '1 hour');
INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at)VALUES('${evidence}','${LEGACY_TENANT}','${upload}','${job}','original','synthetic_bank_receipt','synthetic/key-${job}','v1','${digest.repeat(64)}',1,'application/pdf','standard_evidence',now(),now());
SET session_replication_role=origin`);
    const caseId = randomUUID(), eligibility = randomUUID(), landing = randomUUID();
    return { tenant: LEGACY_TENANT, job, evidence, caseId, eligibility, landing, claim: 0 };
  }
  type World = Awaited<ReturnType<typeof world>>;
  async function openCase(w: World, claim: number) {
    await admin.query(`SET session_replication_role=replica;
INSERT INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic)VALUES('${w.caseId}','${LEGACY_TENANT}','${w.job}',${claim},'GBP','active',0,true);
SET session_replication_role=origin`);
    for (const [id, kind] of [[w.eligibility, "eligibility"], [w.landing, "landing"]])
      await admin.query("INSERT INTO app.recovery_approval(id,tenant_id,job_id,case_id,kind,expected_case_revision,status,policy_version,expires_at,command_id)VALUES($1,$2,$3,$4,$5,0,'approved','reference_fee_policy_v1',now()+interval '1 hour',$6)", [id, LEGACY_TENANT, w.job, w.caseId, kind, randomUUID()]);
  }
  async function receipt(w: World, gross: number) {
    const id = randomUUID();
    await admin.query("INSERT INTO app.synthetic_recovery_receipt(id,tenant_id,job_id,source_identity,reconciliation_identity,status,gross_pence,currency,synthetic,settled_at)VALUES($1::uuid,$2::uuid,$3::uuid,$1::text,$1::text,'settled',$4,'GBP',true,now())", [id, LEGACY_TENANT, w.job, gross]);
    return id;
  }
  const payload = (w: World, receiptId: string, gross: number, eligible: number) => ({ version: "recovery.landing.approve.v1", allocationId: randomUUID(), derivationId: randomUUID(), journalId: randomUUID(),
    jobId: w.job, caseId: w.caseId, receiptId, evidenceId: w.evidence, eligibilityApprovalId: w.eligibility, landingApprovalId: w.landing, grossPence: gross, eligibleNetPence: eligible, currency: "GBP", policyVersion: "reference_fee_policy_v1", expectedCaseRevision: 0 });
  const land = (p: object) => withTenant(runtime, LEGACY_CONTEXT, db => db.$client.query("SELECT app.approve_synthetic_landing($1::jsonb) id", [p]));
  const reverse = (allocationId: string, amount: number) => withTenant(runtime, LEGACY_CONTEXT, db => db.$client.query("SELECT app.reverse_synthetic_landing($1,$2,$3,$4,$5,$6,$7) id", [LEGACY_TENANT, randomUUID(), randomUUID(), randomUUID(), allocationId, amount, "Practice receipt reversed"]));
  const derivations = async (job: string) => (await admin.query("SELECT cumulative_landed_pence::int landed,credit_used_pence::int credit,liability_pence::int liability,posting_delta_pence::int delta FROM app.recovery_fee_derivation WHERE tenant_id=$1 AND job_id=$2 ORDER BY created_at,id", [LEGACY_TENANT, job])).rows;
  const journal = async (job: string) => (await admin.query("SELECT kind,amount_pence::int amount FROM app.recovery_fee_journal WHERE tenant_id=$1 AND job_id=$2 ORDER BY created_at,id", [LEGACY_TENANT, job])).rows;
  const net = (rows: Array<{ kind: string; amount: number }>) => rows.reduce((total, row) => total + (row.kind === "fee_obligation" ? row.amount : -row.amount), 0);
  const counts = async (job: string) => (await admin.query(`SELECT (SELECT count(*) FROM app.landing_allocation WHERE tenant_id=$1 AND job_id=$2)::int allocations,
    (SELECT count(*) FROM app.recovery_fee_derivation WHERE tenant_id=$1 AND job_id=$2)::int derivations,(SELECT count(*) FROM app.recovery_fee_journal WHERE tenant_id=$1 AND job_id=$2)::int journals`, [LEGACY_TENANT, job])).rows[0]!;

  return { world, openCase, receipt, payload, land, reverse, derivations, journal, net, counts };
}
