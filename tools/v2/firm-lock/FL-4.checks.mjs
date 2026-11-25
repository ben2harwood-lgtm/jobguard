// Q38 / V2-FL-4, migration 2050. Registered by the full V2 seed suite's FL-1 loader.
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { registerFirmChecks } from "./checks-lib.mjs";
import { firmLockCatalog, lockProblems } from "./guard.mjs";
import { permitPracticeHomeJob } from "../../../packages/db/test/lp-practice-home-job-fixture.ts";

const job = name => [`app.${name}`, "job_id"];
export const families = {
  "case history and eligibility": ["recovery_case", "recovery_case_event", "recovery_claim_revision",
    "recovery_approval", "recovery_case_terms_approval", "recovery_demo_selection", "recovery_eligibility_revision",
    "recovery_eligibility_v3_review", "recovery_claim_line"].map(job),
  "allocations, attribution and fee history": ["recovery_allocation_command", "recovery_allocation_line_source",
    "recovery_allocation_review", "recovery_case_allocation", "recovery_case_allocation_reversal",
    "recovery_attribution_command", "recovery_attribution_reassessment", "recovery_attribution_revision",
    "recovery_payment_payer_mark", "recovery_fee_derivation", "recovery_fee_journal", "recovery_review"].map(job),
  "managed recovery": ["managed_recovery_election", "managed_recovery_pursuit"].map(job),
  "correspondence and follow-up": ["recovery_message", "recovery_message_approval", "recovery_message_event",
    "recovery_message_sink", "recovery_follow_up", "recovery_follow_up_due", "recovery_follow_up_event",
    "recovery_follow_up_reminder", "recovery_timeline_run"].map(job).concat([
    ["app.recovery_follow_up_advance", "follow_up_id"], ["app.recovery_follow_up_owner", "follow_up_id"],
    ["app.recovery_timeline_signal", "follow_up_id"],
  ]),
};
const tables = Object.values(families).flat().map(([table]) => table);
const hash = "4".repeat(64);

// fixture: recovery workbench/allocation/message commands have no V2 route (the
// allocation writer is also fenced to jobguard_synthetic_demo). Owner setup only;
// every read below uses the actual runtime login and authenticated practice binding.
async function seedFamilyRows(client, { tenantId, jobId, actor }) {
  const caseId = randomUUID();
  await client.query(`INSERT INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,synthetic)
    VALUES($1,$2,$3,32000,'GBP','identified',true)`, [caseId, tenantId, jobId]);
  await client.query(`INSERT INTO app.recovery_claim_revision
    (id,tenant_id,job_id,case_id,revision,claimed_net_pence,currency,reviewer_ref,subject_hash)
    VALUES($1,$2,$3,$4,1,32000,'GBP','FL-4 fixture',$5)`, [randomUUID(), tenantId, jobId, caseId, hash]);
  await client.query(`INSERT INTO app.recovery_case_event
    (id,tenant_id,job_id,case_id,sequence,event_type,to_state,reviewer_ref,command_id,payload_hash)
    VALUES($1,$2,$3,$4,1,'opened','identified','FL-4 fixture',$5,$6)`,
  [randomUUID(), tenantId, jobId, caseId, randomUUID(), hash]);
  await client.query(`INSERT INTO app.recovery_approval
    (id,tenant_id,job_id,case_id,kind,expected_case_revision,status,policy_version,expires_at,command_id)
    VALUES($1,$2,$3,$4,'eligibility',2,'approved','reference_fee_policy_v1',clock_timestamp()+interval '1 hour',$5)`,
  [randomUUID(), tenantId, jobId, caseId, randomUUID()]);
  await client.query(`INSERT INTO app.recovery_demo_selection(tenant_id,job_id,command_id,scenario,case_id)
    VALUES($1,$2,$3,'missing_evidence',$4)`, [tenantId, jobId, randomUUID(), caseId]);
  await client.query(`INSERT INTO app.recovery_eligibility_revision
    (id,tenant_id,job_id,case_id,revision,case_revision,evidence_revision,policy_version,policy_revision,
     scenario,classification,currency,reason,citations,status,reviewer_ref,command_id,subject_hash)
    VALUES($1,$2,$3,$4,1,2,1,'reference-d03.v1',1,'FL-4 fixture','pending_review','GBP',
      'Synthetic row visibility only','[]','reviewed','FL-4 fixture',$5,$6)`,
  [randomUUID(), tenantId, jobId, caseId, randomUUID(), hash]);
  await client.query(`INSERT INTO app.recovery_allocation_command
    (command_id,tenant_id,job_id,case_id,actor_membership_id,payload,payload_hash,artifact,result)
    VALUES($1,$2,$3,$4,$5,'{}',$6,'{}','{}')`, [randomUUID(), tenantId, jobId, caseId, actor, hash]);
  await client.query(`INSERT INTO app.recovery_review(id,tenant_id,job_id,reason)
    VALUES($1,$2,$3,'evidence_invalidated')`, [randomUUID(), tenantId, jobId]);
  await client.query(`INSERT INTO app.managed_recovery_pursuit(tenant_id,job_id,case_id)
    VALUES($1,$2,$3)`, [tenantId, jobId, caseId]);
  await seedMessageRows(client, { tenantId, jobId, caseId, actor });
  return { tenantId, jobId, caseId };
}

async function seedMessageRows(client, { tenantId, jobId, caseId, actor }) {
  // fixture: the V2 packet has no evidence-pack or recovery-message route.
  // Retain the real canonical-content and case-snapshot INSERT guards; no trigger
  // is disabled and no outbound work, authorization or delivery is created.
  const packId = randomUUID(), attachment = randomUUID(), messageId = randomUUID(), command = randomUUID();
  await client.query(`INSERT INTO app.evidence_pack(id,tenant_id,job_id,case_id)
    VALUES($1,$2,$3,$4)`, [packId, tenantId, jobId, caseId]);
  await client.query(`INSERT INTO app.evidence_pack_revision
    (id,tenant_id,job_id,case_id,pack_id,revision,command_id,canonical_manifest,manifest_hash,content_hash,
     sources,format,actor_ref,subject_hash)
    VALUES($1,$2,$3,$4,$5,1,$6,'FL-4 synthetic fixture',$7,$7,'[]','TEXT','FL-4 fixture',$7)`,
  [randomUUID(), tenantId, jobId, caseId, packId, randomUUID(), hash]);
  await client.query(`INSERT INTO app.evidence_pack_attachment_approval
    (id,tenant_id,job_id,case_id,pack_id,command_id,request_hash,manifest_hash,content_hash,actor_ref)
    VALUES($1,$2,$3,$4,$5,$6,$7,$7,$7,'FL-4 fixture')`,
  [attachment, tenantId, jobId, caseId, packId, randomUUID(), hash]);
  const body = "Practice message — not sent. Our practice supplier records show £320.00 net is questioned in this supplier correction case. Please review the attached example supplier records.";
  await client.query(`WITH content AS (
      SELECT app.recovery_message_canonical_content($4,$3,'merchant_overcharge',2,32000,$5,1,$8,$8,
        'practice-builder@example.invalid','practice-supplier@example.invalid',$9,'practice-factual-message.v1',
        '["legacy synthetic recovery fixture"]'::jsonb) AS value)
    INSERT INTO app.recovery_message
      (id,tenant_id,job_id,case_id,case_sequence,pack_id,pack_revision,manifest_hash,attachment_hash,
       attachment_approval_id,command_id,request_hash,case_type,case_revision,amount_pence,currency,
       sender,recipient,body,policy_version,content_hash,immutable_content,actor_membership_id,environment)
    SELECT $1,$2,$3,$4,1,$5,1,$8,$8,$6,$7,$8,'merchant_overcharge',2,32000,'GBP',
      'practice-builder@example.invalid','practice-supplier@example.invalid',$9,'practice-factual-message.v1',
      encode(sha256(convert_to(value,'UTF8')),'hex'),value,$10,'synthetic_demo' FROM content`,
  [messageId, tenantId, jobId, caseId, packId, attachment, command, hash, body, actor]);
  await client.query(`INSERT INTO app.recovery_message_event
    (id,tenant_id,job_id,case_id,message_id,revision,kind,command_id,request_hash,actor_membership_id,environment)
    VALUES($1,$2,$3,$4,$5,1,'previewed',$6,$7,$8,'synthetic_demo')`,
  [randomUUID(), tenantId, jobId, caseId, messageId, command, hash, actor]);
}

export function register(helpers) {
  const { test, assert, admin, runtime, withTenant, contexts } = helpers;
  let fixtures;
  const prepare = () => fixtures ??= (async () => {
    const { firmA, firmB } = await contexts();
    const rows = [];
    for (const context of [firmA, firmB]) {
      // The second firm deliberately starts with no jobs. Use the existing
      // owner-only practice-home fixture permit for each graph's parent job.
      // Its firm key comes from the protected authenticated binding, as 2001's
      // job policy does; neither a title nor a caller-selected digest binds it.
      const { rows: [own] } = await withTenant(runtime, context, db => db.$client.query(
        "SELECT app.current_firm_profile_key() AS firm,app.current_actor() AS actor"));
      assert.match(own.firm, /^practice:[a-f0-9]{64}$/u);
      const jobId = randomUUID(), title = "Fictional FL-4 recovery fixture";
      const client = await admin.connect();
      try {
        await client.query("BEGIN");
        await client.query("SELECT set_config('app.tenant_id',$1,true)", [context.tenantId]);
        await permitPracticeHomeJob(client, { tenantId: context.tenantId, jobId, title,
          practiceSessionDigest: own.firm.slice("practice:".length), actorMembershipId: own.actor });
        await client.query(`INSERT INTO app.job(id,tenant_id,title,status,practice_session_digest,practice_scenario)
          VALUES($1,$2,$3,'draft',$4,'home')`, [jobId, context.tenantId, title, own.firm.slice("practice:".length)]);
        rows.push(await seedFamilyRows(client, { tenantId: context.tenantId, jobId, actor: own.actor }));
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally { client.release(); }
    }
    return rows;
  })();

  test("FL-4: each recovery family has a positive control in both firms", async () => {
    const rows = await prepare();
    const { firmA, firmB, firmBReal } = await contexts();
    for (const [index, context] of [firmA, firmB].entries()) {
      for (const table of ["app.recovery_case", "app.recovery_claim_revision", "app.recovery_case_event",
        "app.recovery_approval", "app.recovery_demo_selection", "app.recovery_eligibility_revision",
        "app.recovery_allocation_command", "app.recovery_review", "app.managed_recovery_pursuit",
        "app.recovery_message", "app.recovery_message_event"]) {
        const read = principal => withTenant(runtime, principal, db => db.$client.query(
          `SELECT job_id FROM ${table} WHERE tenant_id=$1 AND job_id=$2`, [rows[index].tenantId, rows[index].jobId]));
        assert.ok((await read(context)).rowCount > 0, `positive control: ${table}`);
        assert.equal((await read(index === 0 ? firmB : firmA)).rowCount, 0, `other practice firm: ${table}`);
        assert.equal((await read(firmBReal)).rowCount, 0, `real company: ${table}`);
      }
    }
  });

  registerFirmChecks({ ...helpers, contexts: async () => { await prepare(); return contexts(); } }, "FL-4", families);

  test("FL-4: all 35 recovery tables have effective restrictive locks", async () => {
    const catalog = await firmLockCatalog(admin);
    const locked = new Set(catalog.filter(row => row.firm_policy).map(row => row.relation));
    assert.equal(tables.length, 35);
    assert.equal(new Set(tables).size, 35);
    for (const table of tables) {
      const row = catalog.find(entry => entry.relation === table);
      assert.ok(row, `packet table still exists in the catalog: ${table}`);
      assert.equal(row.runtime_access, true, `${table} still has its original runtime access`);
      assert.deepEqual(lockProblems(row, locked), [], table);
    }
  });

  test("FL-4: firm B cannot insert, update or delete firm A's recovery rows", async () => {
    const [own] = await prepare();
    const { firmA, firmB } = await contexts();
    const sql = (context, query, params) => withTenant(runtime, context, db => db.$client.query(query, params));
    const { rows: [row] } = await sql(firmA, "SELECT to_jsonb(r) AS row FROM app.recovery_case r WHERE id=$1", [own.caseId]);
    assert.ok(row, "positive control before refusal");
    await assert.rejects(sql(firmB, `INSERT INTO app.recovery_case
      SELECT * FROM jsonb_populate_record(NULL::app.recovery_case,$1)`, [{ ...row.row, id: randomUUID() }]),
    error => error.code === "42501" && /row-level security/u.test(error.message));
    for (const query of ["UPDATE app.recovery_case SET counterparty=counterparty WHERE id=$1",
      "DELETE FROM app.recovery_case WHERE id=$1"]) {
      await assert.rejects(sql(firmB, query, [own.caseId]), error => error.code === "42501");
    }
    assert.equal((await sql(firmA, "SELECT id FROM app.recovery_case WHERE id=$1", [own.caseId])).rowCount, 1);
  });

  test("FL-4: migration 2050 reapplies twice with existing rows, grants and policies unchanged", async () => {
    await prepare();
    const snapshot = async db => ({
      tables: (await db.query(`SELECT oid::regclass::text AS table_name,relowner,relacl,relrowsecurity,relforcerowsecurity
        FROM pg_class WHERE oid=ANY($1::regclass[]) ORDER BY oid`, [tables])).rows,
      policies: (await db.query("SELECT * FROM pg_policy ORDER BY oid")).rows,
      counts: await Promise.all(tables.map(async table => [table,
        (await db.query(`SELECT count(*)::text AS n FROM ${table}`)).rows[0].n])),
    });
    const before = await snapshot(admin);
    assert.ok(before.tables.every(row => row.relrowsecurity && row.relforcerowsecurity), "RLS stays enabled and forced");
    const migration = readFileSync(new URL("../migrations/2050_v2_firm_lock_recovery.sql", import.meta.url), "utf8");
    const client = await admin.connect();
    try {
      await client.query("BEGIN");
      // Exercise first installation on a populated database, not only the no-op
      // path after bootstrap. Restore the original policy OIDs by rolling back.
      for (const table of tables) await client.query(`DROP POLICY v2_practice_firm ON ${table}`);
      const unlocked = await snapshot(client);
      await client.query(migration);
      const installed = await snapshot(client);
      assert.deepEqual(installed.tables, unlocked.tables, "no ownership, grant or RLS changes");
      assert.deepEqual(installed.counts, unlocked.counts, "no business row changes");
      // Existing policies other than FL-4's exact table/name pairs are untouched.
      const removed = new Set(before.policies.filter(row => !unlocked.policies.some(other => other.oid === row.oid)).map(row => row.polrelid));
      const otherPolicies = rows => rows.filter(row => row.polname !== "v2_practice_firm" || !removed.has(row.polrelid));
      assert.deepEqual(otherPolicies(installed.policies), otherPolicies(before.policies));
      assert.equal(installed.policies.length - unlocked.policies.length, 35);
      await client.query(migration);
      assert.deepEqual(await snapshot(client), installed, "second application changes nothing");
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
    assert.deepEqual(await snapshot(admin), before, "test restores the bootstrap policies and rows");
  });
}
