import { testTenantContext } from "./tenant-context-test-utils.js";
import { importWatchdogFixtureJob } from "./watchdog-fixtures.js";
import{randomUUID}from"node:crypto";import{mkdtemp,rm}from"node:fs/promises";import{tmpdir}from"node:os";import{join}from"node:path";import EmbeddedPostgres from"embedded-postgres";import{Pool}from"pg";import{afterAll,beforeAll,describe,expect,it}from"vitest";import{MaterialRepository,migrate,PurchaseOrderRepository,withTenant}from"../src/index.js";import{closeTestPools, freePort, installLegacySyntheticPartyFixtures}from"./pool-test-utils.js";
let pg:EmbeddedPostgres,admin:Pool,runtime:Pool,dir:string;const tenant=randomUUID(),other=randomUUID(),job=randomUUID(),wrongJob=randomUUID(),scope=randomUUID(),member=randomUUID();const ctx=testTenantContext(tenant);
beforeAll(async()=>{dir=await mkdtemp(join(tmpdir(),"jg-materials-"));const port=await freePort(59900,50);pg=new EmbeddedPostgres({databaseDir:dir,port,user:"postgres",password:"synthetic",persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C","--encoding=UTF8"],onLog:()=>undefined});await pg.initialise();await pg.start();admin=new Pool({host:"127.0.0.1",port,database:"postgres",user:"postgres",password:"synthetic"});await migrate(admin);await installLegacySyntheticPartyFixtures(admin);await admin.query("INSERT INTO control_plane.tenant(id)VALUES($1),($2)",[tenant,other]);await importWatchdogFixtureJob(admin,tenant,job);await importWatchdogFixtureJob(admin,tenant,wrongJob);await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state)VALUES($1,$2,$3,'confirmed')",[scope,tenant,job]);await admin.query("CREATE ROLE materials_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;GRANT jobguard_runtime TO materials_login");runtime=new Pool({host:"127.0.0.1",port,database:"postgres",user:"materials_login",password:"synthetic"})},60000);afterAll(async()=>{await closeTestPools(runtime,admin);await pg.stop();await rm(dir,{recursive:true,force:true})});
describe("material repositories and database boundary",()=>{it("persists exact current and future rate revisions without side effects",async()=>{const repo=new MaterialRepository(runtime);const v1=await repo.addRate(ctx,{merchantName:"Fictional supplier",sku:"SKU-1",description:"Synthetic item",pricePence:2000,priceUnit:"each",taxBasis:"net",effectiveFrom:"2026-09-20",sourceLabel:"fixture",expectedVersion:0});const requirement=await repo.addRequirement(ctx,{jobId:job,scopeItemId:scope,skuId:v1.skuId,quantity:"10",unit:"each",expectedRevision:0});const orders=new PurchaseOrderRepository(runtime);const draft={version:"purchase-order-draft.v1" as const,requirementId:requirement.id,quantity:"10",unitPricePence:2500,recipient:"orders@fictional-merchant.invalid",requiredDate:"2026-10-01"};await orders.revise(ctx,job,{...draft,expectedRevision:0});await orders.revise(ctx,job,{...draft,unitPricePence:2000,recipient:"changed@fictional.invalid",expectedRevision:1});expect(await orders.view(ctx,job)).toMatchObject({revision:2,unitPricePence:2000,differencePence:0,recipient:"changed@fictional.invalid",requiredDate:"2026-10-01"});await repo.addRate(ctx,{merchantName:"Fictional supplier",sku:"SKU-1",description:"Synthetic item",pricePence:2500,priceUnit:"each",taxBasis:"net",effectiveFrom:"2026-09-27",sourceLabel:"future fixture",expectedVersion:1});expect(await repo.view(ctx,job,"2026-09-20")).toMatchObject([{rateVersion:1,eachPence:2000,netPence:20000,sourceLabel:"fixture"}]);for(const table of["action_outbox","journal","landing_allocation"])expect(Number((await admin.query(`SELECT count(*) n FROM app.${table}`)).rows[0].n)).toBe(0)});it("enforces RLS, qualified FKs, ownership and runtime restrictions",async()=>{const catalogs=await admin.query(`SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,r.rolname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_roles r ON r.oid=c.relowner WHERE n.nspname='app' AND c.relname IN('merchant','merchant_sku','merchant_sku_alias','material_pack_conversion','material_requirement','material_rate_revision')`);expect(catalogs.rows).toHaveLength(6);expect(catalogs.rows.every(x=>x.relrowsecurity&&x.relforcerowsecurity&&x.rolname==='jobguard_migration')).toBe(true);await expect(withTenant(runtime,ctx,db=>db.$client.query("UPDATE app.merchant SET name='bad'"))).rejects.toMatchObject({code:"42501"});await expect(withTenant(runtime,ctx,db=>db.$client.query("INSERT INTO app.material_requirement(id,tenant_id,job_id,scope_item_id,sku_id,quantity_decimal,unit,revision) SELECT $1,$2,$3,$4,id,'1','each',1 FROM app.merchant_sku LIMIT 1",[randomUUID(),tenant,wrongJob,scope]))).rejects.toMatchObject({code:"23503"});await expect(withTenant(runtime,ctx,db=>db.$client.query("INSERT INTO app.merchant(id,tenant_id,name)VALUES($1,$2,'attack')",[randomUUID(),other]))).rejects.toMatchObject({code:"42501"})})});
// Audit regressions: application SQL-fixture versions ran red before the fix.
// These real-PostgreSQL cases are dispatcher/CI work; not run in the sandbox.
describe("AUDIT-FIX-API-FILE-MATERIAL", () => {
 it("gross_agreement_requires_tax_review", async () => {
  const repo = new MaterialRepository(runtime), auditJob = randomUUID(), auditScope = randomUUID();
  await importWatchdogFixtureJob(admin, tenant, auditJob);
  await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state)VALUES($1,$2,$3,'confirmed')", [auditScope, tenant, auditJob]);
  const rate = await repo.addRate(ctx, { merchantName: "Fictional gross audit merchant", sku: "GROSS-AUDIT", description: "Synthetic material", pricePence: 2400, priceUnit: "each", taxBasis: "gross", effectiveFrom: "2026-10-01", sourceLabel: "synthetic audit", expectedVersion: 0 });
  await repo.addRequirement(ctx, { jobId: auditJob, scopeItemId: auditScope, skuId: rate.skuId, quantity: "10", unit: "each", expectedRevision: 0 });
  const rows = await repo.view(ctx, auditJob, "2026-10-08");
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ rateId: rate.id, status: "review", taxBasis: "gross", reason: "Tax basis needs review" });
  expect(rows[0]).not.toHaveProperty("netPence");
  expect(rows[0]).not.toHaveProperty("eachPence");
 });
 it("expired_offer_does_not_change_remaining_agreement", async () => {
  const repo = new MaterialRepository(runtime), auditJob = randomUUID(), auditScope = randomUUID();
  await importWatchdogFixtureJob(admin, tenant, auditJob);
  await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state)VALUES($1,$2,$3,'confirmed')", [auditScope, tenant, auditJob]);
  const input = { merchantName: "Fictional pack audit merchant", sku: "PACK-AUDIT", description: "Synthetic material", pricePence: 10000, priceUnit: "box" as const, taxBasis: "net" as const, effectiveFrom: "2026-10-01", packEachQuantity: "5", sourceLabel: "synthetic audit", expectedVersion: 0 };
  const v1 = await repo.addRate(ctx, input);
  await repo.addRate(ctx, { ...input, packEachQuantity: "10", effectiveFrom: "2026-10-05", effectiveTo: "2026-10-07", expectedVersion: 1 });
  await repo.addRequirement(ctx, { jobId: auditJob, scopeItemId: auditScope, skuId: v1.skuId, quantity: "10", unit: "each", expectedRevision: 0 });
  const rows = await repo.view(ctx, auditJob, "2026-10-08");
  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ rateId: v1.id, rateVersion: 1, status: "applicable", packEachQuantity: "5", eachPence: 2000, netPence: 20000 });
 });
});

// Hold inserts so both real transactions reach the race before either can commit.
// With the repository lock, one waits at INSERT and the other at the advisory lock;
// without it both pass the empty lookup and wait at INSERT, then create duplicates.
it("concurrent_first_rate_has_one_catalogue_effect", async () => {
 const repo = new MaterialRepository(runtime);
 const merchantName = "Fictional concurrent audit merchant", sku = "CONCURRENT-AUDIT";
 const input = { merchantName, sku, description: "Synthetic material", pricePence: 2000, priceUnit: "each" as const, taxBasis: "net" as const, effectiveFrom: "2026-10-01", sourceLabel: "synthetic audit", expectedVersion: 0 };
 const blocker = await admin.connect();
 try {
  await blocker.query("BEGIN");
  await blocker.query("LOCK TABLE app.merchant IN SHARE MODE");
  const pending = Promise.allSettled([
   repo.addRate(ctx, input),
   repo.addRate(ctx, { ...input, merchantName: merchantName.toUpperCase() }),
  ]);
  try {
   await expect.poll(async () => Number((await admin.query(`SELECT count(*) n FROM pg_stat_activity WHERE usename='materials_login' AND state='active' AND wait_event_type='Lock'`)).rows[0].n), { timeout: 3000, interval: 10 }).toBe(2);
  } finally {
   await blocker.query("ROLLBACK");
   await pending;
  }
  const results = await pending;
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  const refused = results.filter(result => result.status === "rejected");
  expect(refused).toHaveLength(1);
  expect(refused[0]).toMatchObject({ reason: { message: "STALE_MATERIAL_RATE_REVISION" } });
  const merchants = await admin.query(`SELECT id FROM app.merchant WHERE tenant_id=$1 AND lower(name)=lower($2)`, [tenant, merchantName]);
  expect(merchants.rows).toHaveLength(1);
  const skus = await admin.query(`SELECT s.id FROM app.merchant_sku s JOIN app.merchant m ON (m.tenant_id,m.id)=(s.tenant_id,s.merchant_id) WHERE s.tenant_id=$1 AND lower(m.name)=lower($2) AND s.sku=$3`, [tenant, merchantName, sku]);
  expect(skus.rows).toHaveLength(1);
  const rates = await admin.query(`SELECT r.version FROM app.material_rate_revision r JOIN app.merchant_sku s ON (s.tenant_id,s.id)=(r.tenant_id,r.sku_id) JOIN app.merchant m ON (m.tenant_id,m.id)=(s.tenant_id,s.merchant_id) WHERE r.tenant_id=$1 AND lower(m.name)=lower($2) AND s.sku=$3`, [tenant, merchantName, sku]);
  expect(rates.rows).toEqual([{ version: 1 }]);
 } finally {
  await blocker.query("ROLLBACK");
  blocker.release();
 }
});
