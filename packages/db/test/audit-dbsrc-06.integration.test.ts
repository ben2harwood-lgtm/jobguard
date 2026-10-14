import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { beforeAll, afterAll, expect, it } from "vitest";
import { priceVariation, approveVariation, type VariationProposal, type VariationRevision } from "@jobguard/core";
import { FinalAccountCommandService, VariationRepository, insertPricedVariation, approvePricedVariation, migrate, withTenant } from "../src/index.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { freePort, closeTestPools, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";

let postgres: EmbeddedPostgres | undefined, admin: Pool, runtime: Pool, directory: string;
const tenantId = randomUUID(), actorMembershipId = randomUUID(), identityId = randomUUID(), hash = "a".repeat(64);
const context = testTenantContext(tenantId);
beforeAll(async () => {
 directory = await mkdtemp(join(tmpdir(), "audit-dbsrc-06-")); const port = await freePort(57700, 300);
 postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: "synthetic", persistent: false,
  createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
 await postgres.initialise(); await postgres.start();
 admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic" });
 await migrate(admin); await installLegacySyntheticPartyFixtures(admin);
 await admin.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [tenantId]);
 await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)", [identityId]);
 const accountId = randomUUID();
 await admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional audit builder')", [accountId, tenantId]);
 await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [actorMembershipId, tenantId, accountId, identityId]);
 // Disposable database only: use the existing runtime role, without adding any grant.
 await admin.query("ALTER ROLE jobguard_runtime LOGIN PASSWORD 'synthetic' NOSUPERUSER NOBYPASSRLS");
 runtime = new Pool({ host: "127.0.0.1", port, user: "jobguard_runtime", password: "synthetic", database: "postgres" });
}, 60000);
afterAll(async () => { await closeTestPools(runtime, admin); await postgres?.stop(); if (directory) await rm(directory, { recursive: true, force: true }); });

async function fixture() {
 const jobId = randomUUID(), scopeId = randomUUID(), scopeRevisionId = randomUUID(), quoteDraftId = randomUUID(), quoteRevisionId = randomUUID(), baselineId = randomUUID();
 // Establish a frozen fictional quote and its original scope; all tested changes then use repository commands.
 await withTenant(admin, context, async db => {
  await db.$client.query("INSERT INTO app.job(id,tenant_id,title,status) VALUES($1,$2,'Fictional final account audit','live')", [jobId, tenantId]);
  await db.$client.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [scopeId, tenantId, jobId]);
  await db.$client.query("INSERT INTO app.scope_revision(id,tenant_id,job_id,scope_item_id,revision,description,quantity_decimal,unit,unit_price_pence,total_pence) VALUES($1,$2,$3,$4,1,'Fictional baseline','1','item',10000,10000)", [scopeRevisionId, tenantId, jobId, scopeId]);
  await db.$client.query("INSERT INTO app.quote_draft(id,tenant_id,job_id) VALUES($1,$2,$3)", [quoteDraftId, tenantId, jobId]);
  await db.$client.query("INSERT INTO app.quote_revision(id,tenant_id,job_id,quote_draft_id,revision,currency,tax_policy_version,subtotal_pence,discount_pence,net_pence,tax_pence,total_pence,issuable,blockers) VALUES($1,$2,$3,$4,1,'GBP','candidate_m1_standard_v1',10000,0,10000,2000,12000,true,'[]')", [quoteRevisionId, tenantId, jobId, quoteDraftId]);
  await db.$client.query("INSERT INTO app.quote_line(id,tenant_id,job_id,quote_revision_id,scope_item_id,scope_revision_id,origin,description,included,quantity_decimal,unit,unit_rate_pence,discount_decimal,tax_treatment,rate_provenance,ordinal) VALUES($1,$2,$3,$4,$5,$6,'captured','Fictional baseline',true,'1','item',10000,'0','standard_rate_20','entered',1)", [randomUUID(), tenantId, jobId, quoteRevisionId, scopeId, scopeRevisionId]);
  await db.$client.query("INSERT INTO app.quote_document_version(id,tenant_id,job_id,quote_revision_id,document_version,reference,content_hash,object_key,object_version_id,pdf_byte_length,issuer,customer,snapshot) VALUES($1,$2,$3,$4,1,'SYN-AUDIT',$5,'fictional/quote','fictional-v1',1,'{}','{}',$6::jsonb)", [baselineId, tenantId, jobId, quoteRevisionId, hash, JSON.stringify({netPence:10000,totalPence:12000})]);
  await db.$client.query("INSERT INTO app.quote_version(id,tenant_id,job_id,version,content_hash,net_value_pence,status) VALUES($1,$2,$3,1,$4,10000,'accepted')", [baselineId, tenantId, jobId, hash]);
  await db.$client.query("UPDATE app.job SET baseline_quote_version_id=$1 WHERE tenant_id=$2 AND id=$3", [baselineId, tenantId, jobId]);
 });
 const accounts = new FinalAccountCommandService(runtime), variations = new VariationRepository(runtime);
 const assemble = () => accounts.assemble(context, { version: "final-account.assemble.v1", jobId, actorMembershipId, commandId: randomUUID() });
 const proposal: VariationProposal = { version: "variation-proposal.v1", id: randomUUID(), jobId, scopeItemId: randomUUID(), existingScopeItemId: null,
  lineageParentScopeItemId: scopeId, captureKind: "text", captureText: "Fictional extra", description: "Fictional extra", suggestion: null };
 const confirmed = (unitRatePence: number) => ({ quantity: "1", unit: "item", unitRatePence, direction: "addition" as const, confirmedByMembershipId: actorMembershipId,
  rateProvenance: { kind: "human_entered" as const, sourceRef: "synthetic://audit-dbsrc-06", sourceHash: hash, rateVersion: "synthetic.v1" } });
 const add = async () => {
  await variations.logBuilderExtra(context, { version: "log-builder-extra.v1", proposal, actorMembershipId, price: confirmed(5000), deviceId: null, deviceCapturedAt: null });
  return (await variations.read(context, jobId)).variations.find(v => v.id === proposal.id)!.currentRevisionId!;
 };
 const approve = async (revisionId: string) => {
  const view = (await variations.read(context, jobId)).variations.find(v => v.id === proposal.id)!, r = view.revisions.find(r => r.id === revisionId)!;
  const approval = approveVariation({ ...r, variationId: proposal.id, scopeItemId: proposal.scopeItemId, previousRevisionId: null,
   confirmedByMembershipId: actorMembershipId, rateProvenance: confirmed(0).rateProvenance, state: "priced" } as unknown as VariationRevision,
   { id: randomUUID(), revisionId, revision: r.revision, contentHash: r.contentHash, signedDeltaPence: r.signedDeltaPence, method: "builder_attestation", actorMembershipId, evidenceId: null, approvedAt: new Date() });
  return variations.transact(context, db => approvePricedVariation(db, tenantId, proposal.id, approval));
 };
 const reprice = async (previous: VariationRevision, pence: number) => {
  const revision = priceVariation({ id: randomUUID(), variationId: proposal.id, previous, proposal, description: "Fictional pending price", contentHash: "b".repeat(64), confirmed: confirmed(pence) });
  await variations.transact(context, db => insertPricedVariation(db, tenantId, revision)); return revision;
 };
 const currentRevision = async () => {
  const v = (await variations.read(context, jobId)).variations.find(v => v.id === proposal.id)!, r = v.revisions.find(r => r.id === v.currentRevisionId)!;
  return { ...r, variationId: v.id, scopeItemId: v.scopeItemId, previousRevisionId: null, confirmedByMembershipId: actorMembershipId, rateProvenance: confirmed(0).rateProvenance, state: "priced" } as unknown as VariationRevision;
 };
 return { jobId, accounts, variations, proposal, assemble, add, approve, reprice, currentRevision };
}

it("rebuild after rejecting an extra makes the corrected account current", async () => {
 const f = await fixture(), first = await f.assemble(), revisionId = await f.add();
 await f.approve(revisionId); expect((await f.assemble()).totals.net.pence).toBe(15000);
 await f.variations.transact(context, db => f.variations.reject(db, tenantId, { id: randomUUID(), variationId: f.proposal.id, revisionId, actorMembershipId }));
 const corrected = await f.assemble(), current = await f.accounts.read(context, f.jobId);
 expect(corrected.id).toBe(first.id); expect(current?.id).toBe(corrected.id); expect(current?.revision).toBe(corrected.revision);
 expect(current?.totals.net.pence).toBe(10000); expect(current?.lines.filter(l => l.kind === "variation")).toEqual([]);
 const next = await f.reprice(await f.currentRevision(), 8000); await f.approve(next.id);
 const rebuilt = await f.assemble(); expect(rebuilt.revision).toBe(3); expect(rebuilt.totals.net.pence).toBe(18000);
 expect((await f.assemble()).id).toBe(rebuilt.id);
 expect((await admin.query("SELECT count(*)::int n FROM app.final_account_revision WHERE tenant_id=$1 AND job_id=$2", [tenantId, f.jobId])).rows[0].n).toBe(3);
});

it("pending repricing preserves the last approved commercial revision", async () => {
 const f = await fixture(), approvedId = await f.add(); await f.approve(approvedId);
 const initial = await f.assemble(), pending = await f.reprice(await f.currentRevision(), 7000), rebuilt = await f.assemble();
 expect(rebuilt.id).toBe(initial.id); expect(rebuilt.totals.net.pence).toBe(15000);
 expect(rebuilt.lines.filter(l => l.kind === "variation")).toMatchObject([{ sourceId: approvedId, commercialRevisionId: approvedId, netPence: 5000 }]);
 expect((await f.accounts.read(context, f.jobId))?.pending).toMatchObject([{ sourceId: pending.id, netPence: 7000 }]);
 await f.approve(pending.id);
 const repriced = await f.assemble(); expect(repriced.totals.net.pence).toBe(17000);
 expect(repriced.lines.filter(l => l.kind === "variation")).toMatchObject([{ sourceId: pending.id, netPence: 7000 }]);
 expect(repriced.lines.filter(l => l.kind === "variation")).toHaveLength(1);
 await expect(f.accounts.read(testTenantContext(randomUUID()), f.jobId)).resolves.toBeNull();
});
