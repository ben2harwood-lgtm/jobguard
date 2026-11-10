import { testTenantContext, testBoundTenantContext } from "./tenant-context-test-utils.js";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { jobPartiesCommandResultV1 } from "@jobguard/core";
import {
  ContractorPartyRepository, ContractorRepository, JobPartiesRepository, JobRepository,
  WorkOrderRepository, demoFile, demoRow, migrate, prepareWorkOrderDemo,
  withTenant, type AuthenticatedMembership,
} from "../src/index.js";
import { seedActiveContractorAgreement } from "./contractor-agreement-test-fixture.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";

let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, dir: string;
const triggerName = "contractor_party_work_order_only";
const ctx = (p: AuthenticatedMembership) => testTenantContext(p.tenantId, { membershipId: p.membershipId });

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "jg-party-work-order-only-"));
  const port = await freePort(58800, 400);
  postgres = new EmbeddedPostgres({ databaseDir: dir, port, user: "postgres", password: "synthetic", persistent: false,
    createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  const control = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic", database: "postgres" });
  try { await control.query("CREATE DATABASE jobguard_synthetic_demo"); } finally { await control.end(); }
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic", database: "jobguard_synthetic_demo" });
  // Fresh database, real migrator, including 0671; a second pass must be harmless.
  await migrate(admin); await migrate(admin);
  await admin.query("CREATE ROLE party_work_order_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT jobguard_runtime TO party_work_order_login");
  runtime = new Pool({ host: "127.0.0.1", port, user: "party_work_order_login", password: "synthetic", database: "jobguard_synthetic_demo", max: 2 });
}, 180000);
afterAll(async () => { await closeTestPools(runtime, admin); await postgres?.stop(); if (dir) await rm(dir, { recursive: true, force: true }); });

async function fixture(status: "draft" | "quoting") {
  const p = await new ContractorRepository(runtime).startPractice(randomUUID());
  await seedActiveContractorAgreement(admin, p.tenantId);
  const demo = await prepareWorkOrderDemo(runtime, p, { siteCount: 1 });
  const jobs = new JobRepository(runtime), jp = new JobPartiesRepository(runtime);
  const job = await jobs.create(ctx(p), ["job:update"], { title: "Fictional homeowner kitchen" });
  const command = async (fields: Record<string, unknown>) => jobPartiesCommandResultV1.parse(await jp.command(ctx(p), p.membershipId, job.id,
    { version: "job-parties-command.v1", commandId: randomUUID(), ...fields }));
  const customer = await command({ action: "create_customer", customer: { version: "customer.v1", name: "Fictional Homeowner", type: "person" } });
  const payer = await command({ action: "create_customer", customer: { version: "customer.v1", name: "Fictional Homeowner Payer", type: "person" } });
  const site = await command({ action: "create_site", site: { version: "site.v1", addressLines: ["2 Fictional Home Street"], town: "London", postcode: "SW1A 1AA" } });
  await command({ action: "bind", expectedJobRevision: 0, parties: { version: "job-parties.v1",
    customerRevisionId: customer.revisionId, payingPartyRevisionId: payer.revisionId, siteRevisionId: site.revisionId } });
  // Ruling 103: legacy transition setup is owner-only; binding uses runtime.
  if (status === "quoting") await new JobRepository(admin).transition(await testBoundTenantContext(admin, p.tenantId, p.membershipId), ["job:update"], { jobId: job.id, expectedRevision: 1, to: "quoting", reason: "start_quote" });
  const current = await jobs.get(ctx(p), ["job:view"], job.id);
  expect(current).toMatchObject({ status, provenance: "system_generated_quote" });
  const input = { version: "contractor-party-import.v1", environment: "synthetic_demo", commandId: randomUUID(), jobId: job.id,
    workOrderId: randomUUID(), expectedJobRevision: current.revision, clientId: demo.clientId, contractId: demo.contractId,
    siteRevisionId: demo.siteRevisionIds[0], resident: { kind: "none", reason: "void_property" } };
  return { p, demo, jobId: job.id as string, input };
}

async function snapshot(p: AuthenticatedMembership, jobId: string) {
  return withTenant(runtime, ctx(p), async db => {
    const rows = async (table: string, order: string) => (await db.$client.query(`SELECT * FROM app.${table} WHERE tenant_id=$1 AND job_id=$2 ORDER BY ${order}`, [p.tenantId, jobId])).rows;
    return {
      bindings: await rows("job_party_binding", "revision,id"), current: await rows("job_party_current", "binding_id"),
      contractorBindings: await rows("contractor_party_binding", "id"),
      job: (await db.$client.query("SELECT * FROM app.job WHERE tenant_id=$1 AND id=$2", [p.tenantId, jobId])).rows,
      receipts: (await db.$client.query("SELECT * FROM app.command_receipt WHERE tenant_id=$1 ORDER BY command_id", [p.tenantId])).rows,
      audit: (await db.$client.query("SELECT * FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence", [p.tenantId])).rows,
    };
  });
}

async function assertHomeownerRefused(f: Awaited<ReturnType<typeof fixture>>) {
  const before = await snapshot(f.p, f.jobId);
  expect(before.bindings).toHaveLength(1); expect(before.current).toHaveLength(1);
  await expect(new ContractorPartyRepository(runtime).bind(f.p, f.input)).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(await snapshot(f.p, f.jobId)).toEqual(before);
}

describe("LATER-SAFETY-127 contractor party binding", () => {
  it.each(["draft", "quoting"] as const)("refuses an ordinary %s job at its current revision without changing its parties", async status => {
    const f = await fixture(status);
    await assertHomeownerRefused(f);
    // Same tenant and linked client: the real importer calls bindInTransaction
    // while provenance is work_order and before the work_order row exists.
    const result = await new WorkOrderRepository(runtime).importCsv(f.p, { commandId: randomUUID(), name: "fictional.csv", kind: "csv", csv: demoFile([demoRow(f.demo, 1)]) });
    expect(result.rows).toHaveLength(1); expect(result.rows[0]).toMatchObject({ outcome: "created", errorCode: null });
    const bound = (await admin.query(`SELECT j.provenance,j.status,b.provenance AS binding_provenance,b.customer_id,b.paying_party_id,b.site_revision_id
      FROM app.work_order w JOIN app.job j ON (j.tenant_id,j.id)=(w.tenant_id,w.job_id)
      JOIN app.job_party_current c ON (c.tenant_id,c.job_id)=(j.tenant_id,j.id)
      JOIN app.job_party_binding b ON (b.tenant_id,b.id)=(c.tenant_id,c.binding_id)
      WHERE w.tenant_id=$1 AND w.id=$2`, [f.p.tenantId, result.rows[0]!.workOrderId])).rows[0];
    expect(bound).toMatchObject({ provenance: "work_order", status: "live", binding_provenance: "work_order_import", site_revision_id: f.demo.siteRevisionIds[0] });
    expect(bound.customer_id).toBe(bound.paying_party_id);
    await assertHomeownerRefused(f);
  });

  it("proves mutation sensitivity by removing and restoring the trigger only in this scratch database", async () => {
    const f = await fixture("quoting");
    await assertHomeownerRefused(f);
    const definition = (await admin.query("SELECT pg_get_triggerdef(oid) AS definition FROM pg_trigger WHERE tgrelid='app.job_party_binding'::regclass AND tgname=$1", [triggerName])).rows[0]!.definition as string;
    await admin.query(`DROP TRIGGER ${triggerName} ON app.job_party_binding`);
    try {
      // The same refusal assertion must fail when the guard is removed.
      await expect(assertHomeownerRefused(f)).rejects.toThrow();
      const changed = await snapshot(f.p, f.jobId);
      expect(changed.bindings).toHaveLength(2);
      expect(changed.bindings[1]).toMatchObject({ provenance: "work_order_import", site_revision_id: f.input.siteRevisionId });
      expect(changed.current[0]!.binding_id).toBe(changed.bindings[1]!.id);
    } finally { await admin.query(definition); }
    await assertHomeownerRefused(await fixture("quoting"));
  });

  it("installs 0671 once and restricts the trigger function to its migration owner", async () => {
    expect((await admin.query("SELECT count(*)::int n FROM public.jobguard_schema_migration WHERE migration_name='0671_contractor_party_bind_work_order_only.sql'")).rows).toEqual([{ n: 1 }]);
    const row = (await admin.query(`SELECT pg_get_userbyid(proowner) AS owner,prosecdef,proconfig,
      has_function_privilege('jobguard_runtime',oid,'EXECUTE') AS runtime,
      has_function_privilege('jobguard_identity',oid,'EXECUTE') AS identity,
      has_function_privilege('jobguard_infrastructure',oid,'EXECUTE') AS infrastructure,
      EXISTS(SELECT 1 FROM aclexplode(proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public
      FROM pg_proc WHERE oid='app.guard_contractor_party_work_order()'::regprocedure`)).rows[0];
    expect(row).toEqual({ owner: "jobguard_migration", prosecdef: true, proconfig: ["search_path=pg_catalog"], runtime: false, identity: false, infrastructure: false, public: false });
  });
});
