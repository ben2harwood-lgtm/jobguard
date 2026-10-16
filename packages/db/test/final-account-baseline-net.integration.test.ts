import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { evaluateDraftQuote, FinalAccountLockError } from "@jobguard/core";
import { FinalAccountCommandService } from "../src/final-account-repository.js";
import { migrate } from "../src/migrate.js";
import { withTenant } from "../src/tenant-context.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";

const tenantId = randomUUID(), accountId = randomUUID(), userId = randomUUID(), memberId = randomUUID();
const context = testTenantContext(tenantId), hash = "a".repeat(64);
let postgres: EmbeddedPostgres, directory: string, admin: Pool, runtime: Pool;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "final-account-baseline-net-pg-"));
  const port = await freePort(56500, 300), password = randomUUID();
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password, persistent: false,
    createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise();
  await postgres.start();
  const connection = { host: "127.0.0.1", port, database: "postgres", user: "postgres", password };
  admin = new Pool(connection);
  await migrate(admin);
  await installLegacySyntheticPartyFixtures(admin);
  // Owner connection prepares historical synthetic facts; assembly uses a non-owner runtime login.
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenantId]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [userId]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional baseline builder')", [accountId, tenantId]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",
    [memberId, tenantId, accountId, userId]);
  await admin.query(`CREATE ROLE baseline_net_login LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    GRANT jobguard_runtime TO baseline_net_login`);
  runtime = new Pool({ ...connection, user: "baseline_net_login" });
}, 60000);

afterAll(async () => {
  await closeTestPools(runtime, admin);
  await postgres?.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function frozenBaseline(netPence: 29290 | 29291) {
  const jobId = randomUUID(), scopeId = randomUUID(), scopeRevisionId = randomUUID(), draftId = randomUUID();
  const revisionId = randomUUID(), documentId = randomUUID(), lineId = randomUUID();
  const line = { id: lineId, scopeItemId: scopeId, scopeRevisionId, description: "Fictional cabinet fitting", origin: "human",
    included: true, exclusionReason: null, quantity: "2.5", unit: "hour", unitRatePence: 12333, discountPercent: "5",
    taxTreatment: "standard_rate_20", rateProvenance: "entered", category: null, region: null } as const;
  expect(evaluateDraftQuote({ currency: "GBP", taxPolicyVersion: "candidate_m1_standard_v1", lines: [line] }).totals.net.pence).toBe(29291);
  const totalPence = netPence + 5858;
  const snapshot = { schemaVersion: "quote-document.v1", documentVersion: 1, reference: "SYN-BASELINE", quoteRevisionId: revisionId,
    currency: "GBP", issuer: { name: "Fictional builder", address: ["1 Fictional Street"], email: "builder@example.invalid" },
    customer: { name: "Practice Customer", address: ["14 Fictional Street"], email: "customer@example.invalid" },
    lines: [{ scopeItemId: scopeId, description: line.description, quantity: "2.5", unit: "hour", netPence }],
    exclusions: [], qualifications: ["Synthetic history only"], subtotalPence: 30832, discountPence: 30832 - netPence,
    netPence, taxPence: 5858, totalPence };
  // Insert immutable pre-change history directly, without changing a calculator or disabling any trigger.
  await withTenant(admin, context, async db => {
    await db.$client.query("INSERT INTO app.job(id,tenant_id,title,status) VALUES($1,$2,'Fictional frozen quote','live')", [jobId, tenantId]);
    await db.$client.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [scopeId, tenantId, jobId]);
    await db.$client.query(`INSERT INTO app.scope_revision(id,tenant_id,job_id,scope_item_id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence)
      VALUES($1,$2,$3,$4,1,$5,'2.5','hour',12333,30832)`, [scopeRevisionId, tenantId, jobId, scopeId, line.description]);
    await db.$client.query("INSERT INTO app.quote_draft(id,tenant_id,job_id) VALUES($1,$2,$3)", [draftId, tenantId, jobId]);
    await db.$client.query(`INSERT INTO app.quote_revision(id,tenant_id,job_id,quote_draft_id,revision,currency,tax_policy_version,
      subtotal_pence,discount_pence,net_pence,tax_pence,total_pence,issuable,blockers)
      VALUES($1,$2,$3,$4,1,'GBP','candidate_m1_standard_v1',30832,$5,$6,5858,$7,true,'[]')`,
      [revisionId, tenantId, jobId, draftId, 30832 - netPence, netPence, totalPence]);
    await db.$client.query(`INSERT INTO app.quote_line(id,tenant_id,job_id,quote_revision_id,scope_item_id,scope_revision_id,origin,
      description,included,quantity_decimal,unit,unit_rate_pence,discount_decimal,tax_treatment,rate_provenance,ordinal)
      VALUES($1,$2,$3,$4,$5,$6,'human',$7,true,'2.5','hour',12333,'5','standard_rate_20','entered',1)`,
      [lineId, tenantId, jobId, revisionId, scopeId, scopeRevisionId, line.description]);
    await db.$client.query(`INSERT INTO app.quote_document_version(id,tenant_id,job_id,quote_revision_id,document_version,reference,
      content_hash,object_key,object_version_id,pdf_byte_length,issuer,customer,snapshot)
      VALUES($1,$2,$3,$4,1,'SYN-BASELINE',$5,$6,'synthetic-v1',1,$7,$8,$9)`,
      [documentId, tenantId, jobId, revisionId, hash, `synthetic/${documentId}.pdf`,
        JSON.stringify(snapshot.issuer), JSON.stringify(snapshot.customer), JSON.stringify(snapshot)]);
    await db.$client.query(`INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status)
      VALUES($1,$2,$3,1,$4,$5,'accepted')`, [documentId, tenantId, jobId, hash, netPence]);
    await db.$client.query(`INSERT INTO app.quote_acceptance(id,tenant_id,job_id,document_id,document_version,document_hash,
      accepted_total_pence,currency,acceptance_kind,actor_membership_id,stated_customer_name,stated_method,accepted_at)
      VALUES($1,$2,$3,$4,1,$5,$6,'GBP','builder_attestation',$7,'Practice Customer','email',clock_timestamp())`,
      [randomUUID(), tenantId, jobId, documentId, hash, totalPence, memberId]);
    await db.$client.query(`UPDATE app.job SET accepted_quote_version_id=$3,baseline_quote_version_id=$3,
      accepted_net_value_pence=$4,fee_policy_version='reference_fee_policy_v3',recovery_cap_pence=NULL WHERE tenant_id=$1 AND id=$2`,
      [tenantId, jobId, documentId, netPence]);
  });
  return { jobId, documentId, revisionId, scopeId, lineId };
}

async function storedState(jobId: string) {
  const frozen = (await admin.query(`SELECT row_to_json(j) job,row_to_json(q) revision,row_to_json(l) line,
    row_to_json(d) document,row_to_json(v) accepted_version,row_to_json(a) acceptance
    FROM app.job j JOIN app.quote_document_version d ON(d.tenant_id,d.job_id,d.id)=(j.tenant_id,j.id,j.baseline_quote_version_id)
    JOIN app.quote_revision q ON(q.tenant_id,q.job_id,q.id)=(d.tenant_id,d.job_id,d.quote_revision_id)
    JOIN app.quote_line l ON(l.tenant_id,l.job_id,l.quote_revision_id)=(q.tenant_id,q.job_id,q.id)
    JOIN app.quote_version v ON(v.tenant_id,v.job_id,v.id)=(d.tenant_id,d.job_id,d.id)
    JOIN app.quote_acceptance a ON(a.tenant_id,a.job_id,a.document_id)=(d.tenant_id,d.job_id,d.id)
    WHERE j.tenant_id=$1 AND j.id=$2`, [tenantId, jobId])).rows;
  const effects = {} as Record<string, number>;
  for (const table of ["final_account_draft", "final_account_revision", "final_account_line", "final_account_proof",
    "command_receipt", "decision", "decision_resolution", "action_authorization", "action_outbox", "audit_event", "journal"]) {
    effects[table] = (await admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1`, [tenantId])).rows[0].n;
  }
  return { frozen, effects };
}

const command = (jobId: string, expectedRevision: number) => ({ version: "final-account.assemble.v1", commandId: randomUUID(),
  actorMembershipId: memberId, jobId, expectedRevision });

describe("frozen final-account baseline net", () => {
  it("refuses a historical rounding mismatch with a typed error and writes nothing", async () => {
    const { jobId } = await frozenBaseline(29290), service = new FinalAccountCommandService(runtime);
    const before = await storedState(jobId);
    expect(before.frozen).toHaveLength(1);
    expect(before.frozen[0]).toMatchObject({ revision: { net_pence: 29290 }, document: { snapshot: { netPence: 29290 } },
      acceptance: { accepted_total_pence: 35148 } });
    for (let attempt = 0; attempt < 2; attempt++) {
      const refused = service.assemble(context, command(jobId, 0));
      await expect(refused).rejects.toBeInstanceOf(FinalAccountLockError);
      await expect(refused).rejects.toMatchObject({ code: "FINAL_ACCOUNT_TOTAL_MISMATCH" });
      expect(await storedState(jobId)).toEqual(before);
      expect(await service.read(context, jobId)).toBeNull();
    }
  });

  it("assembles and reuses a baseline whose recomputed net matches its frozen accepted revision", async () => {
    const { jobId, documentId, revisionId, scopeId, lineId } = await frozenBaseline(29291);
    const service = new FinalAccountCommandService(runtime), before = await storedState(jobId);
    const assembled = await service.assemble(context, command(jobId, 0));
    expect(assembled).toMatchObject({ revision: 1, reused: false,
      totals: { net: { pence: 29291, currency: "GBP" }, tax: { pence: 5858 }, total: { pence: 35149 } },
      lines: [{ kind: "baseline", sourceId: lineId, scopeItemId: scopeId, commercialRevisionId: revisionId, netPence: 29291 }] });
    expect(await service.read(context, jobId)).toMatchObject({ id: assembled.id, revision: 1, totals: assembled.totals });
    expect((await admin.query("SELECT baseline_quote_version_id FROM app.final_account_revision WHERE tenant_id=$1 AND id=$2",
      [tenantId, assembled.id])).rows[0].baseline_quote_version_id).toBe(documentId);
    expect(await service.assemble(context, command(jobId, 1))).toMatchObject({ id: assembled.id, revision: 1, reused: true });
    const after = await storedState(jobId);
    expect(after.frozen).toEqual(before.frozen);
    expect(after.effects.final_account_revision).toBe(before.effects.final_account_revision! + 1);
    expect(after.effects.audit_event).toBe(before.effects.audit_event! + 1);
    expect(after.effects.action_outbox).toBe(before.effects.action_outbox);
    expect(after.effects.journal).toBe(before.effects.journal);
  });
});
