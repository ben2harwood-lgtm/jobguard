import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { approveVariation, priceVariation } from "@jobguard/core";
import { FinalAccountLockApplication } from "../../../apps/api/src/final-account-lock.application.js";
import {
  authenticatePracticeSession, approvePricedVariation, DEMO_TENANT_ID, DEMO_ACCOUNT_ID,
  DEMO_MEMBERSHIP_ID, DEMO_IDENTITY_USER_ID, FinalAccountCommandService, issuePracticeSession,
  migrate, VariationRepository, withTenant,
} from "../src/index.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";

let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, directory: string;
const hash = "a".repeat(64);
beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  directory = await mkdtemp(join(tmpdir(), "audit-final-account-lock-pg-"));
  const port = await freePort(56600, 200), password = randomUUID();
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password,
    persistent: false, createPostgresUser: process.getuid?.() === 0,
    initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password });
  await migrate(admin); await installLegacySyntheticPartyFixtures(admin);
  await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [DEMO_TENANT_ID]);
  await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [DEMO_IDENTITY_USER_ID]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional lock audit')", [DEMO_ACCOUNT_ID, DEMO_TENANT_ID]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID, DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID]);
  // Disposable test login inherits only the migrated runtime role, with no direct table grants.
  await admin.query(`CREATE ROLE audit_lock_login LOGIN PASSWORD '${password}' NOSUPERUSER NOBYPASSRLS; GRANT jobguard_runtime TO audit_lock_login`);
  runtime = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "audit_lock_login", password, max: 4 });
}, 60000);
afterAll(async () => {
  vi.unstubAllEnvs(); await closeTestPools(runtime, admin); await postgres?.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function fixture() {
  const session = await issuePracticeSession(runtime), auth = await authenticatePracticeSession(runtime, session);
  const jobId = randomUUID(), scope = randomUUID(), scopeRevision = randomUUID();
  const draft = randomUUID(), quote = randomUUID(), baseline = randomUUID();
  // Establish an immutable accepted baseline and verified proof in this NEW fixture only.
  // Ownership is present at INSERT; no trigger bypass or first-touch adoption is used.
  await withTenant(admin, auth.context, async db => {
    await db.$client.query("INSERT INTO app.job(id,tenant_id,title,status,practice_session_digest,practice_scenario) VALUES($1,$2,'Fictional audit job','live',$3,'capture')", [jobId, DEMO_TENANT_ID, auth.digest]);
    await db.$client.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [scope, DEMO_TENANT_ID, jobId]);
    await db.$client.query("INSERT INTO app.scope_revision(id,tenant_id,job_id,scope_item_id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence) VALUES($1,$2,$3,$4,1,'Fictional baseline','1','item',3360000,3360000)", [scopeRevision, DEMO_TENANT_ID, jobId, scope]);
    await db.$client.query("INSERT INTO app.quote_draft(id,tenant_id,job_id) VALUES($1,$2,$3)", [draft, DEMO_TENANT_ID, jobId]);
    await db.$client.query("INSERT INTO app.quote_revision(id,tenant_id,job_id,quote_draft_id,revision,currency,tax_policy_version,subtotal_pence,discount_pence,net_pence,tax_pence,total_pence,issuable,blockers) VALUES($1,$2,$3,$4,1,'GBP','candidate_m1_standard_v1',3360000,0,3360000,672000,4032000,true,'[]')", [quote, DEMO_TENANT_ID, jobId, draft]);
    await db.$client.query("INSERT INTO app.quote_line(id,tenant_id,job_id,quote_revision_id,scope_item_id,scope_revision_id,origin,description,included,quantity_decimal,unit,unit_rate_pence,discount_decimal,tax_treatment,rate_provenance,ordinal) VALUES($1,$2,$3,$4,$5,$6,'captured','Fictional baseline',true,'1','item',3360000,'0','standard_rate_20','entered',1)", [randomUUID(), DEMO_TENANT_ID, jobId, quote, scope, scopeRevision]);
    await db.$client.query("INSERT INTO app.quote_document_version(id,tenant_id,job_id,quote_revision_id,document_version,reference,content_hash,object_key,object_version_id,pdf_byte_length,issuer,customer,snapshot) VALUES($1,$2,$3,$4,1,'SYNTHETIC-AUDIT',$5,$6,$7,1,'{}','{}','{}')", [baseline, DEMO_TENANT_ID, jobId, quote, hash, `synthetic/${baseline}`, randomUUID()]);
    await db.$client.query("INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,3360000,'accepted')", [baseline, DEMO_TENANT_ID, jobId, hash]);
    await db.$client.query("UPDATE app.job SET baseline_quote_version_id=$1,accepted_net_value_pence=3360000,fee_policy_version='reference_fee_policy_v3' WHERE tenant_id=$2 AND id=$3", [baseline, DEMO_TENANT_ID, jobId]);
    const upload = randomUUID(), evidence = randomUUID(), link = randomUUID(), objectVersion = randomUUID();
    await db.$client.query("INSERT INTO app.evidence_upload(id,tenant_id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,state,object_version_id,server_verified_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,'application/pdf',100,'standard_evidence','verified',$7,clock_timestamp(),clock_timestamp()+interval '1 day')", [upload, DEMO_TENANT_ID, jobId, scope, `synthetic/${evidence}`, hash, objectVersion]);
    await db.$client.query("INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,scope_item_id,kind,evidence_type,object_key,object_version_id,sha256,byte_length,content_type,retention_class,server_received_at,server_verified_at) VALUES($1,$2,$3,$4,$5,'original','electrical_certificate',$6,$7,$8,1,'application/pdf','standard_evidence',clock_timestamp(),clock_timestamp())", [evidence, DEMO_TENANT_ID, upload, jobId, scope, `synthetic/${evidence}`, objectVersion, hash]);
    await db.$client.query("INSERT INTO app.evidence_link(id,tenant_id,evidence_id,job_id,scope_item_id,required_evidence_type) VALUES($1,$2,$3,$4,$5,'electrical_certificate')", [link, DEMO_TENANT_ID, evidence, jobId, scope]);
    await db.$client.query("INSERT INTO app.stage_completion(id,tenant_id,job_id,scope_item_id,stage,evidence_link_id,command_id) VALUES($1,$2,$3,$4,'completed',$5,$6)", [randomUUID(), DEMO_TENANT_ID, jobId, scope, link, randomUUID()]);
  });
  const app = new FinalAccountLockApplication(runtime, session), accounts = new FinalAccountCommandService(runtime);
  const assemble = () => accounts.assemble(auth.context, { version: "final-account.assemble.v1", commandId: randomUUID(), actorMembershipId: DEMO_MEMBERSHIP_ID, jobId });
  await app.acceptTerms(jobId, { version: "final-check-terms.accept.v1", commandId: randomUUID(), termsVersion: "synthetic_final_check_terms.v1" });
  await app.disposition(jobId, { version: "final-account.disposition.v1", commandId: randomUUID(), scopeItemId: scope, disposition: "done" });
  const command = (account: Awaited<ReturnType<typeof assemble>>) => ({ version: "final-account.lock.v1", commandId: randomUUID(), finalAccountRevisionId: account.id, expectedRevision: account.revision, declarationVersion: "final_account_declaration.v1" });
  async function stageExtra(net = 40000, review = false) {
    const proposal = { version: "variation-proposal.v1" as const, id: randomUUID(), jobId, scopeItemId: randomUUID(), existingScopeItemId: null, lineageParentScopeItemId: null, captureKind: "text" as const, captureText: "Fictional extra", description: "Fictional extra", suggestion: null };
    const price = { quantity: "1", unit: "item", unitRatePence: net, direction: "addition" as const, confirmedByMembershipId: DEMO_MEMBERSHIP_ID, rateProvenance: { kind: "human_entered" as const, sourceRef: "synthetic:audit", sourceHash: hash, rateVersion: "audit.v1" } };
    const variations = new VariationRepository(runtime);
    const input = { proposal, actorMembershipId: DEMO_MEMBERSHIP_ID, price, deviceId: null, deviceCapturedAt: null };
    if (review) await variations.addFinalReviewExtra(auth.context, { ...input, version: "final-review-extra.v1" });
    else await variations.logBuilderExtra(auth.context, { ...input, version: "log-builder-extra.v1" });
    const row = (await admin.query("SELECT r.id,r.content_hash FROM app.variation v JOIN app.variation_revision r ON(r.tenant_id,r.id)=(v.tenant_id,v.current_revision_id) WHERE v.tenant_id=$1 AND v.id=$2", [DEMO_TENANT_ID, proposal.id])).rows[0];
    const revision = priceVariation({ id: row.id, variationId: proposal.id, previous: null, proposal, description: proposal.description, contentHash: row.content_hash, confirmed: price });
    const approval = approveVariation(revision, { id: randomUUID(), revisionId: revision.id, revision: revision.revision, contentHash: revision.contentHash, signedDeltaPence: revision.signedDeltaPence, method: "builder_attestation", actorMembershipId: DEMO_MEMBERSHIP_ID, evidenceId: null, approvedAt: new Date() });
    return { id: proposal.id, approve: () => withTenant(runtime, auth.context, db => approvePricedVariation(db, DEMO_TENANT_ID, proposal.id, approval)) };
  }
  const addApprovedExtra = async (net = 40000, review = false) => {
    const extra = await stageExtra(net, review); await extra.approve(); return extra.id;
  };
  return { app, jobId, auth, assemble, command, addApprovedExtra, stageExtra };
}

describe("audit final-account freshness (PostgreSQL, dispatcher/CI only)", () => {
  it.each([false, true])("lock rejects an account assembled before a captured variation was approved (final review %s)", async review => {
    const f = await fixture(), original = await f.assemble();
    expect(original.revision).toBe(1); expect(original.totals.net.pence).toBe(3360000);
    const extra = await f.addApprovedExtra(40000, review), stale = f.command(original);
    await expect(f.app.lock(f.jobId, stale)).rejects.toMatchObject({ code: "STALE_REVISION" });
    for (const table of ["final_account_lock", "command_receipt"]) {
      expect((await admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1 AND command_id=$2`, [DEMO_TENANT_ID, stale.commandId])).rows[0].n).toBe(0);
    }
    expect((await admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='final_account.locked'", [DEMO_TENANT_ID, f.jobId])).rows[0].n).toBe(0);
    const rebuilt = await f.assemble(); expect(rebuilt.revision).toBe(2);
    const command = f.command(rebuilt);
    const [lock, duplicate] = await Promise.all([f.app.lock(f.jobId, command), f.app.lock(f.jobId, command)]);
    expect(duplicate).toEqual(lock);
    expect(lock.snapshot.captureRegister.map((c: { id: string }) => c.id)).toContain(extra);
    expect(await f.app.lock(f.jobId, command)).toEqual(lock);
    // Explicit completion fixture, not a detector or live reconciliation run.
    await withTenant(admin, f.auth.context, db => db.$client.query("INSERT INTO app.final_account_lock_check(tenant_id,job_id,id,lock_id,evidence_cutoff_at,status) SELECT tenant_id,job_id,$1,id,locked_at,'completed' FROM app.final_account_lock WHERE tenant_id=$2 AND job_id=$3", [randomUUID(), DEMO_TENANT_ID, f.jobId]));
    await f.app.issueInvoice(f.jobId, { version: "lock-bound-invoice.issue.v1", commandId: randomUUID(), finalAccountRevisionId: rebuilt.id, expectedSourceHash: rebuilt.sourceHash, invoiceKind: "final", recipient: "practice-customer@example.invalid", issuedOn: "2026-10-13" });
    expect((await admin.query("SELECT net_pence::text net,tax_pence::text vat,total_pence::text gross FROM app.customer_invoice WHERE tenant_id=$1 AND job_id=$2", [DEMO_TENANT_ID, f.jobId])).rows).toEqual([{ net: "3400000", vat: "680000", gross: "4080000" }]);
  });

  it("a priced capture may be omitted, and its later approval cannot invalidate historical lock replay", async () => {
    const f = await fixture(), extra = await f.stageExtra(), account = await f.assemble();
    expect(account.totals.net.pence).toBe(3360000);
    const command = f.command(account), lock = await f.app.lock(f.jobId, command);
    await extra.approve();
    expect(await f.app.lock(f.jobId, command)).toEqual(lock);
    expect((await admin.query("SELECT count(*)::int n FROM app.final_account_lock WHERE tenant_id=$1 AND job_id=$2", [DEMO_TENANT_ID, f.jobId])).rows[0].n).toBe(1);
  });

  it("rejects a revision retaining a variation that is no longer approved", async () => {
    const f = await fixture(), extra = await f.addApprovedExtra(), account = await f.assemble();
    await new VariationRepository(runtime).transact(f.auth.context, db => new VariationRepository(runtime).reject(db, DEMO_TENANT_ID, { id: randomUUID(), variationId: extra, revisionId: account.lines.find(l => l.kind === "variation")!.commercialRevisionId, actorMembershipId: DEMO_MEMBERSHIP_ID }));
    await expect(f.app.lock(f.jobId, f.command(account))).rejects.toMatchObject({ code: "STALE_REVISION" });
  });
});
