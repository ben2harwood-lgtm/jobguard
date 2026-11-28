import { seedActiveContractorAgreement } from "./contractor-agreement-test-fixture.js";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SOR_ITEM_INCLUDES_MAX, referenceApprovalRulesV1 } from "@jobguard/core";
import { requireContractorRequestContext,
  ContractorRepository, MIGRATION_URLS, SorRepository, WorkOrderRepository, demoFile, demoRow, migrate, prepareWorkOrderDemo, readSorItemIncludes, sorIncludesHash, withTenant,
  type AuthenticatedMembership, type WorkOrderDemo,
} from "../src/index.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";

// CC-I1 (Enterprise R1, F1): rate-list import v2 with optional per-item "includes" text. Real PostgreSQL. Made-up data only.
let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, dir: string, contractors: ContractorRepository, orders: WorkOrderRepository, rates: SorRepository;
const ctx = (p: AuthenticatedMembership) => requireContractorRequestContext(p);
const view = (p: AuthenticatedMembership) => contractors.query(p, { version: "contractor-query.v1", tenantId: p.tenantId, resource: "organisation" });
const command = async (p: AuthenticatedMembership, fields: Record<string, unknown>) => contractors.command(p, { version: "contractor-command.v1", environment: "synthetic_demo", commandId: randomUUID(), id: randomUUID(), expectedRevision: (await view(p)).revision, ...fields });
async function org() { const p = await contractors.startPractice(randomUUID()); await seedActiveContractorAgreement(admin, p.tenantId); const demo = await prepareWorkOrderDemo(runtime, p); return { p, demo }; }
type Item = { code: string; description: string; unit: string; rate: { pence: number; currency: "GBP" }; includes?: string };
const item = (code: string, pence: number, includes?: string): Item => ({ code, description: `Fictional item ${code}`, unit: "each", rate: { pence, currency: "GBP" }, ...(includes === undefined ? {} : { includes }) });
const v2Body = (scheduleId: string, effectiveFrom: string, items: Item[]) => ({ version: "sor-version-import.v2", environment: "synthetic_demo", commandId: randomUUID(), scheduleId, reference: `Fictional rates ${effectiveFrom}`, effectiveFrom, items });
const v1Body = (scheduleId: string, effectiveFrom: string, items: Item[]) => ({ ...v2Body(scheduleId, effectiveFrom, items), version: "sor-version-import.v1" });
const includesOf = (p: AuthenticatedMembership, versionId: string, code: string) => rates.itemIncludes(p, versionId, code);
const auditText = async (versionId: string) => (await admin.query("SELECT payload::text p FROM app.audit_event WHERE id=$1 AND event_type='contractor.sor_version.imported'", [versionId])).rows.map(r => r.p as string);
const contractDocument = (sorVersionIds: string[]) => ({ version: "client-contract.v1", reference: "FICTIONAL-INCLUDES", startsOn: "2026-01-01", endsOn: null, sorVersionIds, tenderedAdjustment: { numerator: "-35", denominator: "1000" }, photoRule: "required", vatCode: "synthetic-unreviewed", exportedNotBilledAlertDays: 30 });

// Upgrade fixture: a rate list imported through v1 before 0785 exists.
let legacy: { p: AuthenticatedMembership; versionId: string; items: unknown[] };

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "jg-cc-i1-")); const port = await freePort(59500, 300);
  postgres = new EmbeddedPostgres({ databaseDir: dir, port, user: "postgres", password: "synthetic", persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  const control = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic", database: "postgres" }); await control.query("CREATE DATABASE jobguard_synthetic_demo"); await control.end();
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic", database: "jobguard_synthetic_demo" });
  await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  const own = MIGRATION_URLS.findIndex(url => url.pathname.endsWith("/0785_sor_item_includes.sql")); expect(own).toBeGreaterThan(0);
  for (const url of MIGRATION_URLS.slice(0, own)) { await admin.query(await readFile(url, "utf8")); await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [url.pathname.split("/").at(-1)]); }
  await admin.query("CREATE ROLE cc_i1_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT jobguard_runtime TO cc_i1_login");
  runtime = new Pool({ host: "127.0.0.1", port, user: "cc_i1_login", password: "synthetic", database: "jobguard_synthetic_demo", max: 6 });
  contractors = new ContractorRepository(runtime); orders = new WorkOrderRepository(runtime); rates = new SorRepository(runtime);
  // Before 0785: a v1 import is the only import there is.
  const { p } = await org();
  const result = await rates.importVersion(p, v1Body(randomUUID(), "2026-01-15", [item("LEGACY-A", 1000), item("LEGACY-B", 2500)]));
  expect(await admin.query("SELECT to_regclass('app.sor_item_includes') r").then(r => r.rows[0].r)).toBeNull();
  legacy = { p, versionId: result.versionId, items: (await admin.query("SELECT to_jsonb(i) j FROM app.sor_item i WHERE version_id=$1 ORDER BY code", [result.versionId])).rows.map(r => r.j) };
  await migrate(admin);
}, 300000);
afterAll(async () => { await closeTestPools(runtime, admin); await postgres?.stop(); if (dir) await rm(dir, { recursive: true, force: true }); });

describe("0785 upgrade", () => {
  it("leaves existing rate items exactly as they were, and they read with no includes text", async () => {
    expect((await admin.query("SELECT to_jsonb(i) j FROM app.sor_item i WHERE version_id=$1 ORDER BY code", [legacy.versionId])).rows.map(r => r.j)).toEqual(legacy.items);
    expect((await admin.query("SELECT count(*)::int n FROM app.sor_item_includes")).rows[0].n).toBe(0);
    for (const code of ["LEGACY-A", "LEGACY-B"]) expect(await includesOf(legacy.p, legacy.versionId, code)).toEqual({ version: "sor-item-includes.v1", environment: "synthetic_demo", realExternalActions: 0, sorVersionId: legacy.versionId, code, includes: null });
  });
  it("adds one tenant table under forced row-level security, owned by the migration role, runtime read-only, immutable", async () => {
    expect((await admin.query("SELECT c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) owner,c.relacl::text acl FROM pg_class c WHERE c.oid='app.sor_item_includes'::regclass")).rows[0])
      .toEqual({ relrowsecurity: true, relforcerowsecurity: true, owner: "jobguard_migration", acl: "{jobguard_migration=arwdDxt/jobguard_migration,jobguard_runtime=r/jobguard_migration}" });
    expect((await admin.query("SELECT policyname,cmd,roles::text FROM pg_policies WHERE schemaname='app' AND tablename='sor_item_includes'")).rows).toEqual([{ policyname: "tenant_isolation", cmd: "ALL", roles: "{jobguard_migration,jobguard_runtime}" }]);
    expect((await admin.query("SELECT tgname FROM pg_trigger WHERE tgrelid='app.sor_item_includes'::regclass AND NOT tgisinternal ORDER BY 1")).rows.map(r => r.tgname)).toEqual(["sor_item_includes_immutable", "sor_item_includes_no_truncate"]);
    const fn = (await admin.query("SELECT p.prosecdef,pg_get_userbyid(p.proowner) owner,p.proacl::text acl,p.proconfig FROM pg_proc p WHERE p.oid='app.import_sor_version_v2(uuid,jsonb)'::regprocedure")).rows[0];
    expect(fn).toEqual({ prosecdef: true, owner: "jobguard_migration", acl: "{jobguard_migration=X/jobguard_migration,jobguard_runtime=X/jobguard_migration}", proconfig: ["search_path=pg_catalog"] });
    // v1's routine is unchanged by 0785: its latest body is still 0749's.
    const v1 = (await admin.query("SELECT prosrc FROM pg_proc WHERE oid='app.import_sor_version(uuid,jsonb)'::regprocedure")).rows[0].prosrc as string;
    expect(v1).toContain("'sor-version-record.v1'"); expect(v1).not.toContain("includes");
  });
});

describe("CC-I1 rate-list import v2", () => {
  it("imports with includes text on some items and none on others; the audit payload carries only the hash", async () => {
    const { p } = await org(); const text = "Fictional: includes making good to plaster\nand removal of debris from site";
    const body = v2Body(randomUUID(), "2026-03-01", [item("INC-A", 10000, `  ${text}  `), item("INC-B", 5000)]);
    const result = await rates.importVersion(p, body);
    expect(result).toEqual({ version: "sor-version-result.v2", environment: "synthetic_demo", versionId: expect.any(String), scheduleId: body.scheduleId, itemCount: 2, includesCount: 1, effectiveFrom: "2026-03-01", replayed: false, realExternalActions: 0 });
    expect(await includesOf(p, result.versionId, "INC-A")).toMatchObject({ code: "INC-A", includes: text });
    expect(await includesOf(p, result.versionId, "INC-B")).toMatchObject({ code: "INC-B", includes: null });
    const stored = (await admin.query("SELECT code,includes_text,includes_sha256 FROM app.sor_item_includes WHERE version_id=$1", [result.versionId])).rows;
    expect(stored).toEqual([{ code: "INC-A", includes_text: text, includes_sha256: expect.stringMatching(/^[0-9a-f]{64}$/u) }]);
    const [payload] = await auditText(result.versionId);
    expect(payload).toBeDefined(); expect(payload).not.toContain("making good"); expect(payload).not.toContain(stored[0].includes_sha256);
    const parsed = JSON.parse(payload!);
    expect(parsed.references.importVersion).toBe("sor-version-import.v2");
    expect(parsed.hashes.includes).toBe(sorIncludesHash([item("INC-A", 10000, text), item("INC-B", 5000)]));
    // The rate item itself is the same shape a v1 import writes.
    expect((await admin.query("SELECT code,unit,rate_pence::int rate FROM app.sor_item WHERE version_id=$1 ORDER BY code", [result.versionId])).rows).toEqual([{ code: "INC-A", unit: "each", rate: 10000 }, { code: "INC-B", unit: "each", rate: 5000 }]);
  });
  it("imports without any includes text", async () => {
    const { p } = await org();
    const result = await rates.importVersion(p, v2Body(randomUUID(), "2026-03-02", [item("PLAIN-A", 100), item("PLAIN-B", 200)]));
    expect(result).toMatchObject({ version: "sor-version-result.v2", itemCount: 2, includesCount: 0, replayed: false });
    for (const code of ["PLAIN-A", "PLAIN-B"]) expect((await includesOf(p, result.versionId, code)).includes).toBeNull();
    expect(JSON.parse((await auditText(result.versionId))[0]!).hashes.includes).toMatch(/^[0-9a-f]{64}$/u);
  });
  it("v1 still imports exactly as before, reads with no text, and refuses an includes field", async () => {
    const { p } = await org();
    const result = await rates.importVersion(p, v1Body(randomUUID(), "2026-03-03", [item("V1-A", 100)]));
    expect(result).toEqual({ version: "sor-version-result.v1", environment: "synthetic_demo", versionId: expect.any(String), scheduleId: expect.any(String), itemCount: 1, effectiveFrom: "2026-03-03", replayed: false, realExternalActions: 0 });
    expect((await includesOf(p, result.versionId, "V1-A")).includes).toBeNull();
    expect(Object.keys(JSON.parse((await auditText(result.versionId))[0]!).hashes)).toEqual(["document"]);
    await expect(rates.importVersion(p, v1Body(randomUUID(), "2026-03-04", [item("V1-B", 100, "Fictional")]))).rejects.toMatchObject({ code: "INVALID_COMMAND" });
  });
  it("shows the text only for the rate-list version it was imported with", async () => {
    const { p } = await org(); const schedule = randomUUID();
    const a = await rates.importVersion(p, v2Body(schedule, "2026-01-01", [item("SAME-CODE", 1000, "Fictional January wording")]));
    const b = await rates.importVersion(p, v2Body(schedule, "2026-06-01", [item("SAME-CODE", 1100, "Fictional June wording")]));
    const c = await rates.importVersion(p, v2Body(schedule, "2026-09-01", [item("SAME-CODE", 1200)]));
    const d = await rates.importVersion(p, v1Body(schedule, "2026-10-01", [item("SAME-CODE", 1300)]));
    expect((await includesOf(p, a.versionId, "SAME-CODE")).includes).toBe("Fictional January wording");
    expect((await includesOf(p, b.versionId, "SAME-CODE")).includes).toBe("Fictional June wording");
    expect((await includesOf(p, c.versionId, "SAME-CODE")).includes).toBeNull();
    expect((await includesOf(p, d.versionId, "SAME-CODE")).includes).toBeNull();
    // An unknown code, a malformed key or an unknown version is not found, never another version's text.
    await expect(includesOf(p, a.versionId, "OTHER-CODE")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(includesOf(p, randomUUID(), "SAME-CODE")).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(includesOf(p, "not-a-uuid", "SAME-CODE")).rejects.toMatchObject({ code: "NOT_FOUND" });
    // The low-level read for the entitlement context (CC-R1) runs in the caller's own tenant transaction.
    expect(await withTenant(runtime, ctx(p), db => readSorItemIncludes(db, b.versionId, "SAME-CODE"))).toMatchObject({ sorVersionId: b.versionId, includes: "Fictional June wording" });
    // Another tenant sees neither the item nor its text.
    const other = await org();
    await expect(includesOf(other.p, a.versionId, "SAME-CODE")).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await withTenant(runtime, ctx(other.p), db => db.$client.query("SELECT count(*)::int n FROM app.sor_item_includes WHERE version_id=$1", [a.versionId]))).rows[0].n).toBe(0);
  });
  it("replays the same command, and refuses a changed payload or a command id first used by v1", async () => {
    const { p } = await org(); const body = v2Body(randomUUID(), "2026-04-01", [item("RE-A", 100, "Fictional replay wording")]);
    const first = await rates.importVersion(p, body);
    expect(await rates.importVersion(p, body)).toEqual({ ...first, replayed: true });
    await expect(rates.importVersion(p, { ...body, items: [item("RE-A", 100, "Fictional changed wording")] })).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
    const v1 = v1Body(randomUUID(), "2026-04-02", [item("RE-B", 100)]); await rates.importVersion(p, v1);
    await expect(rates.importVersion(p, { ...v1, version: "sor-version-import.v2" })).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
    expect((await admin.query("SELECT count(*)::int n FROM app.audit_event WHERE id=$1", [first.versionId])).rows[0].n).toBe(1);
  });
  it(`bounds the text at ${SOR_ITEM_INCLUDES_MAX} characters, in the schema and in the database`, async () => {
    const { p } = await org(); const longest = "x".repeat(SOR_ITEM_INCLUDES_MAX);
    const ok = await rates.importVersion(p, v2Body(randomUUID(), "2026-05-01", [item("MAX", 100, longest)]));
    expect((await includesOf(p, ok.versionId, "MAX")).includes).toBe(longest);
    for (const includes of ["x".repeat(SOR_ITEM_INCLUDES_MAX + 1), "", "   ", "bell\u0007"]) {
      await expect(rates.importVersion(p, v2Body(randomUUID(), "2026-05-02", [item("BAD", 100, includes)]))).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    }
    await expect(rates.importVersion(p, { ...v2Body(randomUUID(), "2026-05-02", [item("BAD", 100)]), items: [{ ...item("BAD", 100), includes: null }] })).rejects.toMatchObject({ code: "INVALID_COMMAND" });
    // The routine itself refuses what the schema would: an over-long text, a non-string value.
    const raw = (items: unknown[]) => withTenant(runtime, ctx(p), db => db.$client.query("SELECT app.import_sor_version_v2($1,$2::jsonb)", [p.membershipId, JSON.stringify({ version: "sor-version-record.v2", environment: "synthetic_demo", commandId: randomUUID(), versionId: randomUUID(), scheduleId: randomUUID(), scheduleReference: "Raw", reference: "Raw", effectiveFrom: "2026-05-03", contentHash: "b".repeat(64), requestHash: "c".repeat(64), items })]));
    await expect(raw([{ code: "R", description: "r", unit: "each", ratePence: 1, standardMinutes: null, includes: "x".repeat(SOR_ITEM_INCLUDES_MAX + 1) }])).rejects.toMatchObject({ code: "23514", constraint: "sor_item_includes_includes_text_check" });
    await expect(raw([{ code: "R", description: "r", unit: "each", ratePence: 1, standardMinutes: null, includes: 7 }])).rejects.toMatchObject({ message: "INVALID_COMMAND" });
    // A version without its audit event cannot commit, as for v1.
    await expect(raw([{ code: "R", description: "r", unit: "each", ratePence: 1, standardMinutes: null, includes: "Fictional" }])).rejects.toMatchObject({ message: "WORK_ORDER_AUDIT_REQUIRED" });
    await expect(withTenant(runtime, ctx(p), db => db.$client.query("SELECT app.import_sor_version_v2($1,$2::jsonb)", [p.membershipId, JSON.stringify({ version: "sor-version-record.v1", environment: "synthetic_demo", items: [] })]))).rejects.toMatchObject({ message: "INVALID_COMMAND" });
  });
  it("runtime cannot write the text directly, and stored text is immutable", async () => {
    const { p } = await org();
    const v = await rates.importVersion(p, v2Body(randomUUID(), "2026-07-01", [item("IMM", 100, "Fictional immutable wording")]));
    await expect(withTenant(runtime, ctx(p), db => db.$client.query("INSERT INTO app.sor_item_includes(tenant_id,version_id,code,includes_text,includes_sha256) VALUES($1,$2,'IMM','x',$3)", [p.tenantId, v.versionId, "a".repeat(64)]))).rejects.toMatchObject({ code: "42501" });
    await expect(withTenant(runtime, ctx(p), db => db.$client.query("UPDATE app.sor_item_includes SET includes_text='y' WHERE version_id=$1", [v.versionId]))).rejects.toMatchObject({ code: "42501" });
    await expect(admin.query("UPDATE app.sor_item_includes SET includes_text='Fictional rewritten' WHERE version_id=$1", [v.versionId])).rejects.toThrow();
    await expect(admin.query("DELETE FROM app.sor_item_includes WHERE version_id=$1", [v.versionId])).rejects.toThrow();
    expect((await includesOf(p, v.versionId, "IMM")).includes).toBe("Fictional immutable wording");
  });
  it("a v2 rate list prices work orders exactly as v1 does (£100.00 at -35/1000 is £96.50)", async () => {
    const { p, demo } = await org();
    const v = await rates.importVersion(p, v2Body(randomUUID(), "2026-01-01", [item("REPAIR-DOOR", 10000, "Fictional: includes ironmongery")]));
    const contractId = randomUUID();
    await command(p, { kind: "contract.revise", clientId: demo.clientId, contractId, document: contractDocument([v.versionId]), rules: referenceApprovalRulesV1 });
    const result = await orders.importCsv(p, { commandId: randomUUID(), name: "includes.csv", kind: "csv", csv: demoFile([demoRow(demo as WorkOrderDemo, 1, { contractId, workOrderReference: "INC-0001", lines: [{ clientLineReference: "L1", sorCode: "REPAIR-DOOR", quantity: "1" }] })]) });
    expect(result.rows[0]).toMatchObject({ outcome: "created" });
    expect((await admin.query("SELECT l.sor_version_id,l.rate_pence::int rate,l.net_pence::int net FROM app.work_order_line l JOIN app.work_order_revision r ON r.id=l.revision_id WHERE r.work_order_id=$1", [result.rows[0]!.workOrderId])).rows)
      .toEqual([{ sor_version_id: v.versionId, rate: 10000, net: 9650 }]);
  });
});
