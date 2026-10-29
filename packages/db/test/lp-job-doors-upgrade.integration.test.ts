// LP-2 own-step proof; execution evidence is recorded separately.
import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIGRATION_URLS, migrate } from "../src/migrate.js";
import { AdoptInFlightJobMutation } from "../src/job-import-repository.js";
import { UserCommandDispatcher } from "../src/commands.js";
import { adoptionFixture, jobDoorsDatabase, transaction, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";
import { seedEvidencePackFixture } from "./evidence-pack-fixture.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
import { proofBefore, proofColumns, proofDifferences, rolledBack, scratchReplaceFunction } from "./upgrade-proof-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

const ownName = "0344_unchecked_job_doors.sql";
let db: JobDoorsDatabase;
beforeAll(async () => { db = await jobDoorsDatabase(true, ownName); }, 300_000);
afterAll(async () => { await db?.close(); });
const noChanges = { rows: [], types: [] };
function requireRows(proof: Awaited<ReturnType<typeof proofBefore>>) {
  for (const [table, snapshot] of Object.entries(proof)) {
    if (Object.keys(snapshot.rows).length === 0) throw new Error(`${table}: no pre-existing row`);
  }
}

describe("LP-2 canonical upgrade proof preparation", () => {
  it("[LP2-A15] the same PostgreSQL comparator detects microseconds and retypes but permits later columns, functions and identities", async () => {
    await rolledBack(db.owner, async client => {
      await client.query("CREATE TABLE public.lp2_compare(id integer PRIMARY KEY,at timestamptz NOT NULL)");
      const empty = await proofBefore(client, ["public.lp2_compare"]);
      expect(() => requireRows(empty)).toThrow("no pre-existing row");
      await client.query("INSERT INTO public.lp2_compare VALUES(1,'2026-10-15T00:00:00.000001Z')");
      await client.query("CREATE FUNCTION public.lp2_compare_function() RETURNS integer LANGUAGE sql AS 'SELECT 1'");
      const before = await proofBefore(client, ["public.lp2_compare"]);
      requireRows(before);
      const compare = () => proofDifferences(client, before);
      expect(await compare()).toEqual(noChanges);
      for (const [sql, expected] of [
        ["UPDATE public.lp2_compare SET at=at+interval '1 microsecond'", "rows"],
        ["ALTER TABLE public.lp2_compare ALTER COLUMN id TYPE bigint", "types"],
        ["ALTER TABLE public.lp2_compare ADD COLUMN later text", null],
        ["CREATE OR REPLACE FUNCTION public.lp2_compare_function() RETURNS integer LANGUAGE sql AS 'SELECT 2'", null],
        ["INSERT INTO public.lp2_compare VALUES(2,'2026-10-15T00:00:00.000002Z')", null],
      ] as const) {
        await client.query("SAVEPOINT comparator_control");
        try {
          await client.query(sql);
          const result = await compare();
          if (expected === null) expect(result).toEqual(noChanges);
          else expect(result[expected].length).toBeGreaterThan(0);
        } finally { await client.query("ROLLBACK TO SAVEPOINT comparator_control"); }
      }
      expect(await compare()).toEqual(noChanges);
    });
  });

  it("[LP2-A15] [LP2-A16] own-step and later runner replay preserve populated history by named columns, full types and original identities", async () => {
    const own = MIGRATION_URLS.find(url => url.pathname.endsWith(`/${ownName}`));
    expect(own, "own migration must be discovered").toBeDefined();
    await installLegacySyntheticPartyFixtures(db.owner);
    const commercial = await seedEvidencePackFixture(db.owner);
    const imported = await adoptionFixture(db);
    await new UserCommandDispatcher(db.runtime).dispatch(testTenantContext(imported.actor.tenant), imported.command,
      new AdoptInFlightJobMutation(imported.actor.tenant, "synthetic_candidate", imported.input));
    await transaction(db.owner, commercial.tenantId, async client => {
      const source = randomUUID(), proposal = randomUUID(), review = randomUUID();
      const text = "Fictional LP2 preserved capture", hash = createHash("sha256").update(text).digest("hex");
      await client.query("INSERT INTO app.capture_source(id,tenant_id,kind,content_bytes,content_text,sha256) VALUES($1,$2,'text',$3,$4,$5)",
        [source, commercial.tenantId, Buffer.from(text), text, hash]);
      await client.query(`INSERT INTO app.job_record_proposal(id,tenant_id,capture_id,job_id,source_id,source_version,source_sha256,prompt_version,schema_version,model,proposal)
        VALUES($1,$2,$3,$4,$3,1,$5,'lp2.fixture.v1','lp2.fixture.v1','fixture-only','{}')`,
      [proposal, commercial.tenantId, source, commercial.jobId, hash]);
      await client.query("INSERT INTO app.proposal_review(id,tenant_id,job_id,proposal_id) VALUES($1,$2,$3,$4)",
        [review, commercial.tenantId, commercial.jobId, proposal]);
      await client.query(`INSERT INTO app.scope_revision(id,tenant_id,job_id,scope_item_id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence)
        VALUES($1,$2,$3,$4,1,'Fictional preserved scope','1','each',1880000,1880000)`,
      [randomUUID(), commercial.tenantId, commercial.jobId, commercial.scopeId]);
      const activation = randomUUID();
      await client.query(`INSERT INTO app.job_activation(id,tenant_id,job_id,accepted_document_id,accepted_document_version,accepted_document_hash,mode,activation_terms_version,fee_policy_version,actor_membership_id,activated_at)
        SELECT $1,$2,$3,id,document_version,content_hash,'synthetic_demo','synthetic_demo_illustrative.v1','reference_fee_policy_v1',$4,clock_timestamp()
        FROM app.quote_document_version WHERE tenant_id=$2 AND id=$5`,
      [activation, commercial.tenantId, commercial.jobId, commercial.memberId, commercial.quoteId]);
      await client.query(`INSERT INTO app.cap_snapshot(id,tenant_id,job_id,activation_id,baseline_quote_version_id,accepted_net_value_pence,currency,recovery_cap_pence,fee_policy_version,illustrative)
        VALUES($1,$2,$3,$4,$5,1880000,'GBP',28200,'reference_fee_policy_v1',true)`,
      [randomUUID(), commercial.tenantId, commercial.jobId, activation, commercial.quoteId]);
      await client.query("SELECT app.configure_recovery_demo($1,$2,'eligible')", [commercial.jobId, randomUUID()]);
      const selection = (await client.query("SELECT * FROM app.recovery_demo_selection WHERE tenant_id=$1 AND job_id=$2", [commercial.tenantId, commercial.jobId])).rows[0]!;
      const allocation = randomUUID();
      await client.query("SELECT app.approve_synthetic_landing($1::jsonb)", [JSON.stringify({ version: "recovery.landing.approve.v1",
        policyVersion: "reference_fee_policy_v1", caseId: selection.case_id, jobId: commercial.jobId, receiptId: selection.receipt_id,
        evidenceId: selection.evidence_id, eligibilityApprovalId: selection.eligibility_approval_id, landingApprovalId: selection.landing_approval_id,
        expectedCaseRevision: 0, allocationId: allocation, derivationId: randomUUID(), journalId: randomUUID(), grossPence: 18000, eligibleNetPence: 15000 })]);
      await client.query("SELECT app.reverse_synthetic_landing($1,$2,$3,$4,$5,1000,'Fictional reversal')",
        [commercial.tenantId, randomUUID(), randomUUID(), randomUUID(), allocation]);
      await client.query("SELECT app.create_fee_illustration_source($1,$2)", [commercial.jobId, randomUUID()]);
    });
    const tables = ["app.job", "app.scope_identity", "app.scope_revision", "app.capture_source", "app.job_record_proposal", "app.proposal_review",
      "app.imported_job_baseline", "app.command_receipt", "app.decision", "app.decision_resolution", "app.action_authorization", "app.audit_event", "audit_control.audit_head",
      "app.quote_document_version", "app.quote_acceptance", "app.evidence_object", "app.variation_revision", "app.variation_approval", "app.material_rate_revision",
      "app.supplier_document", "app.supplier_document_version", "app.customer_invoice", "app.recovery_claim_revision", "app.job_activation", "app.cap_snapshot",
      "app.recovery_demo_selection", "app.synthetic_recovery_receipt", "app.recovery_approval", "app.landing_allocation", "app.landing_reversal",
      "app.recovery_fee_derivation", "app.recovery_fee_journal", "app.fee_illustration_source"];
    const before = await proofBefore(db.owner, tables);
    requireRows(before);
    await db.owner.query(await readFile(own!, "utf8"));
    await db.owner.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [ownName]);
    expect(await proofDifferences(db.owner, before)).toEqual(noChanges);
    for (const table of tables) expect((await proofColumns(db.owner, table)).map(column => column.name)).toEqual(before[table]!.names);
    expect((await db.owner.query("SELECT has_function_privilege('jobguard_runtime','app.transition_job(uuid,uuid,integer,character varying,character varying,uuid,bigint,character varying,bigint)','EXECUTE') allowed")).rows).toEqual([{ allowed: false }]);
    expect((await db.owner.query("SELECT count(*)::int AS n FROM app.lp_job_insert_permit")).rows).toEqual([{ n: 0 }]);
    expect((await db.owner.query(`SELECT has_function_privilege('jobguard_runtime',
      'app.adopt_in_flight_job(uuid,uuid,uuid,character varying,character varying,character,character varying,bigint,bigint,character varying,character varying,uuid,timestamp with time zone)','EXECUTE') AS allowed`)).rows)
      .toEqual([{ allowed: false }]);
    // No comparison of later function bodies or added columns: only the original row identities and types.
    for (let pass = 0; pass < 2; pass++) {
      await migrate(db.owner);
      expect(await proofDifferences(db.owner, before)).toEqual(noChanges);
    }
    await rolledBack(db.owner, async client => {
      expect(await scratchReplaceFunction(client, "app.create_fee_illustration_source(uuid,uuid)")).toBe(true);
      expect(await proofDifferences(client, before)).toEqual(noChanges);
    });
  }, 180_000);
});
