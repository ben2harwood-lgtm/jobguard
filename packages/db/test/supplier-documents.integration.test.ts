import { createHash } from "node:crypto";
import { afterEach, vi } from "vitest";
import { supplierFixtures } from "@jobguard/core";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { importWatchdogFixtureJob } from "./watchdog-fixtures.js";
import{randomUUID}from"node:crypto";import{mkdtemp,rm}from"node:fs/promises";import{tmpdir}from"node:os";import{join}from"node:path";import EmbeddedPostgres from"embedded-postgres";import{Pool}from"pg";import{afterAll,beforeAll,describe,expect,it}from"vitest";import{MaterialRepository,migrate,PurchaseOrderRepository,SupplierDocumentRepository,withTenant}from"../src/index.js";import{closeTestPools, freePort, installLegacySyntheticPartyFixtures}from"./pool-test-utils.js";
let pg:EmbeddedPostgres,admin:Pool,runtime:Pool,dir:string;const tenant=randomUUID(),other=randomUUID(),job=randomUUID(),wrongJob=randomUUID(),scope=randomUUID(),ctx=testTenantContext(tenant);
beforeAll(async()=>{dir=await mkdtemp(join(tmpdir(),"jg-supplier-docs-"));const port=await freePort(59950,40);pg=new EmbeddedPostgres({databaseDir:dir,port,user:"postgres",password:"synthetic",persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C","--encoding=UTF8"],onLog:()=>undefined});await pg.initialise();await pg.start();admin=new Pool({host:"127.0.0.1",port,database:"postgres",user:"postgres",password:"synthetic"});await migrate(admin);await installLegacySyntheticPartyFixtures(admin);await admin.query("INSERT INTO control_plane.tenant(id)VALUES($1),($2)",[tenant,other]);await importWatchdogFixtureJob(admin,tenant,job);await importWatchdogFixtureJob(admin,tenant,wrongJob);await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state)VALUES($1,$2,$3,'confirmed')",[scope,tenant,job]);await admin.query("CREATE ROLE supplier_docs_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;GRANT jobguard_runtime TO supplier_docs_login");runtime=new Pool({host:"127.0.0.1",port,database:"postgres",user:"supplier_docs_login",password:"synthetic"});const materials=new MaterialRepository(runtime),rate=await materials.addRate(ctx,{merchantName:"Fictional supplier",sku:"MAT-B",description:"Synthetic item",pricePence:2000,priceUnit:"each",taxBasis:"net",effectiveFrom:"2026-09-20",sourceLabel:"materials-B",expectedVersion:0});const req=await materials.addRequirement(ctx,{jobId:job,scopeItemId:scope,skuId:rate.skuId,quantity:"10",unit:"each",expectedRevision:0});await new PurchaseOrderRepository(runtime).revise(ctx,job,{version:"purchase-order-draft.v1",requirementId:req.id,quantity:"10",unitPricePence:2000,recipient:"orders@fictional-merchant.invalid",requiredDate:"2026-10-01",expectedRevision:0})},60000);afterAll(async()=>{await closeTestPools(runtime,admin);await pg.stop();await rm(dir,{recursive:true,force:true})});
describe("supplier document intake",()=>{it("keeps originals immutable, detects duplicate bytes, holds bad sources and appends GRNs",async()=>{const repo=new SupplierDocumentRepository(runtime);await repo.intake(ctx,job,{version:"supplier-document-intake.v1",fixtureId:"materials-B-delivery",channel:"picker",expectedRevision:0});await repo.intake(ctx,job,{version:"supplier-document-intake.v1",fixtureId:"materials-B-invoice",channel:"picker",expectedRevision:1});await repo.intake(ctx,job,{version:"supplier-document-intake.v1",fixtureId:"materials-B-invoice",channel:"fixture_mail",alias:"materials@fictional-builder.invalid",expectedRevision:2});let view=await repo.view(ctx,job);expect(view.receipt).toMatchObject({ordered:"10",delivered:"10",accepted:"8",rejected:"0",missing:"2",revision:1});expect(view.lastIntake).toMatchObject({result:"duplicate",reason:"Possible duplicate — review the original"});expect(view.documents).toHaveLength(2);expect(view.documents.reduce((n,d)=>n+d.recognizedDebtPence,0)).toBe(0);expect(view.facts[0]).toMatchObject({quantity_decimal:"10",unit_price_pence:2500,net_pence:25000,source_page:1});const commandId=randomUUID();expect(await repo.confirm(ctx,job,{version:"supplier-fact-correction.v1",documentId:view.facts[0].document_id,commandId,documentType:"invoice",quantity:"10",unitPricePence:2500,netPence:25000,expectedRevision:0})).toMatchObject({revision:1,replayed:false});expect(await repo.confirm(ctx,job,{version:"supplier-fact-correction.v1",documentId:view.facts[0].document_id,commandId,documentType:"invoice",quantity:"10",unitPricePence:2500,netPence:25000,expectedRevision:0})).toMatchObject({revision:1,replayed:false});await repo.appendReceipt(ctx,job,{accepted:"1",rejected:"0",expectedRevision:1});view=await repo.view(ctx,job);expect(view.receipt?.revision).toBe(2);expect(Number((await admin.query("SELECT count(*) n FROM app.goods_receipt WHERE tenant_id=$1 AND job_id=$2",[tenant,job])).rows[0].n)).toBe(2);await repo.intake(ctx,job,{version:"supplier-document-intake.v1",fixtureId:"corrupt",channel:"picker",expectedRevision:3});expect((await repo.view(ctx,job)).lastIntake).toMatchObject({result:"held",reason:"Corrupt document"});await expect(repo.intake(ctx,job,{version:"supplier-document-intake.v1",fixtureId:"materials-B-invoice",channel:"fixture_mail",alias:"unknown@invalid",expectedRevision:4})).rejects.toThrow("UNKNOWN_FIXTURE_ALIAS")});it("enforces tenant/job boundaries and runtime restrictions",async()=>{const catalogs=await admin.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,r.rolname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner WHERE n.nspname='app' AND c.relname IN('supplier_document','supplier_document_version','supplier_document_intake','goods_receipt','supplier_fact_proposal','supplier_fact_revision')`);expect(catalogs.rows).toHaveLength(6);expect(catalogs.rows.every(x=>x.relrowsecurity&&x.relforcerowsecurity&&x.rolname==='jobguard_migration')).toBe(true);await expect(withTenant(runtime,ctx,db=>db.$client.query("UPDATE app.supplier_fact_revision SET origin='source'"))).rejects.toMatchObject({code:"42501"});await expect(withTenant(runtime,ctx,db=>db.$client.query("INSERT INTO app.supplier_document(id,tenant_id,job_id,supplier_context,document_type,content_hash,status)VALUES($1,$2,$3,'x','invoice',$4,'ready')",[randomUUID(),other,job,"0".repeat(64)]))).rejects.toMatchObject({code:"42501"})})});


afterEach(() => vi.unstubAllEnvs());

it.each([true, false])("retains a changed delivery for review without a receipt, with purchase order: %s", async withOrder => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  const heldJob = randomUUID();
  await importWatchdogFixtureJob(admin, tenant, heldJob);
  if (withOrder) {
    const scopeId = randomUUID(), materials = new MaterialRepository(runtime);
    await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [scopeId, tenant, heldJob]);
    const rate = await materials.addRate(ctx, { merchantName: "Fictional supplier", sku: `HELD-${heldJob}`,
      description: "Synthetic delivery item", pricePence: 2000, priceUnit: "each", taxBasis: "net",
      effectiveFrom: "2026-09-20", sourceLabel: "materials-B", expectedVersion: 0 });
    const requirement = await materials.addRequirement(ctx, { jobId: heldJob, scopeItemId: scopeId,
      skuId: rate.skuId, quantity: "10", unit: "each", expectedRevision: 0 });
    await new PurchaseOrderRepository(runtime).revise(ctx, heldJob, { version: "purchase-order-draft.v1",
      requirementId: requirement.id, quantity: "10", unitPricePence: 2000,
      recipient: "orders@fictional-merchant.invalid", requiredDate: "2026-10-01", expectedRevision: 0 });
  }
  const repo = new SupplierDocumentRepository(runtime);
  // Establish different ready bytes under DEL-MB-001 before the legacy receipt-producing fixture arrives.
  const canonical = await repo.intake(ctx, heldJob, { version: "supplier-document-intake.v1",
    fixtureId: "merchant-changed-delivery", channel: "fixture_portal", expectedRevision: 0 });
  expect(canonical.result).toBe("ready");
  const input = { version: "supplier-document-intake.v1" as const, commandId: randomUUID(),
    fixtureId: "materials-B-delivery" as const, channel: "fixture_portal" as const, expectedRevision: 1 };
  const held = await repo.intake(ctx, heldJob, input);
  expect(held.result).toBe("held");
  expect(held.documentId).not.toBe(canonical.documentId);
  const fixture = supplierFixtures["materials-B-delivery"];
  const hash = createHash("sha256").update(fixture.bytes).digest("hex");
  const original = (await admin.query(
    "SELECT version,media_type,byte_length,content_hash,page_count FROM app.supplier_document_version WHERE tenant_id=$1 AND job_id=$2 AND document_id=$3",
    [tenant, heldJob, held.documentId])).rows;
  expect(original).toEqual([{ version: 1, media_type: fixture.media, byte_length: Buffer.byteLength(fixture.bytes),
    content_hash: hash, page_count: fixture.pages }]);
  const view = await repo.view(ctx, heldJob);
  expect(view.documents.find(d => d.id === held.documentId)).toMatchObject({ status: "held",
    hold_reason: "Merchant review: changed_document", content_hash: hash, canonical_document_id: canonical.documentId });
  expect((await admin.query(
    "SELECT result,reason,canonical_document_id FROM app.supplier_document_intake WHERE tenant_id=$1 AND job_id=$2 AND document_id=$3",
    [tenant, heldJob, held.documentId])).rows).toEqual([{ result: "held", reason: "Merchant review: changed_document",
    canonical_document_id: canonical.documentId }]);
  const events = async () => (await admin.query(
    "SELECT id,payload FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='merchant_document.review_required' ORDER BY sequence",
    [tenant, heldJob])).rows;
  const review = await events();
  expect(review).toHaveLength(1);
  expect(review[0].payload).toMatchObject({ references: { documentId: held.documentId }, hashes: { contentHash: hash } });
  const receipts = async () => (await admin.query("SELECT id FROM app.goods_receipt WHERE tenant_id=$1 AND job_id=$2", [tenant, heldJob])).rows;
  expect(await receipts()).toEqual([]);
  expect(view.receipt).toBeNull();
  // Exact command replay must not append another intake, original, audit event or receipt.
  expect(await repo.intake(ctx, heldJob, input)).toEqual(held);
  expect((await repo.view(ctx, heldJob)).intakeRevision).toBe(2);
  expect(await events()).toEqual(review);
  expect(await receipts()).toEqual([]);
  expect((await admin.query("SELECT count(*)::int n FROM app.supplier_document_version WHERE tenant_id=$1 AND job_id=$2 AND document_id=$3",
    [tenant, heldJob, held.documentId])).rows).toEqual([{ n: 1 }]);
  // A fresh arrival of the same held bytes still deduplicates without recording delivery.
  const duplicate = await repo.intake(ctx, heldJob, { ...input, commandId: randomUUID(), expectedRevision: 2 });
  expect(duplicate).toMatchObject({ documentId: held.documentId, result: "duplicate" });
  expect(await receipts()).toEqual([]);
});

it("still refuses a ready delivery without a purchase order and rolls back its intake", async () => {
  const readyJob = randomUUID(), repo = new SupplierDocumentRepository(runtime);
  await importWatchdogFixtureJob(admin, tenant, readyJob);
  await expect(repo.intake(ctx, readyJob, { version: "supplier-document-intake.v1", commandId: randomUUID(),
    fixtureId: "materials-B-delivery", channel: "picker", expectedRevision: 0 })).rejects.toThrow("PURCHASE_ORDER_REQUIRED");
  const view = await repo.view(ctx, readyJob);
  expect(view.documents).toEqual([]);
  expect(view.intakeRevision).toBe(0);
  expect(view.receipt).toBeNull();
});
