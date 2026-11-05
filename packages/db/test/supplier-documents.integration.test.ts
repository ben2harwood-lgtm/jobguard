import { testTenantContext } from "./tenant-context-test-utils.js";
import { importWatchdogFixtureJob } from "./watchdog-fixtures.js";
import{randomUUID}from"node:crypto";import{mkdtemp,rm}from"node:fs/promises";import{tmpdir}from"node:os";import{join}from"node:path";import EmbeddedPostgres from"embedded-postgres";import{Pool}from"pg";import{afterAll,beforeAll,describe,expect,it}from"vitest";import{MaterialRepository,migrate,PurchaseOrderRepository,SupplierDocumentRepository,withTenant}from"../src/index.js";import{closeTestPools, freePort, installLegacySyntheticPartyFixtures}from"./pool-test-utils.js";
let pg:EmbeddedPostgres,admin:Pool,runtime:Pool,dir:string;const tenant=randomUUID(),other=randomUUID(),job=randomUUID(),wrongJob=randomUUID(),scope=randomUUID(),ctx=testTenantContext(tenant);
beforeAll(async()=>{dir=await mkdtemp(join(tmpdir(),"jg-supplier-docs-"));const port=await freePort(59950,40);pg=new EmbeddedPostgres({databaseDir:dir,port,user:"postgres",password:"synthetic",persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C","--encoding=UTF8"],onLog:()=>undefined});await pg.initialise();await pg.start();admin=new Pool({host:"127.0.0.1",port,database:"postgres",user:"postgres",password:"synthetic"});await migrate(admin);await installLegacySyntheticPartyFixtures(admin);await admin.query("INSERT INTO control_plane.tenant(id)VALUES($1),($2)",[tenant,other]);await importWatchdogFixtureJob(admin,tenant,job);await importWatchdogFixtureJob(admin,tenant,wrongJob);await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state)VALUES($1,$2,$3,'confirmed')",[scope,tenant,job]);await admin.query("CREATE ROLE supplier_docs_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;GRANT jobguard_runtime TO supplier_docs_login");runtime=new Pool({host:"127.0.0.1",port,database:"postgres",user:"supplier_docs_login",password:"synthetic"});const materials=new MaterialRepository(runtime),rate=await materials.addRate(ctx,{merchantName:"Fictional supplier",sku:"MAT-B",description:"Synthetic item",pricePence:2000,priceUnit:"each",taxBasis:"net",effectiveFrom:"2026-09-20",sourceLabel:"materials-B",expectedVersion:0});const req=await materials.addRequirement(ctx,{jobId:job,scopeItemId:scope,skuId:rate.skuId,quantity:"10",unit:"each",expectedRevision:0});await new PurchaseOrderRepository(runtime).revise(ctx,job,{version:"purchase-order-draft.v1",requirementId:req.id,quantity:"10",unitPricePence:2000,recipient:"orders@fictional-merchant.invalid",requiredDate:"2026-10-01",expectedRevision:0})},60000);afterAll(async()=>{await closeTestPools(runtime,admin);await pg.stop();await rm(dir,{recursive:true,force:true})});
describe("supplier document intake",()=>{it("keeps originals immutable, detects duplicate bytes, holds bad sources and appends GRNs",async()=>{const repo=new SupplierDocumentRepository(runtime);await repo.intake(ctx,job,{version:"supplier-document-intake.v1",fixtureId:"materials-B-delivery",channel:"picker",expectedRevision:0});await repo.intake(ctx,job,{version:"supplier-document-intake.v1",fixtureId:"materials-B-invoice",channel:"picker",expectedRevision:1});await repo.intake(ctx,job,{version:"supplier-document-intake.v1",fixtureId:"materials-B-invoice",channel:"fixture_mail",alias:"materials@fictional-builder.invalid",expectedRevision:2});let view=await repo.view(ctx,job);expect(view.receipt).toMatchObject({ordered:"10",delivered:"10",accepted:"8",rejected:"0",missing:"2",revision:1});expect(view.lastIntake).toMatchObject({result:"duplicate",reason:"Possible duplicate — review the original"});expect(view.documents).toHaveLength(2);expect(view.documents.reduce((n,d)=>n+d.recognizedDebtPence,0)).toBe(0);expect(view.facts[0]).toMatchObject({quantity_decimal:"10",unit_price_pence:2500,net_pence:25000,source_page:1});const commandId=randomUUID();expect(await repo.confirm(ctx,job,{version:"supplier-fact-correction.v1",documentId:view.facts[0].document_id,commandId,documentType:"invoice",quantity:"10",unitPricePence:2500,netPence:25000,expectedRevision:0})).toMatchObject({revision:1,replayed:false});expect(await repo.confirm(ctx,job,{version:"supplier-fact-correction.v1",documentId:view.facts[0].document_id,commandId,documentType:"invoice",quantity:"10",unitPricePence:2500,netPence:25000,expectedRevision:0})).toMatchObject({revision:1,replayed:false});await repo.appendReceipt(ctx,job,{accepted:"1",rejected:"0",expectedRevision:1});view=await repo.view(ctx,job);expect(view.receipt?.revision).toBe(2);expect(Number((await admin.query("SELECT count(*) n FROM app.goods_receipt WHERE tenant_id=$1 AND job_id=$2",[tenant,job])).rows[0].n)).toBe(2);await repo.intake(ctx,job,{version:"supplier-document-intake.v1",fixtureId:"corrupt",channel:"picker",expectedRevision:3});expect((await repo.view(ctx,job)).lastIntake).toMatchObject({result:"held",reason:"Corrupt document"});await expect(repo.intake(ctx,job,{version:"supplier-document-intake.v1",fixtureId:"materials-B-invoice",channel:"fixture_mail",alias:"unknown@invalid",expectedRevision:4})).rejects.toThrow("UNKNOWN_FIXTURE_ALIAS")});it("enforces tenant/job boundaries and runtime restrictions",async()=>{const catalogs=await admin.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,r.rolname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner WHERE n.nspname='app' AND c.relname IN('supplier_document','supplier_document_version','supplier_document_intake','goods_receipt','supplier_fact_proposal','supplier_fact_revision')`);expect(catalogs.rows).toHaveLength(6);expect(catalogs.rows.every(x=>x.relrowsecurity&&x.relforcerowsecurity&&x.rolname==='jobguard_migration')).toBe(true);await expect(withTenant(runtime,ctx,db=>db.$client.query("UPDATE app.supplier_fact_revision SET origin='source'"))).rejects.toMatchObject({code:"42501"});await expect(withTenant(runtime,ctx,db=>db.$client.query("INSERT INTO app.supplier_document(id,tenant_id,job_id,supplier_context,document_type,content_hash,status)VALUES($1,$2,$3,'x','invoice',$4,'ready')",[randomUUID(),other,job,"0".repeat(64)]))).rejects.toMatchObject({code:"42501"})})});

it("retains the whole later-delivery position, replay identity, isolation and match allocation", async () => {
  const deliveryJob = randomUUID(), scopeId = randomUUID();
  await importWatchdogFixtureJob(admin, tenant, deliveryJob);
  await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state)VALUES($1,$2,$3,'confirmed')", [scopeId, tenant, deliveryJob]);
  const materials = new MaterialRepository(runtime);
  const rate = await materials.addRate(ctx, { merchantName: `Fictional later delivery ${deliveryJob}`, sku: "MAT-B",
    description: "Synthetic item", pricePence: 2000, priceUnit: "each", taxBasis: "net",
    effectiveFrom: "2026-09-20", sourceLabel: "materials-B", expectedVersion: 0 });
  const requirement = await materials.addRequirement(ctx, { jobId: deliveryJob, scopeItemId: scopeId,
    skuId: rate.skuId, quantity: "10", unit: "each", expectedRevision: 0 });
  await new PurchaseOrderRepository(runtime).revise(ctx, deliveryJob, { version: "purchase-order-draft.v1",
    requirementId: requirement.id, quantity: "10", unitPricePence: 2000,
    recipient: "orders@fictional-merchant.invalid", requiredDate: "2026-10-01", expectedRevision: 0 });
  const repo = new SupplierDocumentRepository(runtime);
  await repo.intake(ctx, deliveryJob, { version: "supplier-document-intake.v1", fixtureId: "materials-B-delivery", channel: "picker", expectedRevision: 0 });
  expect((await repo.view(ctx, deliveryJob)).receipt).toMatchObject({ revision: 1, accepted: "8", missing: "2", laterDelivered: "0" });
  const input = { commandId: randomUUID(), accepted: "9", rejected: "0", expectedRevision: 1 };
  const result = await repo.appendReceipt(ctx, deliveryJob, input);
  expect(await repo.appendReceipt(ctx, deliveryJob, input)).toEqual(result);
  expect((await repo.view(ctx, deliveryJob)).receipt).toMatchObject({ revision: 2, accepted: "9", missing: "1", laterDelivered: "1" });
  const revisions = (await admin.query("SELECT id,revision,accepted_quantity::text FROM app.goods_receipt WHERE tenant_id=$1 AND job_id=$2 ORDER BY revision", [tenant, deliveryJob])).rows;
  expect(revisions.map(r => Number(r.revision))).toEqual([1, 2]);
  expect(new Set(revisions.map(r => r.id)).size).toBe(2);
  expect(revisions.map(r => r.accepted_quantity)).toEqual(["8.000000", "9.000000"]);
  await expect(repo.appendReceipt(ctx, deliveryJob, { ...input, commandId: randomUUID() })).rejects.toThrow("STALE_GOODS_RECEIPT");
  expect((await repo.view(testTenantContext(other), deliveryJob)).receipt).toBeNull();
  expect((await repo.view(ctx, wrongJob)).receipt).toBeNull();
  await repo.intake(ctx, deliveryJob, { version: "supplier-document-intake.v1", fixtureId: "materials-B-invoice", channel: "picker", expectedRevision: 1 });
  const facts = (await repo.view(ctx, deliveryJob)).facts;
  await repo.confirm(ctx, deliveryJob, { version: "supplier-fact-correction.v1", documentId: facts[0].document_id,
    commandId: randomUUID(), documentType: "invoice", quantity: "10", unitPricePence: 2500, netPence: 25000, expectedRevision: 0 });
  const { SupplierMatchRepository } = await import("../src/index.js");
  const match = await new SupplierMatchRepository(runtime).create(ctx, deliveryJob, { commandId: randomUUID(), expectedRevision: 0 });
  expect(match.proposal.received).toBe("9 each");
  const allocations = (await admin.query("SELECT quantity_decimal::text FROM app.supplier_match_allocation WHERE tenant_id=$1 AND job_id=$2", [tenant, deliveryJob])).rows;
  expect(allocations).toHaveLength(1);
  expect(allocations[0].quantity_decimal).toBe("9.000000");
  await repo.appendReceipt(ctx, deliveryJob, { accepted: "8.125", rejected: "0.25", expectedRevision: 2 });
  expect((await repo.view(ctx, deliveryJob)).receipt).toMatchObject({ accepted: "8.125", rejected: "0.25", laterDelivered: "0.125" });
  await repo.appendReceipt(ctx, deliveryJob, { accepted: "7", rejected: "0", expectedRevision: 3 });
  expect((await repo.view(ctx, deliveryJob)).receipt).toMatchObject({ revision: 4, accepted: "7", missing: "3", laterDelivered: "0" });
});

it("refuses receipt totals above ordered including rejected stock without a persisted effect", async () => {
  const repo = new SupplierDocumentRepository(runtime);
  const before = await repo.view(ctx, job);
  const counts = async () => (await admin.query(`SELECT
    (SELECT count(*) FROM app.goods_receipt WHERE tenant_id=$1 AND job_id=$2) receipts,
    (SELECT count(*) FROM app.audit_event WHERE tenant_id=$1) audits`, [tenant, job])).rows[0];
  const priorCounts = await counts();
  for (const [accepted, rejected] of [["9", "2"], ["10", "0.000001"], ["10.000001", "0"]]) {
    await expect(repo.appendReceipt(ctx, job, { commandId: randomUUID(), accepted: accepted!, rejected: rejected!, expectedRevision: before.receipt!.revision }))
      .rejects.toMatchObject({ code: "ORDER_DELIVERY_EXCEEDS_ORDERED" });
    expect(await counts()).toEqual(priorCounts);
    expect((await repo.view(ctx, job)).receipt).toEqual(before.receipt);
  }
});
