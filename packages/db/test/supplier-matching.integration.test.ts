import { testTenantContext } from "./tenant-context-test-utils.js";
import { importWatchdogFixtureJob } from "./watchdog-fixtures.js";
import{randomUUID}from"node:crypto";import{mkdtemp,rm}from"node:fs/promises";import{tmpdir}from"node:os";import{join}from"node:path";import EmbeddedPostgres from"embedded-postgres";import{Pool}from"pg";import{afterAll,beforeAll,describe,expect,it}from"vitest";import{DiscrepancyRepository,MaterialRepository,migrate,PurchaseOrderRepository,SupplierDocumentRepository,SupplierMatchRepository,withTenant}from"../src/index.js";import{closeTestPools, freePort, installLegacySyntheticPartyFixtures}from"./pool-test-utils.js";
let pg:EmbeddedPostgres,admin:Pool,runtime:Pool,dir:string;const tenant=randomUUID(),other=randomUUID(),job=randomUUID(),wrongJob=randomUUID(),scope=randomUUID(),ctx=testTenantContext(tenant);
beforeAll(async()=>{dir=await mkdtemp(join(tmpdir(),"jg-supplier-match-"));const port=await freePort(60000,40);pg=new EmbeddedPostgres({databaseDir:dir,port,user:"postgres",password:"synthetic",persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C","--encoding=UTF8"],onLog:()=>undefined});await pg.initialise();await pg.start();admin=new Pool({host:"127.0.0.1",port,database:"postgres",user:"postgres",password:"synthetic"});await migrate(admin);await installLegacySyntheticPartyFixtures(admin);await admin.query("INSERT INTO control_plane.tenant(id)VALUES($1),($2)",[tenant,other]);await importWatchdogFixtureJob(admin,tenant,job);await importWatchdogFixtureJob(admin,tenant,wrongJob);await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state)VALUES($1,$2,$3,'confirmed')",[scope,tenant,job]);await admin.query("CREATE ROLE supplier_match_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;GRANT jobguard_runtime TO supplier_match_login");runtime=new Pool({host:"127.0.0.1",port,database:"postgres",user:"supplier_match_login",password:"synthetic"});const materials=new MaterialRepository(runtime),rate=await materials.addRate(ctx,{merchantName:"Fictional supplier",sku:"MAT-B",description:"Synthetic item",pricePence:2000,priceUnit:"each",taxBasis:"net",effectiveFrom:"2026-09-20",sourceLabel:"materials-B",expectedVersion:0}),req=await materials.addRequirement(ctx,{jobId:job,scopeItemId:scope,skuId:rate.skuId,quantity:"10",unit:"each",expectedRevision:0});await new PurchaseOrderRepository(runtime).revise(ctx,job,{version:"purchase-order-draft.v1",requirementId:req.id,quantity:"10",unitPricePence:2000,recipient:"orders@fictional-merchant.invalid",requiredDate:"2026-10-01",expectedRevision:0});const docs=new SupplierDocumentRepository(runtime);await docs.intake(ctx,job,{version:"supplier-document-intake.v1",fixtureId:"materials-B-delivery",channel:"picker",expectedRevision:0});await docs.intake(ctx,job,{version:"supplier-document-intake.v1",fixtureId:"materials-B-invoice",channel:"picker",expectedRevision:1});const view=await docs.view(ctx,job);await docs.confirm(ctx,job,{version:"supplier-fact-correction.v1",documentId:view.facts[0].document_id,commandId:randomUUID(),documentType:"invoice",quantity:"10",unitPricePence:2500,netPence:25000,expectedRevision:0})},60000);afterAll(async()=>{await closeTestPools(runtime,admin);await pg.stop();await rm(dir,{recursive:true,force:true})});
describe("three-way supplier matching",()=>{it("reproduces the match digest, preserves revisions and rejects stale/double allocations",async()=>{const repo=new SupplierMatchRepository(runtime),first=await repo.create(ctx,job,{commandId:randomUUID(),expectedRevision:0}),again=await repo.create(ctx,job,{commandId:randomUUID(),expectedRevision:1});expect(first.proposal).toMatchObject({ordered:"10 each",received:"8 each",billed:"10 each",state:"matched"});expect(again.proposal.digest).toBe(first.proposal.digest);const p=first.proposal;await expect(repo.correct(ctx,job,{version:"supplier-match-correction.v1",commandId:randomUUID(),proposalId:p.id,expectedRevision:0,orderVersionId:p.orderVersionId,receiptVersionIds:p.receiptVersionIds,billVersionId:p.billVersionId,allocations:[{receiptVersionId:p.receiptVersionIds[0],quantity:"8"}]})).rejects.toThrow("MATCH_REVISION_CONFLICT");await expect(repo.correct(ctx,job,{version:"supplier-match-correction.v1",commandId:randomUUID(),proposalId:p.id,expectedRevision:1,orderVersionId:p.orderVersionId,receiptVersionIds:p.receiptVersionIds,billVersionId:p.billVersionId,allocations:[{receiptVersionId:p.receiptVersionIds[0],quantity:"4"},{receiptVersionId:p.receiptVersionIds[0],quantity:"4"}]})).rejects.toThrow("RECEIVED_QUANTITY_ALREADY_ALLOCATED");const corrected=await repo.correct(ctx,job,{version:"supplier-match-correction.v1",commandId:randomUUID(),proposalId:p.id,expectedRevision:1,orderVersionId:p.orderVersionId,receiptVersionIds:p.receiptVersionIds,billVersionId:p.billVersionId,allocations:[{receiptVersionId:p.receiptVersionIds[0],quantity:"8"}]});expect(corrected.history).toHaveLength(2);expect(corrected.history[0].payload_hash).not.toBe(corrected.history[1].payload_hash);expect(Number((await admin.query("SELECT count(*) n FROM app.purchase_order_placement WHERE tenant_id=$1",[tenant])).rows[0].n)).toBe(0);expect(Number((await admin.query("SELECT count(*) n FROM app.customer_payment WHERE tenant_id=$1",[tenant])).rows[0].n)).toBe(0)});it("enforces RLS, wrong-job FKs and immutable runtime grants",async()=>{const catalogs=await admin.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,r.rolname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner WHERE n.nspname='app' AND c.relname IN('supplier_match_proposal','supplier_match_revision','supplier_match_allocation')`);expect(catalogs.rows).toHaveLength(3);expect(catalogs.rows.every(x=>x.relrowsecurity&&x.relforcerowsecurity&&x.rolname==='jobguard_migration')).toBe(true);await expect(withTenant(runtime,ctx,db=>db.$client.query("UPDATE app.supplier_match_revision SET revision=9"))).rejects.toMatchObject({code:"42501"});await expect(withTenant(runtime,ctx,db=>db.$client.query("DELETE FROM app.supplier_match_proposal"))).rejects.toMatchObject({code:"42501"});const row=(await admin.query("SELECT * FROM app.supplier_match_proposal WHERE tenant_id=$1",[tenant])).rows[0];await expect(withTenant(runtime,ctx,db=>db.$client.query(`INSERT INTO app.supplier_match_proposal(id,tenant_id,job_id,digest,state,order_revision_id,receipt_version_ids,bill_revision_id,actor_ref,subject_ref,payload_hash,audit_event_id)VALUES($1,$2,$3,$4,'matched',$5,$6,$7,'x',$3,$4,$8)`,[randomUUID(),tenant,wrongJob,"f".repeat(64),row.order_revision_id,row.receipt_version_ids,row.bill_revision_id,row.audit_event_id]))).rejects.toMatchObject({code:"23503"});await expect(withTenant(runtime,ctx,db=>db.$client.query(`INSERT INTO app.supplier_match_proposal(id,tenant_id,job_id,digest,state,order_revision_id,receipt_version_ids,bill_revision_id,actor_ref,subject_ref,payload_hash,audit_event_id)VALUES($1,$2,$3,$4,'matched',$5,$6,$7,'x',$3,$4,$8)`,[randomUUID(),other,job,"e".repeat(64),row.order_revision_id,row.receipt_version_ids,row.bill_revision_id,row.audit_event_id]))).rejects.toMatchObject({code:"42501"})});it("persists cited discrepancy decisions and denies mutation, cross-tenant and wrong-job writes",async()=>{const repo=new DiscrepancyRepository(runtime),result=await repo.evaluate(ctx,job,{commandId:randomUUID(),ruleRevision:"supplier-overcharge.v1"});expect(result.finding).toMatchObject({pricePence:5000,quantityPence:4000,totalPence:9000,state:"actionable"});await expect(withTenant(runtime,ctx,db=>db.$client.query("UPDATE app.discrepancy_finding_revision SET total_pence=0"))).rejects.toMatchObject({code:"42501"});await expect(withTenant(runtime,ctx,db=>db.$client.query("DELETE FROM app.discrepancy_finding_revision"))).rejects.toMatchObject({code:"42501"});const row=(await admin.query("SELECT * FROM app.discrepancy_finding_revision WHERE tenant_id=$1",[tenant])).rows[0];await expect(withTenant(runtime,ctx,db=>db.$client.query(`INSERT INTO app.discrepancy_finding_revision(id,tenant_id,job_id,command_id,revision,rule_revision,source_document_id,source_version_id,match_revision_id,state,price_pence,quantity_pence,total_pence,actor_ref,subject_ref,payload_hash,audit_event_id)VALUES($1,$2,$3,$4,99,'x',$5,$6,$7,'actionable',1,1,2,'x',$3,$8,$9)`,[randomUUID(),tenant,wrongJob,randomUUID(),row.source_document_id,row.source_version_id,row.match_revision_id,"a".repeat(64),row.audit_event_id]))).rejects.toMatchObject({code:"23503"});await expect(withTenant(runtime,ctx,db=>db.$client.query(`INSERT INTO app.discrepancy_review_outcome(id,tenant_id,job_id,finding_id,command_id,revision,outcome,reason,actor_ref,subject_ref,payload_hash,audit_event_id)VALUES($1,$2,$3,$4,$5,1,'dismissed','x','x',$4,$6,$7)`,[randomUUID(),other,job,row.id,randomUUID(),"b".repeat(64),row.audit_event_id]))).rejects.toMatchObject({code:"42501"})});});

// Each audit scenario gets its own live synthetic job, leaving the original fixtures/assertions unchanged.
async function auditFixture() {
  const jobId = randomUUID();
  await importWatchdogFixtureJob(admin, tenant, jobId);
  const materials = new MaterialRepository(runtime), orders = new PurchaseOrderRepository(runtime);
  async function addOrder(sku: string, unitPricePence: number) {
    const scopeId = randomUUID();
    await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state)VALUES($1,$2,$3,'confirmed')", [scopeId, tenant, jobId]);
    const rate = await materials.addRate(ctx, { merchantName: `Fictional audit ${jobId}`, sku,
      description: "Synthetic audit item", pricePence: unitPricePence, priceUnit: "each", taxBasis: "net",
      effectiveFrom: "2026-09-20", sourceLabel: "materials-B", expectedVersion: 0 });
    const requirement = await materials.addRequirement(ctx, { jobId, scopeItemId: scopeId, skuId: rate.skuId,
      quantity: "10", unit: "each", expectedRevision: 0 });
    const input = { version: "purchase-order-draft.v1" as const, requirementId: requirement.id,
      quantity: "10", unitPricePence, recipient: "orders@fictional-merchant.invalid",
      requiredDate: "2026-10-01", expectedRevision: 0 };
    return { order: await orders.revise(ctx, jobId, input), input };
  }
  const b = await addOrder("MAT-B", 2000), docs = new SupplierDocumentRepository(runtime);
  await docs.intake(ctx, jobId, { version: "supplier-document-intake.v1", fixtureId: "materials-B-delivery", channel: "picker", expectedRevision: 0 });
  await docs.intake(ctx, jobId, { version: "supplier-document-intake.v1", fixtureId: "materials-B-invoice", channel: "picker", expectedRevision: 1 });
  const view = await docs.view(ctx, jobId), documentId = view.facts[0].document_id;
  await docs.confirm(ctx, jobId, { version: "supplier-fact-correction.v1", documentId, commandId: randomUUID(),
    documentType: "invoice", quantity: "10", unitPricePence: 2500, netPence: 25000, expectedRevision: 0 });
  return { jobId, b, docs, orders, addOrder, documentId, matches: new SupplierMatchRepository(runtime) };
}
function auditCorrection(match: any, quantity = "8") {
  const p = match.proposal;
  return { version: "supplier-match-correction.v1" as const, commandId: randomUUID(), proposalId: p.id,
    expectedRevision: match.revision, orderVersionId: p.orderVersionId, receiptVersionIds: p.receiptVersionIds,
    billVersionId: p.billVersionId, allocations: [{ receiptVersionId: p.receiptVersionIds[0], quantity }] };
}
async function auditCounts(jobId: string) {
  return (await admin.query(`SELECT
    (SELECT count(*)::int FROM app.supplier_match_revision WHERE tenant_id=$1 AND job_id=$2) revisions,
    (SELECT count(*)::int FROM app.supplier_match_allocation WHERE tenant_id=$1 AND job_id=$2) allocations,
    (SELECT count(*)::int FROM app.audit_event WHERE tenant_id=$1) audits`, [tenant, jobId])).rows[0];
}
describe("AUDIT-FIX-API-FILE-SUPPLIER-MATCH PostgreSQL regressions", () => {
  it("matches only the current revision of each delivery", async () => {
    const f = await auditFixture();
    await f.docs.appendReceipt(ctx, f.jobId, { accepted: "6", rejected: "0", expectedRevision: 1 });
    const match = await f.matches.create(ctx, f.jobId, { commandId: randomUUID(), expectedRevision: 0 });
    expect(match.proposal.received).toBe("6 each");
    expect(match.proposal.receiptVersionIds).toHaveLength(1);
    const allocations = (await admin.query(`SELECT a.quantity_decimal::text quantity,r.revision
      FROM app.supplier_match_allocation a JOIN app.goods_receipt r ON(r.tenant_id,r.job_id,r.id)=(a.tenant_id,a.job_id,a.receipt_version_id)
      WHERE a.tenant_id=$1 AND a.job_id=$2`, [tenant, f.jobId])).rows;
    expect(allocations).toEqual([{ quantity: "6.000000", revision: 2 }]);
    const result = await new DiscrepancyRepository(runtime).evaluate(ctx, f.jobId, { commandId: randomUUID(), ruleRevision: "supplier-overcharge.v1" });
    expect(result.finding).toMatchObject({ pricePence: 5000, quantityPence: 8000, totalPence: 13000 });
  });
  it("an unrelated order revision cannot replace a delivery's order", async () => {
    const f = await auditFixture(), a = await f.addOrder("MAT-A", 10000);
    await f.orders.revise(ctx, f.jobId, { ...a.input, expectedRevision: 1 });
    await f.orders.revise(ctx, f.jobId, { ...a.input, expectedRevision: 2 });
    const match = await f.matches.create(ctx, f.jobId, { commandId: randomUUID(), expectedRevision: 0 });
    expect(match.proposal.orderVersionId).toBe(f.b.order.id);
    const result = await new DiscrepancyRepository(runtime).evaluate(ctx, f.jobId, { commandId: randomUUID(), ruleRevision: "supplier-overcharge.v1" });
    expect(result.finding).toMatchObject({ pricePence: 5000, quantityPence: 4000, totalPence: 9000 });
  });
  it("rejects allocations outside the declared receipt versions", async () => {
    const f = await auditFixture(), match = await f.matches.create(ctx, f.jobId, { commandId: randomUUID(), expectedRevision: 0 });
    await f.docs.appendReceipt(ctx, f.jobId, { accepted: "10", rejected: "0", expectedRevision: 1 });
    const r2 = (await admin.query("SELECT id FROM app.goods_receipt WHERE tenant_id=$1 AND job_id=$2 AND revision=2", [tenant, f.jobId])).rows[0].id;
    const before = await auditCounts(f.jobId);
    await expect(f.matches.correct(ctx, f.jobId, { ...auditCorrection(match), allocations: [{ receiptVersionId: r2, quantity: "10" }] }))
      .rejects.toThrow("MATCH_SOURCE_VERSION_CONFLICT");
    expect(await auditCounts(f.jobId)).toEqual(before);
    expect(await f.matches.view(ctx, f.jobId)).toEqual(match);
  });
  it("a replacement proposal accepts correction at its returned revision", async () => {
    const f = await auditFixture(), original = await f.matches.create(ctx, f.jobId, { commandId: randomUUID(), expectedRevision: 0 });
    const corrected = await f.matches.correct(ctx, f.jobId, auditCorrection(original, "6"));
    await f.docs.confirm(ctx, f.jobId, { version: "supplier-fact-correction.v1", documentId: f.documentId,
      commandId: randomUUID(), documentType: "invoice", quantity: "10", unitPricePence: 2400, netPence: 24000, expectedRevision: 1 });
    const replacement = await f.matches.create(ctx, f.jobId, { commandId: randomUUID(), expectedRevision: corrected.revision });
    expect(replacement.proposal.id).not.toBe(original.proposal.id);
    expect(replacement.revision).toBe(3);
    expect(replacement.history).toHaveLength(1);
    const next = await f.matches.correct(ctx, f.jobId, auditCorrection(replacement, "6"));
    expect(next.revision).toBe(replacement.revision + 1);
    expect(next.history).toHaveLength(replacement.history.length + 1);
    expect(next.proposal.received).toBe("6 each");
    await expect(f.matches.correct(ctx, f.jobId, auditCorrection(replacement, "6"))).rejects.toThrow("MATCH_REVISION_CONFLICT");
  });
});
