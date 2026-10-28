import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { SupplierDocumentRepository } from "../src/supplier-document-repository.js";
import { PurchaseOrderRepository } from "../src/purchase-order-repository.js";
import { MaterialRepository } from "../src/material-repository.js";
import { practiceMaterialPool } from "../src/practice-session.js";
import { FinalCheckRepository } from "../src/final-check-repository.js";
import { FinalCheckCompletionRepository, practiceFinalCheckPorts } from "../src/shadow-detection-repository.js";
import { FinalCheckWorker } from "../../../apps/api/src/final-check.worker.js";
import { createFinalCheckFixture, closeFinalCheckFixture, seedFinalCheckJob, finalCheckTenant, type FinalCheckFixture } from "./final-check-fixture.js";
let f: FinalCheckFixture;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); f = await createFinalCheckFixture(); }, 60000);
afterAll(async () => { await closeFinalCheckFixture(f); vi.unstubAllEnvs(); });
const worker = () => new FinalCheckWorker(practiceFinalCheckPorts(f.shadow, f.runtime, "f".repeat(64)), "synthetic_demo");

it.each(["shadow-30000", "recovery-18800"] as const)("processes %s supplier/PO sources through the actual practice ports and publishes completion", async scenario => {
  const a = await seedFinalCheckJob(f), supplier = new SupplierDocumentRepository(f.runtime);
  if (scenario === "recovery-18800") {
    // DR-02: material requirement and both the proposed and revised order, through the real commands.
    const pool = practiceMaterialPool(f.runtime, a.digest), materials = new MaterialRepository(pool);
    const rate = await materials.addRate(a.context, {merchantName:`Fictional ${randomUUID()}`,sku:"fictional-block",description:"Fictional material",
      pricePence:2000,priceUnit:"each",taxBasis:"net",effectiveFrom:"2026-01-01",sourceLabel:"fictional",expectedVersion:0});
    const requirement = await materials.addRequirement(a.context, {jobId:a.jobId,scopeItemId:a.scopeItemId,skuId:rate.skuId,quantity:"10",unit:"each",expectedRevision:0});
    const orders = new PurchaseOrderRepository(pool);
    for (const [expectedRevision,unitPricePence] of [[0,2500],[1,2000]] as const)
      await orders.revise(a.context,a.jobId,{version:"purchase-order-draft.v1",commandId:randomUUID(),requirementId:requirement.id,quantity:"10",unitPricePence,recipient:"merchant@example.invalid",requiredDate:"2026-10-28",expectedRevision},"2026-10-28");
  }
  const fixtureIds = scenario === "shadow-30000" ? ["materials-320-invoice"] as const : ["materials-B-delivery","materials-B-invoice","materials-B-revised-invoice"] as const;
  for (const [expectedRevision,fixtureId] of fixtureIds.entries())
    await supplier.intake(a.context,a.jobId,{version:"supplier-document-intake.v1",commandId:randomUUID(),fixtureId,channel:"picker",expectedRevision});
  await a.lock();
  const repo = new FinalCheckRepository(f.shadow), manifest = await repo.begin(a.context,a.jobId);
  expect(manifest.sources.filter(s=>s.sourceKind === "unlinked_supplier_version")).toHaveLength(fixtureIds.length);
  expect(manifest.sources.filter(s=>s.sourceKind === "unlinked_purchase_order")).toHaveLength(scenario === "recovery-18800" ? 2 : 0);
  expect(manifest.sources.every(s=>s.processable && s.status === "pending")).toBe(true);
  const result = await worker().execute(a.context,{version:"final-check.task.v1",jobId:a.jobId,manifestId:manifest.id}) as {runId:string};
  expect((await repo.manifest(a.context,a.jobId,manifest.id)).sources.every(s=>s.status === "zero_result")).toBe(true);
  await new FinalCheckCompletionRepository(f.shadow).publish(a.context,{version:"final-check-publication.v1",jobId:a.jobId,runId:result.runId,checkId:randomUUID()});
  expect(await new FinalCheckRepository(f.runtime).read(a.context,a.jobId,a.digest)).toMatchObject({state:"completed",items:[]});
  expect(await worker().execute(a.context,{version:"final-check.task.v1",jobId:a.jobId,manifestId:manifest.id})).toMatchObject({runId:result.runId});
});

it("unversioned known material originals are read, but held and unknown sources keep the check incomplete", async () => {
  const { supplierFixtures } = await import("@jobguard/core"), { createHash } = await import("node:crypto");
  const a=await seedFinalCheckJob(f), fixture=supplierFixtures["materials-320-invoice"];
  await finalCheckTenant(f.admin,a.tenantId,db=>db.query("INSERT INTO app.supplier_document(id,tenant_id,job_id,supplier_context,document_type,document_number,content_hash,status) VALUES($1,$2,$3,'fictional-merchant','invoice',$4,$5,'ready')",[randomUUID(),a.tenantId,a.jobId,fixture.number,createHash("sha256").update(fixture.bytes).digest("hex")]));
  await new SupplierDocumentRepository(f.runtime).intake(a.context,a.jobId,{version:"supplier-document-intake.v1",fixtureId:"unreadable",channel:"picker",expectedRevision:0});
  await a.lock();const repo=new FinalCheckRepository(f.shadow),m=await repo.begin(a.context,a.jobId);
  await expect(worker().execute(a.context,{version:"final-check.task.v1",jobId:a.jobId,manifestId:m.id})).rejects.toThrow("FINAL_CHECK_PENDING");
  const fresh=await repo.manifest(a.context,a.jobId,m.id);
  expect(fresh.sources).toContainEqual(expect.objectContaining({sourceKind:"unlinked_supplier_document",status:"zero_result"}));
  expect(fresh.sources).toContainEqual(expect.objectContaining({sourceKind:"unlinked_supplier_version",status:"unsupported"}));
  expect(fresh.result).toBeNull();
});

it("the source port and SQL refuse a non-synthetic job, and the runtime cannot write processing results", async () => {
  const a=await seedFinalCheckJob(f);
  await new SupplierDocumentRepository(f.runtime).intake(a.context,a.jobId,{version:"supplier-document-intake.v1",fixtureId:"materials-320-invoice",channel:"picker",expectedRevision:0});
  await a.lock();const repo=new FinalCheckRepository(f.shadow),m=await repo.begin(a.context,a.jobId),s=m.sources[0]!;
  const ports=practiceFinalCheckPorts(f.shadow,f.runtime,"f".repeat(64));
  const valid=await ports.process(a.context,m,s);
  await expect(new FinalCheckRepository(f.runtime).record(a.context,a.jobId,m.id,s.id,randomUUID(),valid)).rejects.toThrow();
  // Privileged fixture only: simulate a source belonging to a production/pilot commercial track.
  await finalCheckTenant(f.admin,a.tenantId,async db => {
    await db.query("SET LOCAL session_replication_role='replica'");
    await db.query("UPDATE app.job_commercial_track SET environment='pilot_no_charge' WHERE tenant_id=$1 AND job_id=$2",[a.tenantId,a.jobId]);
  });
  expect(await ports.process(a.context,m,s)).toMatchObject({status:"unsupported",failureCode:"UNSUPPORTED_SOURCE"});
  await expect(repo.record(a.context,a.jobId,m.id,s.id,randomUUID(),valid)).rejects.toThrow("FINAL_CHECK_FORBIDDEN");
  await expect(repo.begin(a.context,a.jobId)).rejects.toThrow("FINAL_CHECK_FORBIDDEN");
});

it("0295 preserves existing frozen manifests, owners and grants on upgrade; migrate is repeatable", async () => {
  const { readFile }=await import("node:fs/promises"), { MIGRATION_URLS,migrate }=await import("../src/migrate.js");
  const { installLegacySyntheticPartyFixtures }=await import("./pool-test-utils.js");
  const u=await createFinalCheckFixture(false);
  try {
    const own=MIGRATION_URLS.findIndex(url=>url.pathname.endsWith("/0295_final_check_practice_readers.sql"));
    expect(own).toBeGreaterThan(0);
    await u.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
    for(const url of MIGRATION_URLS.slice(0,own)) {
      await u.admin.query(await readFile(url,"utf8"));
      await u.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[url.pathname.split("/").at(-1)]);
    }
    await u.admin.query(`GRANT jobguard_runtime TO ${u.runtime.options.user}`);
    await u.admin.query(`GRANT jobguard_shadow TO ${u.shadow.options.user}`);
    await installLegacySyntheticPartyFixtures(u.admin);
    const a=await seedFinalCheckJob(u);
    await new SupplierDocumentRepository(u.runtime).intake(a.context,a.jobId,{version:"supplier-document-intake.v1",fixtureId:"materials-320-invoice",channel:"picker",expectedRevision:0});
    await a.lock();const repo=new FinalCheckRepository(u.shadow),before=await repo.begin(a.context,a.jobId);
    expect(before.sources[0]).toMatchObject({processable:false,status:"pending"});
    const protection=()=>u.admin.query("SELECT c.relname,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity FROM pg_class c WHERE c.oid IN('app.final_check_processing_source'::regclass,'app.final_check_manifest'::regclass) ORDER BY c.relname");
    const oldProtection=(await protection()).rows;
    await migrate(u.admin);await migrate(u.admin);
    expect(await repo.manifest(a.context,a.jobId,before.id)).toEqual(before);
    expect((await protection()).rows).toEqual(oldProtection);
    const helper=(await u.admin.query("SELECT has_function_privilege('jobguard_runtime','app.final_check_practice_source_current(app.final_check_processing_source)','EXECUTE') runtime,has_function_privilege('jobguard_shadow','app.final_check_practice_source_current(app.final_check_processing_source)','EXECUTE') shadow")).rows[0];
    expect(helper).toEqual({runtime:false,shadow:false});
  } finally { await closeFinalCheckFixture(u); }
},120000);
