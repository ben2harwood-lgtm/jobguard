import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIGRATION_URLS, migrate, DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID, DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID,
  issuePracticeSession } from "../src/index.js";
import { createSyntheticInvoicePdf, money } from "@jobguard/core";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";

const nameOf = (url: URL) => fileURLToPath(url).split("/").at(-1)!;
const ownName = "0157_recovery_money_integrity.sql";
const credential = randomUUID();
let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool;
let clusterPort: number;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
async function populatedTables(db: PoolClient) {
  const names = (await db.query(`SELECT quote_ident(n.nspname)||'.'||quote_ident(c.relname) AS name FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname IN ('app','identity','control_plane','infrastructure','audit_control') ORDER BY 1`)).rows;
  const populated: string[] = [];
  for (const row of names) if ((await db.query(`SELECT EXISTS(SELECT 1 FROM ${row.name}) AS present`)).rows[0].present) populated.push(row.name);
  return populated;
}
type Snapshot = { table: string; columns: { name: string; type: string }[]; keys: string[]; rows: { identity: string; bytes: string }[] };
const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

async function snapshot(db: Pool | PoolClient, table: string, previous?: Snapshot): Promise<Snapshot> {
  const columns = (await db.query(`SELECT attname AS name,format_type(atttypid,atttypmod) AS type FROM pg_attribute
    WHERE attrelid=$1::regclass AND attnum>0 AND NOT attisdropped ORDER BY attnum`, [table])).rows;
  const keys = previous?.keys ?? (await db.query(`SELECT a.attname AS name FROM pg_index i
    CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(attnum,position)
    JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum
    WHERE i.indrelid=$1::regclass AND i.indisprimary ORDER BY k.position`, [table])).rows.map(row => row.name as string);
  expect(keys.length).toBeGreaterThan(0);
  const named = (previous?.columns ?? columns).map(column => quote(column.name)).join(",");
  const identity = `jsonb_build_array(${keys.map(quote).join(",")})::text`;
  const rows = (await db.query(`SELECT ${identity} AS identity,row_to_json(t)::text AS bytes FROM (SELECT ${named} FROM ${table}) t ORDER BY ${identity} COLLATE "C"`)).rows;
  // Only the rows that existed before N; later inserts are outside the preservation assertion.
  const selected = previous ? rows.filter(row => previous.rows.some(old => old.identity === row.identity)) : rows;
  return { table, columns: previous ? columns.filter(column => previous.columns.some(old => old.name === column.name)) : columns, keys, rows: selected };
}
async function preserved(db: Pool | PoolClient, before: Snapshot[]) {
  for (const old of before) {
    expect(old.rows.length, `pre-existing rows in ${old.table}`).toBeGreaterThan(0);
    expect(await snapshot(db, old.table, old)).toEqual(old);
  }
}
async function catalog(db: Pool | PoolClient) {
  return (await db.query(`SELECT c.oid::regclass::text AS name,pg_get_userbyid(c.relowner) AS owner,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text AS acl,
    (SELECT jsonb_agg(jsonb_build_array(polname,polcmd,polroles,pg_get_expr(polqual,polrelid),pg_get_expr(polwithcheck,polrelid)) ORDER BY polname) FROM pg_policy WHERE polrelid=c.oid) AS policies
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='r' AND n.nspname IN ('app','identity','control_plane','infrastructure','audit_control') ORDER BY name`)).rows;
}
async function routines(db: PoolClient) {
  return (await db.query(`SELECT p.oid::regprocedure::text AS name,pg_get_userbyid(proowner) AS owner,prosecdef,proacl::text AS acl,pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('app','identity','control_plane','infrastructure','audit_control') AND p.prokind='f' ORDER BY name`)).rows;
}
beforeAll(async () => {
  const directory = await mkdtemp(join(tmpdir(), "jg-migfix-6-upgrade-")), port = await freePort(62600, 100);
  clusterPort = port;
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: credential, persistent: false,
    createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"] });
  await postgres.initialise(); await postgres.start();
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: credential });
  process.env.JOBGUARD_ENV = "synthetic_demo";
}, 60_000);
afterAll(async () => { await closeTestPools(runtime, admin); await postgres?.stop(); });

async function seedDemoFixture(db: Pool, sessionDigest: string) {
  const tenantId = DEMO_TENANT_ID, memberId = DEMO_MEMBERSHIP_ID, jobId = randomUUID();
  const scopeId = randomUUID(), quoteId = randomUUID(), quoteDraftId = randomUUID(), quoteRevisionId = randomUUID(), acceptanceId = randomUUID();
  const proofId = randomUUID(), uploadId = randomUUID(), variationId = randomUUID(), variationRevisionId = randomUUID(), invoiceId = randomUUID();
  const proofBytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNioAAAAASUVORK5CYII=", "base64"), proofHash = createHash("sha256").update(proofBytes).digest("hex");
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [tenantId]);
    await client.query("INSERT INTO app.job(id,tenant_id,title,practice_session_digest,practice_scenario) VALUES($1,$2,'Recovery money upgrade fixture job',$3,'home')", [jobId, tenantId, sessionDigest]);
    await client.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [scopeId, tenantId, jobId]);
    await client.query("INSERT INTO app.quote_draft(id,tenant_id,job_id) VALUES($1,$2,$3)", [quoteDraftId, tenantId, jobId]);
    await client.query("INSERT INTO app.quote_revision(id,tenant_id,job_id,quote_draft_id,revision,currency,tax_policy_version,subtotal_pence,discount_pence,net_pence,tax_pence,total_pence,issuable,blockers) VALUES($1,$2,$3,$4,1,'GBP','candidate_m1_standard_v1',1880000,0,1880000,376000,2256000,true,'[]')", [quoteRevisionId, tenantId, jobId, quoteDraftId]);
    await client.query("INSERT INTO app.quote_document_version(id,tenant_id,job_id,quote_revision_id,document_version,reference,content_hash,object_key,object_version_id,pdf_byte_length,issuer,customer,snapshot) VALUES($1,$2,$3,$4,1,'FIXTURE-QUOTE-1',$5,'fixture/quote','quote-object-v1',1,'{}','{}',$6)", [quoteId, tenantId, jobId, quoteRevisionId, hash("quote immutable fixture"), { netPence: 1880000, taxPence: 376000, totalPence: 2256000 }]);
    await client.query("INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,1880000,'accepted')", [quoteId, tenantId, jobId, hash("quote immutable fixture")]);
    const transition = (expected: number, to: string, reason: string, quote: string | null = null, net: number | null = null, policy: string | null = null, cap: number | null = null) =>
      client.query("SELECT app.transition_job($1,$2,$3,$4,$5,$6,$7,$8,$9)", [tenantId, jobId, expected, to, reason, quote, net, policy, cap]);
    await transition(0, "quoting", "start_quote"); await transition(1, "accepted", "accept_quote", quoteId);
    await client.query("INSERT INTO app.quote_acceptance(id,tenant_id,job_id,document_id,document_version,document_hash,accepted_total_pence,currency,acceptance_kind,actor_membership_id,stated_customer_name,stated_method,accepted_at) VALUES($1,$2,$3,$4,1,$5,2256000,'GBP','builder_attestation',$6,'Fictional Customer','verbal','2026-09-20T12:00:00Z')", [acceptanceId, tenantId, jobId, quoteId, hash("quote immutable fixture"), memberId]);
    await transition(2, "live", "switch_live", quoteId, 1880000, "reference_fee_policy_v1", 28200);
    await client.query("INSERT INTO app.evidence_upload(id,tenant_id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,state,object_version_id,server_verified_at,expires_at) VALUES($1,$2,$3,$4,'fixture/proof',$5,'image/png',$6,'standard_evidence','verified','proof-object-v1',now(),now()+interval '1 hour')", [uploadId, tenantId, jobId, scopeId, proofHash, proofBytes.length]);
    await client.query("INSERT INTO app.synthetic_evidence_original(tenant_id,upload_id,job_id,scope_item_id,object_key,object_version_id,environment,content_type,bytes) VALUES($1,$2,$3,$4,'fixture/proof','proof-object-v1','synthetic_demo','image/png',$5)", [tenantId, uploadId, jobId, scopeId, proofBytes]);
    await client.query("INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,scope_item_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at) VALUES($1,$2,$3,$4,$5,'original','site_photo','fixture/proof','proof-object-v1',$6,$7,'image/png','standard_evidence',now(),now())", [proofId, tenantId, uploadId, jobId, scopeId, proofHash, proofBytes.length]);
    await client.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'small_builder','synthetic_demo','backfilled_synthetic_fixture')", [tenantId, jobId]);
    await client.query("INSERT INTO app.variation(id,tenant_id,job_id,scope_item_id,existing_scope_item_id,capture_kind,capture_text,description,state) VALUES($1,$2,$3,$4,$4,'text','Fictional additional work','Synthetic fixture extra','approved')", [variationId, tenantId, jobId, scopeId]);
    await client.query("INSERT INTO app.variation_revision(id,tenant_id,job_id,variation_id,scope_item_id,revision,description,quantity_decimal,unit,unit_rate_pence,signed_delta_pence,content_hash,confirmed_by_membership_id,rate_provenance_kind,rate_source_ref,rate_source_hash,rate_version) VALUES($1,$2,$3,$4,$5,1,'Synthetic fixture extra','1','each',12500,12500,$6,$7,'human_entered','fixture',$6,'fixture.v1')", [variationRevisionId, tenantId, jobId, variationId, scopeId, hash("approved variation fixture"), memberId]);
    await client.query("INSERT INTO app.variation_approval(id,tenant_id,job_id,variation_id,revision_id,revision,content_hash,signed_delta_pence,method,actor_membership_id,approved_at) VALUES($1,$2,$3,$4,$5,1,$6,12500,'builder_attestation',$7,now())", [randomUUID(), tenantId, jobId, variationId, variationRevisionId, hash("approved variation fixture"), memberId]);
    await transition(3, "invoiced", "issue_invoice");
    const finalDraft = randomUUID(), finalRevision = randomUUID(), decision = randomUUID(), resolution = randomUUID(), authorization = randomUUID();
    await client.query("INSERT INTO app.final_account_draft(id,tenant_id,job_id) VALUES($1,$2,$3)", [finalDraft, tenantId, jobId]);
    await client.query("INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings) VALUES($1,$2,$3,$4,1,$5,$6,'GBP','candidate_m1_standard_v1',1880000,376000,2256000,false,'[]')", [finalRevision, tenantId, jobId, finalDraft, hash("final account fixture"), quoteId]);
    const invoiceBytes = Buffer.from(createSyntheticInvoicePdf({ invoiceNumber: "FIXTURE-INVOICE-1", issuerName: "Fictional fixture builder", total: money(2256000), sourceRevisionId: finalRevision, evidenceVersionIds: ["proof-object-v1"] }));
    await client.query("INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,'job',$3,'final_account.issue')", [decision, tenantId, jobId]);
    await client.query("INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'approved',$4)", [resolution, tenantId, decision, memberId]);
    await client.query("INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,amount_pence,currency,policy_version,expires_at) VALUES($1,$2,$3,$4,$5,'final_account.issue','fixture@example.invalid',$6,1,2256000,'GBP','candidate_m1_standard_v1',now()+interval '1 hour')", [authorization, tenantId, decision, resolution, memberId, createHash("sha256").update(invoiceBytes).digest("hex")]);
    await client.query("INSERT INTO app.customer_invoice(id,tenant_id,job_id,final_account_revision_id,authorization_id,invoice_number,issued_on,issuer_details,tax_policy_version,currency,net_pence,tax_pence,total_pence,source_hash,pdf_sha256,pdf_bytes,synthetic,watermark) VALUES($1,$2,$3,$4,$5,'FIXTURE-INVOICE-1','2026-09-20','{}','candidate_m1_standard_v1','GBP',1880000,376000,2256000,$6,$7,$8,true,'SYNTHETIC - NOT A REAL INVOICE')", [invoiceId, tenantId, jobId, finalRevision, authorization, hash("final account fixture"), createHash("sha256").update(invoiceBytes).digest("hex"), invoiceBytes]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  return { tenantId, jobId, invoiceId, memberId };
}



// Historical recovery money rows that exist BEFORE 0157: a legacy landing with its derivation and fee journal, an allocation-era
// invoice line source, and an F18 v3 review with its claim lines. FK triggers are off only while this fixture is written.
async function historicalFixture() {
  const session = await issuePracticeSession(runtime), digest = hash(session);
  const f = await seedDemoFixture(admin, digest);
  const caseId = randomUUID(), receipt = randomUUID(), eligibility = randomUUID(), landing = randomUUID(), allocation = randomUUID(), derivation = randomUUID(), journal = randomUUID(), review = randomUUID();
  const evidence = (await admin.query("SELECT id FROM app.evidence_object WHERE tenant_id=$1 AND job_id=$2 LIMIT 1", [f.tenantId, f.jobId])).rows[0].id as string;
  const client = await admin.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [f.tenantId]);
    await client.query("SET LOCAL session_replication_role=replica");
    await client.query("INSERT INTO app.recovery_case(id,tenant_id,job_id,claim_pence,currency,state,revision,synthetic,case_type,counterparty,book,source_type,source_refs) VALUES($1,$2,$3,250000,'GBP','partially_landed',0,true,'withheld_customer_payment','Fictional counterparty','builder_customer','customer_invoice',$4)", [caseId, f.tenantId, f.jobId, JSON.stringify([f.invoiceId])]);
    await client.query("INSERT INTO app.synthetic_recovery_receipt(id,tenant_id,job_id,source_identity,reconciliation_identity,status,gross_pence,currency,synthetic,settled_at) VALUES($1::uuid,$2::uuid,$3::uuid,$1::text,$1::text,'settled',100000,'GBP',true,now())", [receipt, f.tenantId, f.jobId]);
    for (const [id, kind] of [[eligibility, "eligibility"], [landing, "landing"]]) await client.query("INSERT INTO app.recovery_approval(id,tenant_id,job_id,case_id,kind,expected_case_revision,status,policy_version,expires_at,command_id) VALUES($1,$2,$3,$4,$5,0,'approved','reference_fee_policy_v1',now()+interval '1 hour',$6)", [id, f.tenantId, f.jobId, caseId, kind, randomUUID()]);
    await client.query("INSERT INTO app.landing_allocation(id,tenant_id,job_id,case_id,receipt_id,evidence_id,eligibility_approval_id,landing_approval_id,gross_pence,eligible_net_pence,currency,policy_version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,100000,100000,'GBP','reference_fee_policy_v1')", [allocation, f.tenantId, f.jobId, caseId, receipt, evidence, eligibility, landing]);
    await client.query("INSERT INTO app.recovery_fee_derivation(id,tenant_id,job_id,source_allocation_id,policy_version,cumulative_landed_pence,cap_pence,capped_fee_pence,credit_used_pence,liability_pence,posting_delta_pence) VALUES($1,$2,$3,$4,'reference_fee_policy_v1',100000,28200,10000,0,10000,10000)", [derivation, f.tenantId, f.jobId, allocation]);
    await client.query("INSERT INTO app.recovery_fee_journal(id,tenant_id,job_id,derivation_id,kind,amount_pence,currency,debit_code,credit_code) VALUES($1,$2,$3,$4,'fee_obligation',10000,'GBP','recovery_fee_receivable','recovery_fee_deferred')", [journal, f.tenantId, f.jobId, derivation]);
    const result = { version: "recovery-eligibility-review.v3", policyVersion: "reference_recovery_eligibility_policy_v3", fixture: "F18", outcome: "eligible_for_review", qualifyingPrincipal: { pence: 262000, currency: "GBP" }, reason: "Fixed statutory compensation is not part of the fee base", reasonHeld: false, terminal: false, productionEnabled: false, lines: [] };
    await client.query("INSERT INTO app.recovery_eligibility_v3_review(id,tenant_id,job_id,case_id,revision,case_revision,fixture,actor_membership_id,command_id,payload_hash,result) VALUES($1,$2,$3,$4,1,1,'F18',$5,$6,$7,$8)", [review, f.tenantId, f.jobId, caseId, f.memberId, randomUUID(), "c".repeat(64), JSON.stringify(result)]);
    for (const [kind, net] of [["principal", 250000], ["statutory_interest", 12000], ["fixed_compensation", 7000]] as const)
      await client.query("INSERT INTO app.recovery_claim_line(id,tenant_id,job_id,case_id,review_id,kind,debtor_type,net_pence) VALUES($1,$2,$3,$4,$5,$6,'business',$7)", [randomUUID(), f.tenantId, f.jobId, caseId, review, kind, net]);
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  return { tenantId: f.tenantId, jobId: f.jobId, allocation };
}

describe("MIGFIX-6 upgrade", () => {
  it("MIGFIX-6.UPGRADE own-step preservation, repeat application, later migrations twice and full types", async () => {
    const db = await admin.connect();
    try {
      await db.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
      for (const url of MIGRATION_URLS.filter(url => nameOf(url) < ownName)) {
        const name = nameOf(url), text = await readFile(url, "utf8");
        await db.query(name === "0095_job_parties.sql" ? text.replace("BEGIN;", "BEGIN; SELECT set_config('app.deployment_mode','synthetic_demo',true);") : text);
        await db.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [name]);
      }
      await db.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [DEMO_TENANT_ID]);
      await db.query("SELECT set_config('app.tenant_id',$1,false)", [DEMO_TENANT_ID]);
      await db.query("INSERT INTO identity.identity_user(id) VALUES($1)", [DEMO_IDENTITY_USER_ID]);
      await db.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Recovery money upgrade fixture')", [DEMO_ACCOUNT_ID, DEMO_TENANT_ID]);
      await db.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID]);
      await db.query(`CREATE ROLE migfix_6_upgrade_runtime LOGIN PASSWORD '${credential}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT jobguard_runtime TO migfix_6_upgrade_runtime`);
      runtime = new Pool({ host: "127.0.0.1", port: clusterPort, user: "migfix_6_upgrade_runtime", password: credential, database: "postgres" });
      await installLegacySyntheticPartyFixtures(admin);
      const { tenantId, allocation } = await historicalFixture();
      const tables = await populatedTables(db);
      for (const table of ["app.landing_allocation", "app.recovery_fee_derivation", "app.recovery_fee_journal", "app.recovery_eligibility_v3_review", "app.recovery_claim_line", "app.recovery_case", "app.customer_invoice", "app.evidence_object"]) expect(tables).toContain(table);
      const before = await Promise.all(tables.map(table => snapshot(db, table))), privileges = await catalog(db), beforeRoutines = await routines(db);
      const own = MIGRATION_URLS.find(url => nameOf(url) === ownName);
      expect(own, "own migration registered").toBeDefined();
      await db.query("SET ROLE jobguard_migration");
      await db.query(await readFile(own!, "utf8"));
      await db.query("RESET ROLE");
      await preserved(db, before); expect(await catalog(db)).toEqual(privileges);
      const replaced = ["app.approve_synthetic_landing(jsonb)", "app.reverse_synthetic_landing(uuid,uuid,uuid,uuid,uuid,bigint,character varying)", "app.write_recovery_allocation(uuid,uuid,text,jsonb,jsonb)",
        "app.guard_recovery_eligibility_v3()", "app.require_recovery_eligibility_v3_effect()"];
      const afterRoutines = await routines(db);
      for (const prior of beforeRoutines) {
        const after = afterRoutines.find(row => row.name === prior.name);
        if (replaced.includes(prior.name)) {
          // Same signature, owner, security mode and privileges; only the body differs.
          expect({ ...after, definition: prior.definition }).toEqual(prior);
          expect(after.definition).not.toBe(prior.definition);
        } else expect(after).toEqual(prior);
      }
      for (const name of replaced) expect(beforeRoutines.some(row => row.name === name), `${name} existed before N`).toBe(true);
      await db.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [ownName]);
      const helper = (await db.query(`SELECT pg_get_userbyid(proowner) AS owner,prosecdef,
        has_function_privilege('jobguard_runtime',oid,'EXECUTE') AS runtime,
        has_function_privilege('jobguard_infrastructure',oid,'EXECUTE') AS infrastructure,has_function_privilege('public',oid,'EXECUTE') AS public_execute
        FROM pg_proc WHERE oid='app.recovery_allocation_invoice_lines(uuid,uuid,uuid)'::regprocedure`)).rows[0];
      expect(helper).toEqual({ owner: "jobguard_migration", prosecdef: false, runtime: false, infrastructure: false, public_execute: false });
      const bound = (await db.query("SELECT pg_get_constraintdef(oid) AS definition,convalidated FROM pg_constraint WHERE conrelid='app.landing_allocation'::regclass AND conname='landing_allocation_eligible_within_gross'")).rows;
      expect(bound).toEqual([{ definition: "CHECK ((eligible_net_pence <= gross_pence))", convalidated: true }]);
      // The runtime still has no direct write on any recovery money table and EXECUTE on the same two legacy writers.
      for (const table of ["landing_allocation", "recovery_fee_derivation", "recovery_fee_journal", "recovery_case_allocation", "recovery_case_allocation_reversal", "receipt_line_allocation"])
        expect((await db.query(`SELECT has_table_privilege('jobguard_runtime','app.${table}','INSERT') i,has_table_privilege('jobguard_runtime','app.${table}','UPDATE') u,has_table_privilege('jobguard_runtime','app.${table}','DELETE') d`)).rows[0], table).toEqual({ i: false, u: false, d: false });
      await migrate(db); await migrate(db); // Everything after N succeeds twice; no later function/column freeze.
      await preserved(db, before);
      // Controls use precisely the same preservation comparison as the migration proof, each rolled back.
      async function control(sql: string, succeeds: boolean, args: unknown[] = [], preface = "") {
        await db.query("BEGIN");
        try { if (preface) await db.query(preface); await db.query(sql, args); if (succeeds) await preserved(db, before); else await expect(preserved(db, before)).rejects.toThrow(); }
        finally { await db.query("ROLLBACK"); }
      }
      await control("UPDATE app.landing_allocation SET created_at=created_at+interval '1 microsecond' WHERE tenant_id=$1 AND id=$2", false, [tenantId, allocation], "SET LOCAL session_replication_role=replica");
      await control("ALTER TABLE app.landing_allocation ALTER COLUMN policy_version TYPE varchar(120)", false);
      await control("ALTER TABLE app.landing_allocation ADD COLUMN migfix_6_nullable text", true);
      await control("CREATE OR REPLACE FUNCTION app.half_even_ratio(n bigint,num bigint,den bigint) RETURNS bigint LANGUAGE sql IMMUTABLE STRICT AS 'SELECT 0::bigint'", true);
      await preserved(db, before);
    } finally { await db.query("ROLLBACK"); await db.query("RESET ROLE"); db.release(); }
  }, 120_000);
});
