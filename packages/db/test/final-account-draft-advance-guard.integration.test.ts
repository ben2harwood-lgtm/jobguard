import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { evaluateDraftQuote } from "@jobguard/core";
import { FinalAccountCommandService } from "../src/final-account-repository.js";
import { FinalAccountLockRepository } from "../src/final-account-lock-repository.js";
import { EvidenceService } from "../src/evidence.js";
import { ProofCommandService } from "../src/proof-repository.js";
import type { PrivateVersionedStorage } from "@jobguard/storage";
import { migrate } from "../src/migrate.js";
import { withTenant } from "../src/tenant-context.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";

const tenantId = randomUUID(), accountId = randomUUID(), userId = randomUUID(), memberId = randomUUID();
const context = testTenantContext(tenantId, { membershipId: memberId }), hash = "a".repeat(64);
let postgres: EmbeddedPostgres, directory: string, admin: Pool, runtime: Pool;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "draft-advance-guard-pg-"));
  const port = await freePort(56600, 300), password = randomUUID();
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
  await admin.query(`CREATE ROLE draft_advance_login LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
    GRANT jobguard_runtime TO draft_advance_login`);
  runtime = new Pool({ ...connection, user: "draft_advance_login" });
}, 60000);

afterAll(async () => {
  await closeTestPools(runtime, admin);
  await postgres?.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function frozenBaseline(netPence = 29291) {
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

const command = (jobId: string, expectedRevision: number) => ({ version: "final-account.assemble.v1", commandId: randomUUID(),
  actorMembershipId: memberId, jobId, expectedRevision });

async function prepared() {
  const a = await frozenBaseline(), service = new FinalAccountCommandService(runtime);
  const first = await service.assemble(context, command(a.jobId, 0));
  expect(first).toMatchObject({ revision: 1, reused: false });
  // A real proof completion changes the assembly source without editing commercial history.
  const bytes = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=", "base64");
  const storage: PrivateVersionedStorage = {
    createUploadUrl: async () => "memory://synthetic-upload",
    createDownloadUrl: async () => "memory://synthetic-download",
    readExactVersion: async (key, versionId) => ({ key, versionId, bytes, byteLength: bytes.length, contentType: "image/png" }),
    deleteExactVersion: async () => {},
  };
  const evidence = new EvidenceService(runtime, storage);
  const upload = await evidence.beginUpload(context, { jobId: a.jobId, scopeItemId: a.scopeId,
    expectedSha256: createHash("sha256").update(bytes).digest("hex"), contentType: "image/png",
    maximumBytes: 100, expiresAt: new Date("2099-01-01T00:00:00Z") });
  await evidence.finalize(context, { uploadId: upload.id, objectVersionId: "synthetic-v1", evidenceType: "electrical_certificate" });
  await admin.query(`INSERT INTO app.scope_progress(tenant_id,job_id,scope_item_id,stage)
    VALUES($1,$2,$3,'in_progress') ON CONFLICT DO NOTHING`, [tenantId, a.jobId, a.scopeId]);
  await new ProofCommandService(runtime, storage).complete(context, { version: "proof.complete.v1", commandId: randomUUID(),
    actorMembershipId: memberId, jobId: a.jobId, scopeItemId: a.scopeId, stage: "electrical-stage",
    evidenceId: upload.id, requiredEvidenceType: "electrical_certificate", decisionId: null });
  const second = await service.assemble(context, command(a.jobId, 1));
  expect(second).toMatchObject({ revision: 2, reused: false, issueBlocked: false });
  const head = (await admin.query("SELECT id FROM app.final_account_draft WHERE tenant_id=$1 AND job_id=$2", [tenantId, a.jobId])).rows[0]!;
  const read = () => service.read(context, a.jobId);
  expect(await read()).toMatchObject({ id: second.id, revision: 2 });
  return { ...a, draftId: head.id as string, first, second, read };
}
type Prepared = Awaited<ReturnType<typeof prepared>>;

async function advance(a: Prepared, revisionId: string | null, number: number) {
  return withTenant(runtime, context, db => db.$client.query("SELECT app.advance_final_account_draft($1,$2,$3,$4)",
    [tenantId, a.draftId, revisionId, number]));
}
async function refused(a: Prepared, revisionId: string | null, number: number) {
  const before = await a.read();
  await expect(advance(a, revisionId, number)).rejects.toMatchObject({ code: "23514", message: "INVALID_TRANSITION" });
  expect(await a.read()).toEqual(before);
}
async function candidate(a: Prepared, number: number, previousId: string | null) {
  const id = randomUUID();
  await admin.query(`INSERT INTO app.final_account_revision(id,tenant_id,job_id,final_account_draft_id,revision,
    previous_revision_id,source_hash,baseline_quote_version_id,currency,tax_policy_version,net_pence,tax_pence,total_pence,issue_blocked,findings)
    SELECT $1,tenant_id,job_id,final_account_draft_id,$2,$3,$4,baseline_quote_version_id,currency,tax_policy_version,
      net_pence,tax_pence,total_pence,issue_blocked,findings FROM app.final_account_revision WHERE tenant_id=$5 AND id=$6`,
    [id, number, previousId, createHash("sha256").update(id).digest("hex"), tenantId, a.second.id]);
  return id;
}

describe("final-account draft advance guard (real PostgreSQL)", () => {
  it("refuses an older revision after two normal repository assemblies", async () => {
    const a = await prepared();
    await refused(a, a.first.id, 1);
  });
  it("refuses a revision belonging to another draft", async () => {
    const a = await prepared(), other = await prepared();
    await refused(a, other.second.id, 3);
  });
  it("refuses a skipped revision even when its number and previous link match", async () => {
    const a = await prepared(), id = await candidate(a, 4, a.second.id);
    await refused(a, id, 4);
  });
  it("refuses a mismatched revision number", async () => {
    const a = await prepared(), id = await candidate(a, 3, a.second.id);
    await refused(a, id, 4);
  });
  it("refuses an unlinked next revision", async () => {
    const a = await prepared(), id = await candidate(a, 3, a.first.id);
    await refused(a, id, 3);
  });
  it("refuses clearing the current pointer", async () => {
    const a = await prepared();
    await refused(a, null, 3);
  });
  it("refuses a non-descendant advance after the real lock command", async () => {
    const a = await prepared(), id = await candidate(a, 3, a.first.id);
    const locks = new FinalAccountLockRepository(runtime);
    await locks.acceptTerms(context, { actorMembershipId: memberId, commandId: randomUUID(), termsVersion: "synthetic_final_check_terms.v1" });
    await locks.disposition(context, { jobId: a.jobId, actorMembershipId: memberId, commandId: randomUUID(), scopeItemId: a.scopeId, disposition: "done" });
    const locked = await locks.lock(context, { jobId: a.jobId, actorMembershipId: memberId, commandId: randomUUID(),
      finalAccountRevisionId: a.second.id, expectedRevision: 2, declarationVersion: "final_account_declaration.v1" });
    expect(locked.finalAccountRevisionId).toBe(a.second.id);
    await refused(a, id, 3);
    expect((await locks.read(context, a.jobId)).lock).toEqual(locked);
  });
});
