import { randomUUID } from "node:crypto";
import { writeSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { contractorPermissionMatrix, contractorRoles, encodeWorkOrderCsv, watchdogActive, type ContractorRole } from "@jobguard/core";
import {
  ContractorPartyRepository, ContractorRepository, JobSchedulingRepository, MIGRATION_URLS, SorRepository, WorkOrderRepository, assertContractorPartiesRequired, canonicalJson, demoFile, demoRow, migrate, prepareWorkOrderDemo, sha256Hex,
  verifiedTenantContextFromMembership, withTenant, type AuthenticatedMembership, type WorkOrderDemo,
} from "../src/index.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { addBranchClient } from "./work-order-two-branch-test-utils.js";

let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, dir: string, contractors: ContractorRepository, parties: ContractorPartyRepository, orders: WorkOrderRepository, rates: SorRepository, scheduling: JobSchedulingRepository;
const ENT2_TABLES = ["schedule_of_rates", "sor_version", "sor_item", "import_batch", "import_row_receipt", "work_order", "work_order_revision", "work_order_line", "work_order_current", "job_assignment", "site_visit"];
const SPINE_TABLES = ["job", "scope_identity", "job_commercial_track", "contractor_party_binding", "contractor_resident_contact", "job_party_binding", "job_party_current", "command_receipt", "audit_event"];
const ctx = (p: AuthenticatedMembership) => verifiedTenantContextFromMembership(p);
const resident = (n: number) => ({ name: `Fictional Resident ${String(n).padStart(4, "0")}`, phone: `0000${String(n).padStart(6, "0")}`, email: `resident${String(n).padStart(4, "0")}@resident-canary.invalid` });
const view = (p: AuthenticatedMembership) => contractors.query(p, { version: "contractor-query.v1", tenantId: p.tenantId, resource: "organisation" });
const command = async (p: AuthenticatedMembership, fields: Record<string, unknown>) => contractors.command(p, { version: "contractor-command.v1", environment: "synthetic_demo", commandId: randomUUID(), id: randomUUID(), expectedRevision: (await view(p)).revision, ...fields });
async function member(p: AuthenticatedMembership, role: string, scope: { kind: string; id: string }, clientId: string | null = null) {
  const id = randomUUID();
  await command(p, { kind: "member.invite", id, role, email: `${id}@fictional.invalid`, scope, clientId, contractId: null });
  const row = (await admin.query<{ identity_user_id: string }>("SELECT identity_user_id FROM app.membership WHERE tenant_id=$1 AND id=$2", [p.tenantId, id])).rows[0]!;
  return { ...p, membershipId: id, identityUserId: row.identity_user_id } as AuthenticatedMembership;
}
async function org(siteCount = 5) { const p = await contractors.startPractice(randomUUID()); const demo = await prepareWorkOrderDemo(runtime, p, { siteCount }); return { p, demo }; }
const counts = async (tenantId: string, tables = [...ENT2_TABLES, ...SPINE_TABLES]) => Object.fromEntries(await Promise.all(tables.map(async t => [t, (await admin.query(`SELECT count(*)::int n FROM app.${t} WHERE tenant_id=$1`, [tenantId])).rows[0].n as number])));
const importOf = (p: AuthenticatedMembership, csv: string, name = "test.csv", commandId: string = randomUUID()) => orders.importCsv(p, { commandId, name, kind: "csv", csv });
const row1 = (demo: WorkOrderDemo, n: number, overrides: Record<string, unknown> = {}) => demoRow(demo, n, overrides);

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "jg-ent2-")); const port = await freePort(58800, 400);
  postgres = new EmbeddedPostgres({ databaseDir: dir, port, user: "postgres", password: "synthetic", persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  const control = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic", database: "postgres" }); await control.query("CREATE DATABASE jobguard_synthetic_demo"); await control.end();
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic", database: "jobguard_synthetic_demo" });
  // Upgrade the preceding supported schema (everything before 0110), then run the tracked migrator twice (idempotence).
  await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  const own = MIGRATION_URLS.findIndex(url => url.pathname.endsWith("/0110_work_orders.sql")); expect(own).toBeGreaterThan(0);
  for (const url of MIGRATION_URLS.slice(0, own)) { await admin.query(await readFile(url, "utf8")); await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [url.pathname.split("/").at(-1)]); }
  await migrate(admin); await migrate(admin);
  await admin.query("CREATE ROLE ent2_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT jobguard_runtime TO ent2_login");
  runtime = new Pool({ host: "127.0.0.1", port, user: "ent2_login", password: "synthetic", database: "jobguard_synthetic_demo", max: 8 });
  contractors = new ContractorRepository(runtime); parties = new ContractorPartyRepository(runtime); orders = new WorkOrderRepository(runtime); rates = new SorRepository(runtime); scheduling = new JobSchedulingRepository(runtime);
}, 180000);
afterAll(async () => { await closeTestPools(runtime, admin); await postgres?.stop(); if (dir) await rm(dir, { recursive: true, force: true }); });

describe("ENT-2 migration and catalog", () => {
  it("registers 0110_work_orders.sql last, after 0106 (and any later merged number), with strictly increasing names, and every migration is applied once", async () => {
    const names = MIGRATION_URLS.map(url => url.pathname.split("/").at(-1)!);
    expect(names.at(-1)).toBe("0110_work_orders.sql"); expect(names.indexOf("0106_practice_feed.sql")).toBeGreaterThan(-1); expect(names.indexOf("0106_practice_feed.sql")).toBeLessThan(names.indexOf("0110_work_orders.sql")); expect(names.indexOf("0110_work_orders.sql")).toBe(names.length - 1);
    expect([...names].sort()).toEqual(names);
    expect((await admin.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY applied_at, migration_name")).rows.map(r => r.migration_name).sort()).toEqual(names);
  });
  it("catalogs FORCE RLS, migration ownership, SELECT-only runtime grants and denial of direct writes for every ENT-2 table", async () => {
    const { p } = await org();
    const rows = (await admin.query("SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relname=ANY($1::text[])", [ENT2_TABLES])).rows;
    expect(rows).toHaveLength(ENT2_TABLES.length); expect(rows.every(r => r.relrowsecurity && r.relforcerowsecurity && r.owner === "jobguard_migration")).toBe(true);
    for (const table of ENT2_TABLES) {
      const privileges = (await admin.query("SELECT privilege_type FROM information_schema.role_table_grants WHERE table_schema='app' AND table_name=$1 AND grantee='jobguard_runtime' ORDER BY privilege_type", [table])).rows.map(r => r.privilege_type);
      expect(privileges, table).toEqual(["SELECT"]);
      for (const sql of [`INSERT INTO app.${table} DEFAULT VALUES`, `UPDATE app.${table} SET tenant_id=tenant_id`, `DELETE FROM app.${table}`, `TRUNCATE app.${table}`]) await expect(withTenant(runtime, ctx(p), db => db.$client.query(sql)), `${table}: ${sql}`).rejects.toMatchObject({ code: "42501" });
    }
  });
  it("pins search_path on every ENT-2 routine; only the controlled writers are SECURITY DEFINER; none is executable by the infrastructure role", async () => {
    const names = ["work_order_begin", "work_order_commit", "import_batch_record", "import_sor_version", "work_order_parties_unchanged", "read_contractor_resident", "sor_line_net_pence", "contractor_job_allowed", "contractor_job_team", "contractor_job_assigned", "contractor_role_permits", "work_order_import_permitted", "work_order_client_permitted", "sor_import_permitted", "guard_work_order_job", "guard_work_order_line", "guard_work_order_current", "require_work_order_audit"];
    const functions = (await admin.query("SELECT p.proname,p.prosecdef,p.proconfig,has_function_privilege('jobguard_infrastructure',p.oid,'EXECUTE') infrastructure,pg_get_userbyid(p.proowner) owner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='app' AND p.proname=ANY($1::text[]) ORDER BY p.proname", [names])).rows;
    expect(functions.map(f => f.proname).sort()).toEqual([...names].sort());
    for (const f of functions) { expect(f.owner, f.proname).toBe("jobguard_migration"); expect(f.proconfig, f.proname).toEqual(expect.arrayContaining([expect.stringMatching(/^search_path=pg_catalog/u)])); expect(f.infrastructure, f.proname).toBe(false); }
    expect(functions.filter(f => f.prosecdef).map(f => f.proname).sort()).toEqual(["import_batch_record", "import_sor_version", "read_contractor_resident", "work_order_begin", "work_order_commit", "work_order_parties_unchanged"]);
  });
  it("copies ENT-1's role/permission matrix exactly: app.contractor_role_permits equals app.contractor_allowed for a real member of every role, and the core matrix (bar one documented pre-existing difference)", async () => {
    const { p, demo } = await org(); const permissions = ["organisation.read", "organisation.manage", "client.invite", "contract.read", "contract.manage", "job.read", "extra.log", "extra.price", "extra.approve", "data.export", "data.import", "statement.read", "dashboard.read", "resident.read", "other"];
    for (const role of contractorRoles) {
      const actor = role === "owner" ? p : await member(p, role, role === "operative" ? { kind: "team", id: demo.teamId } : role === "client_approver" ? { kind: "client", id: demo.clientId } : { kind: "tenant", id: p.tenantId }, role === "client_approver" ? demo.clientId : null);
      const target = role === "operative" ? demo.teamId : role === "client_approver" ? demo.clientId : p.tenantId;
      for (const permission of permissions) {
        const copy = (await admin.query("SELECT app.contractor_role_permits($1,$2) allowed", [role, permission])).rows[0].allowed as boolean;
        const enforced = await withTenant(runtime, ctx(p), async db => (await db.$client.query("SELECT app.contractor_allowed($1,$2,$3) allowed", [actor.membershipId, permission, target])).rows[0].allowed as boolean);
        expect(copy, `${role} ${permission} (copy vs ENT-1 function)`).toBe(enforced);
        // ENT-1's core matrix lets a client approver approve a decision awaiting them (ENT-5); the SQL function, which ENT-2 mirrors, never does.
        const core = contractorPermissionMatrix[role].includes(permission as never);
        expect(copy, `${role} ${permission} (copy vs core matrix)`).toBe(role === "client_approver" && permission === "extra.approve" ? false : core);
      }
    }
    for (const unknown of ["foreman", "nobody"]) for (const permission of permissions) expect((await admin.query("SELECT app.contractor_role_permits($1,$2) allowed", [unknown, permission])).rows[0].allowed).toBe(false);
  });
  it("refuses foreign-tenant contracts, teams, memberships, scope identities and jobs through qualified composite keys", async () => {
    const a = await org(), b = await org();
    const aOrder = await importOf(a.p, demoFile([row1(a.demo, 1)])), bOrder = await importOf(b.p, demoFile([row1(b.demo, 1)]));
    await importOf(a.p, demoFile([row1(a.demo, 1, { expectedRevision: 1, priority: "emergency" })]), "revise.csv");
    const ids = async (workOrderId: string) => (await admin.query("SELECT w.id work_order_id,w.job_id,w.contract_id,w.client_id,w.contract_version_id,(SELECT id FROM app.work_order_revision WHERE work_order_id=w.id ORDER BY revision DESC LIMIT 1) revision_id,(SELECT scope_item_id FROM app.work_order_line WHERE work_order_id=w.id LIMIT 1) scope_item_id FROM app.work_order w WHERE w.id=$1", [workOrderId])).rows[0];
    const mine = await ids(aOrder.rows[0]!.workOrderId!), theirs = await ids(bOrder.rows[0]!.workOrderId!);
    const line = (await admin.query("SELECT * FROM app.work_order_line WHERE revision_id=$1 AND position=0", [mine.revision_id])).rows[0];
    const freshScope = randomUUID();
    await withTenant(admin, testTenantContext(a.p.tenantId), db => db.$client.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [freshScope, a.p.tenantId, mine.job_id]));
    const attacks: Array<[string, string, unknown[]]> = [
      ["a team of another tenant", "INSERT INTO app.job_assignment(tenant_id,id,job_id,work_order_id,revision_id,team_id,membership_id) VALUES($1,$2,$3,$4,$5,$6,$7)", [a.p.tenantId, randomUUID(), mine.job_id, mine.work_order_id, mine.revision_id, b.demo.teamId, a.p.membershipId]],
      ["a membership of another tenant", "INSERT INTO app.job_assignment(tenant_id,id,job_id,work_order_id,revision_id,team_id,membership_id) VALUES($1,$2,$3,$4,$5,$6,$7)", [a.p.tenantId, randomUUID(), mine.job_id, mine.work_order_id, mine.revision_id, a.demo.teamId, b.demo.operativeMembershipId]],
      ["a scope identity of another job", "INSERT INTO app.work_order_line(tenant_id,id,work_order_id,revision_id,job_id,position,scope_item_id,sor_version_id,sor_code,unit,rate_pence,quantity,net_pence,origin) VALUES($1,$2,$3,$4,$5,9,$6,$7,$8,$9,$10,$11,$12,'client_instruction')", [a.p.tenantId, randomUUID(), mine.work_order_id, mine.revision_id, mine.job_id, theirs.scope_item_id, line.sor_version_id, line.sor_code, line.unit, line.rate_pence, line.quantity, line.net_pence]],
      ["a rate that is not the SoR item's", "INSERT INTO app.work_order_line(tenant_id,id,work_order_id,revision_id,job_id,position,scope_item_id,sor_version_id,sor_code,unit,rate_pence,quantity,net_pence,origin) VALUES($1,$2,$3,$4,$5,9,$6,$7,$8,$9,1,'1',1,'client_instruction')", [a.p.tenantId, randomUUID(), mine.work_order_id, mine.revision_id, mine.job_id, freshScope, line.sor_version_id, line.sor_code, line.unit]],
      ["a visit on another order's job", "INSERT INTO app.site_visit(tenant_id,id,job_id,work_order_id,membership_id) VALUES($1,$2,$3,$4,$5)", [a.p.tenantId, randomUUID(), theirs.job_id, mine.work_order_id, a.demo.operativeMembershipId]],
    ];
    for (const [what, sql, values] of attacks) await expect(withTenant(admin, testTenantContext(a.p.tenantId), db => db.$client.query(sql, values)), what).rejects.toMatchObject({ code: "23503" });
    // A contract of another tenant: the order's job already has an order (unique), so the attempt is refused by one key or the other; the composite keys are in the catalog.
    await expect(withTenant(admin, testTenantContext(a.p.tenantId), db => db.$client.query("INSERT INTO app.work_order(tenant_id,id,job_id,client_id,contract_id,contract_version_id,reference) VALUES($1,$2,$3,$4,$5,$6,'Fictional attack')", [a.p.tenantId, randomUUID(), mine.job_id, mine.client_id, theirs.contract_id, theirs.contract_version_id]))).rejects.toMatchObject({ code: expect.stringMatching(/^(23503|23505)$/u) });
    const keys = (await admin.query("SELECT pg_get_constraintdef(c.oid) def FROM pg_constraint c WHERE c.conrelid='app.work_order'::regclass AND c.contype='f' ORDER BY 1")).rows.map(r => r.def as string);
    expect(keys).toEqual(expect.arrayContaining([
      "FOREIGN KEY (tenant_id, client_id, contract_id) REFERENCES app.client_contract(tenant_id, client_id, id)",
      "FOREIGN KEY (tenant_id, client_id, contract_id, contract_version_id) REFERENCES app.client_contract_version(tenant_id, client_id, contract_id, id)",
      "FOREIGN KEY (tenant_id, id) REFERENCES app.contractor_party_binding(tenant_id, work_order_id)", "FOREIGN KEY (tenant_id, job_id) REFERENCES app.contractor_party_binding(tenant_id, job_id)",
    ]));
  });
});

describe("ENT-2 DW1 idempotent import", () => {
  it("imports a generated 2,000-order file (measured), replays the same file with no new rows, and records exactly 3 revisions with diffs for 3 changed orders", async () => {
    const { p, demo } = await org(20), N = 2000;
    const rows = Array.from({ length: N }, (_, i) => row1(demo, i + 1));
    const csv = demoFile(rows); const started = performance.now();
    const first = await importOf(p, csv, "synthetic-2000-orders.csv");
    const elapsedMs = Math.round(performance.now() - started);
    writeSync(2, `\nENT-2 DW1 measured: ${N} orders (${csv.length} bytes, file sha256 ${sha256Hex(csv)}) imported in ${elapsedMs} ms\n`);
    expect(first).toMatchObject({ replayed: false, counts: { rows: N, created: N, revised: 0, unchanged: 0, rejected: 0 }, realExternalActions: 0 });
    const after = await counts(p.tenantId);
    expect(after).toMatchObject({ work_order: N, work_order_revision: N, work_order_line: 2 * N, work_order_current: N, import_row_receipt: N, import_batch: 1, job_assignment: 2 * N, contractor_party_binding: N, contractor_resident_contact: N, job_commercial_track: N });
    expect((await admin.query("SELECT count(*)::int n FROM app.job WHERE tenant_id=$1 AND provenance='work_order' AND status='live'", [p.tenantId])).rows[0].n).toBe(N);
    // Same file again (a new command, as a second click would be): replayed, nothing written anywhere.
    const replay = await importOf(p, csv, "synthetic-2000-orders.csv");
    expect(replay).toMatchObject({ replayed: true, batchId: first.batchId, counts: first.counts });
    expect(await counts(p.tenantId)).toEqual(after);
    // The same command with the same file is also a replay; with different content it conflicts.
    expect(await orders.importCsv(p, { commandId: first.commandId, name: "x.csv", kind: "csv", csv })).toMatchObject({ replayed: true, batchId: first.batchId });
    await expect(orders.importCsv(p, { commandId: first.commandId, name: "x.csv", kind: "csv", csv: demoFile([row1(demo, 1, { priority: "emergency", expectedRevision: 1 })]) })).rejects.toMatchObject({ code: "COMMAND_CONFLICT" });
    expect(await counts(p.tenantId)).toEqual(after);
    // A different file with 3 changed orders: exactly 3 revisions, each with a stored diff; the 1,997 identical rows are recorded no-ops.
    const changedAt = new Set([10, 500, 1999]);
    const second = await importOf(p, demoFile(rows.map((r, i) => changedAt.has(i + 1) ? { ...r, expectedRevision: 1, lines: [{ clientLineReference: "L1", sorCode: "REPAIR-DOOR", quantity: "3" }, (r.lines as unknown[])[1]] } : { ...r, expectedRevision: 1 })), "synthetic-2000-orders-changed.csv");
    expect(second).toMatchObject({ replayed: false, counts: { rows: N, created: 0, revised: 3, unchanged: N - 3, rejected: 0 } });
    expect(second.rows.filter(r => r.outcome === "revised").map(r => r.rowNumber)).toEqual([11, 501, 2000]);
    const revisions = (await admin.query("SELECT r.revision,r.diff,w.reference FROM app.work_order_revision r JOIN app.work_order w ON w.id=r.work_order_id WHERE r.tenant_id=$1 AND r.revision=2 ORDER BY w.reference", [p.tenantId])).rows;
    expect(revisions.map(r => r.reference)).toEqual(["WO-DEMO-0010", "WO-DEMO-0500", "WO-DEMO-1999"]);
    for (const r of revisions) { expect(r.diff.changed).toHaveLength(1); expect(r.diff.fields).toEqual([]); expect(r.diff.added).toEqual([]); expect(r.diff.removed).toEqual([]); }
    expect(await counts(p.tenantId)).toMatchObject({ work_order: N, work_order_revision: N + 3, work_order_line: 2 * N + 6, import_batch: 2, import_row_receipt: 2 * N, scope_identity: 2 * N, job_assignment: 2 * N + 6, job: N });
    // Re-importing the changed file is again a pure replay.
    const snapshot = await counts(p.tenantId); expect(await importOf(p, demoFile(rows.map((r, i) => changedAt.has(i + 1) ? { ...r, expectedRevision: 1, lines: [{ clientLineReference: "L1", sorCode: "REPAIR-DOOR", quantity: "3" }, (r.lines as unknown[])[1]] } : { ...r, expectedRevision: 1 })), "again.csv")).toMatchObject({ replayed: true, batchId: second.batchId });
    expect(await counts(p.tenantId)).toEqual(snapshot);
  }, 600000);

  it("replays the stored batch only when it was clean: a file with a refused row is processed again under a new command", async () => {
    const { p, demo } = await org();
    const csv = demoFile([row1(demo, 1), row1(demo, 2, { lines: [{ clientLineReference: "L1", sorCode: "NO-SUCH-CODE", quantity: "1" }] })]);
    const first = await importOf(p, csv), again = await importOf(p, csv);
    expect(first).toMatchObject({ replayed: false, counts: { created: 1, rejected: 1 } });
    expect(again).toMatchObject({ replayed: false, counts: { created: 0, unchanged: 1, rejected: 1 } });
    expect(again.batchId).not.toBe(first.batchId);
    expect(await importOf(p, csv, "x.csv", first.commandId)).toMatchObject({ replayed: true, batchId: first.batchId });
  });

  it("answers the same file twice in a row as a replay, but processes an earlier file again as rows once later revisions have moved on (A, B, A; verdict P2-1)", async () => {
    const { p, demo } = await org(), N = 12, changed = new Set([2, 5, 9]);
    const rows = Array.from({ length: N }, (_, i) => row1(demo, i + 1));
    const fileA = demoFile(rows);
    const fileB = demoFile(rows.map((r, i) => changed.has(i + 1) ? { ...r, expectedRevision: 1, lines: [{ clientLineReference: "L1", sorCode: "REPAIR-DOOR", quantity: "3" }, (r.lines as unknown[])[1]] } : { ...r, expectedRevision: 1 }));
    const a1 = await importOf(p, fileA, "file-A.csv");
    expect(a1).toMatchObject({ replayed: false, counts: { rows: N, created: N, rejected: 0 } });
    // Same file twice in a row stays a pure replay.
    const afterA = await counts(p.tenantId);
    expect(await importOf(p, fileA, "file-A-twice.csv")).toMatchObject({ replayed: true, batchId: a1.batchId });
    expect(await counts(p.tenantId)).toEqual(afterA);
    // File B revises three of A's orders.
    const b = await importOf(p, fileB, "file-B.csv");
    expect(b).toMatchObject({ replayed: false, counts: { rows: N, created: 0, revised: 3, unchanged: N - 3, rejected: 0 } });
    const afterB = await counts(p.tenantId);
    // File A again is NOT answered from A's stored batch ("created 12"): it is processed row by row against what is now current.
    const a2 = await importOf(p, fileA, "file-A-again.csv");
    expect(a2.replayed).toBe(false);
    expect(a2.batchId).not.toBe(a1.batchId);
    expect(a2.counts).toEqual({ rows: N, created: 0, revised: 0, unchanged: N - 3, rejected: 3 });
    // The three orders B revised are refused as stale (file A still says revision 0): B's later content is never silently overwritten, and the refusal is on the record.
    expect(a2.rows.filter(r => r.outcome === "rejected").map(r => [r.rowNumber, r.errorCode])).toEqual([[3, "STALE_REVISION"], [6, "STALE_REVISION"], [10, "STALE_REVISION"]]);
    expect(await counts(p.tenantId)).toEqual({ ...afterB, import_batch: afterB.import_batch! + 1, import_row_receipt: afterB.import_row_receipt! + N, audit_event: afterB.audit_event! + 1 });
    expect((await admin.query("SELECT count(*)::int n FROM app.work_order_revision WHERE tenant_id=$1 AND revision=2", [p.tenantId])).rows[0].n).toBe(3);
    // A batch with a refused row is never a replay source, so file A is processed again each time...
    expect((await importOf(p, fileA, "file-A-third.csv")).replayed).toBe(false);
    // ...while file B, whose batch still describes the current state of every order it touched, remains a replay.
    expect(await importOf(p, fileB, "file-B-again.csv")).toMatchObject({ replayed: true, batchId: b.batchId });
  });
});

describe("ENT-2 DW2 import validation", () => {
  it("refuses another tenant's contract, client, site and team, committing nothing of those orders", async () => {
    const a = await org(), b = await org();
    const before = await counts(a.p.tenantId);
    const result = await importOf(a.p, demoFile([
      row1(a.demo, 1, { contractId: b.demo.contractId }), row1(a.demo, 2, { clientId: b.demo.clientId, contractId: b.demo.contractId }),
      row1(a.demo, 3, { siteRevisionId: b.demo.siteRevisionIds[0] }), row1(a.demo, 4, { teamId: b.demo.teamId, assignedMembershipIds: [] }), row1(a.demo, 5, { assignedMembershipIds: [b.demo.operativeMembershipId] }),
    ]));
    expect(result.rows.map(r => [r.outcome, r.errorCode])).toEqual([["rejected", "PARTY_NOT_FOUND"], ["rejected", "NOT_FOUND"], ["rejected", "PARTY_NOT_FOUND"], ["rejected", "ASSIGNMENT_INVALID"], ["rejected", "ASSIGNMENT_INVALID"]]);
    const after = await counts(a.p.tenantId);
    // Only the batch and its five receipts (and the batch's audit event) were written.
    expect(after).toEqual({ ...before, import_batch: before.import_batch! + 1, import_row_receipt: before.import_row_receipt! + 5, audit_event: before.audit_event! + 1 });
    expect(await counts(b.p.tenantId)).toMatchObject({ work_order: 0, import_batch: 0 });
  });
  it("commits no part of a failing order, whichever stage fails (job and parties bound, order inserted, or assignment refused)", async () => {
    const { p, demo } = await org();
    await importOf(p, demoFile([row1(demo, 1)]));
    const before = await counts(p.tenantId);
    const stages = [
      row1(demo, 2, { lines: [{ clientLineReference: "L1", sorCode: "NO-SUCH-CODE", quantity: "1" }] }),
      row1(demo, 3, { teamId: randomUUID(), assignedMembershipIds: [] }),
      row1(demo, 4, { assignedMembershipIds: [randomUUID()] }),
      row1(demo, 5, { siteRevisionId: null }),
    ];
    const result = await importOf(p, demoFile(stages));
    expect(result.rows.map(r => r.errorCode)).toEqual(["UNKNOWN_SOR_CODE", "ASSIGNMENT_INVALID", "ASSIGNMENT_INVALID", "CONTRACTOR_PARTIES_REQUIRED"]);
    const after = await counts(p.tenantId);
    for (const table of [...ENT2_TABLES, ...SPINE_TABLES].filter(t => !["import_batch", "import_row_receipt", "audit_event"].includes(t))) expect(after[table], table).toBe(before[table]);
    expect(after.audit_event).toBe(before.audit_event! + 1);
  });
  it("gives each malformed row its own typed error in its receipt (unknown code, negative quantity, more than 6 decimals, money out of range, missing site) and imports the good rows around them", async () => {
    const { p, demo } = await org();
    const one = (n: number, quantity: string, sorCode = "REPAIR-DOOR", extra: Record<string, unknown> = {}) => row1(demo, n, { lines: [{ clientLineReference: "L1", sorCode, quantity }], ...extra });
    const result = await importOf(p, demoFile([one(1, "1"), one(2, "1", "NO-SUCH-CODE"), one(3, "-1"), one(4, "1.1234567"), one(5, "999999999999"), one(6, "1", "REPAIR-DOOR", { siteRevisionId: null }), one(7, "1e2"), one(8, "2"), row1(demo, 9, { status: "live" }), one(10, "1", "REPAIR-DOOR", { workOrderReference: "x".repeat(101) })]));
    expect(result.rows.map(r => r.errorCode)).toEqual([null, "UNKNOWN_SOR_CODE", "NEGATIVE_QUANTITY", "QUANTITY_PRECISION", "MONEY_OUT_OF_RANGE", "CONTRACTOR_PARTIES_REQUIRED", "INVALID_QUANTITY", null, "INVALID_ROW", "INVALID_ROW"]);
    expect(result.counts).toEqual({ rows: 10, created: 2, revised: 0, unchanged: 0, rejected: 8 });
    expect((await counts(p.tenantId)).work_order).toBe(2);
  });
  it("refuses malformed files outright: unknown header, unterminated quote, forged tenant, provenance, status, track, origin and price columns", async () => {
    const { p, demo } = await org(); const before = await counts(p.tenantId);
    const good = demoFile([row1(demo, 1)]);
    await expect(importOf(p, good.replace("version,", "tenantId,"))).rejects.toMatchObject({ code: "INVALID_CSV_HEADER" });
    await expect(importOf(p, good + '"unterminated')).rejects.toMatchObject({ code: "INVALID_CSV" });
    for (const field of ["tenantId", "provenance", "status_override", "track", "origin", "price", "netPence"]) {
      // The header is fixed, so an extra column cannot be smuggled in: the file is refused as a whole.
      const [header, ...records] = good.split("\r\n");
      await expect(importOf(p, [`${header},${field}`, ...records.map(r => r ? `${r},forged` : r)].join("\r\n"))).rejects.toMatchObject({ code: "INVALID_CSV_HEADER" });
    }
    const forgedLine = await importOf(p, demoFile([row1(demo, 2, { lines: [{ clientLineReference: "L1", sorCode: "REPAIR-DOOR", quantity: "1", origin: "office_entry", netPence: 1 }] })]));
    expect(forgedLine.rows[0]).toMatchObject({ outcome: "rejected", errorCode: "INVALID_ROW" });
    expect(await counts(p.tenantId)).toEqual({ ...before, import_batch: before.import_batch! + 1, import_row_receipt: before.import_row_receipt! + 1, audit_event: before.audit_event! + 1 });
  });
});

describe("ENT-2 DW3 immutability, cancellation and stable scope identity", () => {
  it("denies runtime and owner updates and deletes of revisions and lines, and records a cancellation as a revision", async () => {
    const { p, demo } = await org(); const created = await importOf(p, demoFile([row1(demo, 1)]));
    const { workOrderId, revisionId } = created.rows[0]!;
    for (const sql of ["UPDATE app.work_order_revision SET priority='urgent'", "DELETE FROM app.work_order_revision", "UPDATE app.work_order_line SET quantity='9'", "DELETE FROM app.work_order_line", "UPDATE app.work_order SET reference='x'", "DELETE FROM app.work_order", "UPDATE app.import_row_receipt SET outcome='created'", "UPDATE app.sor_item SET rate_pence=1", "DELETE FROM app.sor_version"]) {
      await expect(withTenant(runtime, ctx(p), db => db.$client.query(sql)), sql).rejects.toMatchObject({ code: "42501" });
      await expect(withTenant(admin, testTenantContext(p.tenantId), db => db.$client.query(sql)), `owner ${sql}`).rejects.toMatchObject({ code: "55000" });
    }
    const cancelled = await importOf(p, demoFile([row1(demo, 1, { status: "cancelled", expectedRevision: 1, lines: [] })]));
    expect(cancelled.rows[0]).toMatchObject({ outcome: "revised", workOrderId });
    const revisions = (await admin.query("SELECT id,revision,status,diff FROM app.work_order_revision WHERE work_order_id=$1 ORDER BY revision", [workOrderId])).rows;
    expect(revisions.map(r => [r.revision, r.status])).toEqual([[1, "ordered"], [2, "cancelled"]]);
    expect(revisions[0]!.id).toBe(revisionId); expect(revisions[1]!.diff).toMatchObject({ fields: ["status"], added: [], removed: [], changed: [] });
    // The cancelled revision keeps the lines (so the identities), and the pointer now names it.
    const lines = (await admin.query("SELECT revision_id,scope_item_id FROM app.work_order_line WHERE work_order_id=$1 ORDER BY position, revision_id", [workOrderId])).rows;
    expect(new Set(lines.map(l => l.scope_item_id)).size).toBe(2); expect(lines).toHaveLength(4);
    expect((await admin.query("SELECT revision_id FROM app.work_order_current WHERE work_order_id=$1", [workOrderId])).rows[0].revision_id).toBe(revisions[1]!.id);
    // The pointer moves only forward.
    await expect(withTenant(admin, testTenantContext(p.tenantId), db => db.$client.query("UPDATE app.work_order_current SET revision_id=$1 WHERE work_order_id=$2", [revisionId, workOrderId]))).rejects.toMatchObject({ code: "55000" });
    // Importing the same cancellation again is a recorded no-op; a stale expected revision is refused.
    // The identical file is a pure replay; the same cancelling row in a different file is a recorded no-op.
    expect(await importOf(p, demoFile([row1(demo, 1, { status: "cancelled", expectedRevision: 1, lines: [] })]), "again.csv")).toMatchObject({ replayed: true });
    expect((await importOf(p, demoFile([row1(demo, 1, { status: "cancelled", expectedRevision: 1, lines: [] }), row1(demo, 2)]), "again-with-another.csv")).rows[0]).toMatchObject({ outcome: "unchanged", revisionId: revisions[1]!.id });
    expect((await importOf(p, demoFile([row1(demo, 1, { priority: "emergency", expectedRevision: 1 })]), "stale.csv")).rows[0]).toMatchObject({ outcome: "rejected", errorCode: "STALE_REVISION" });
    // A cancellation of an order that does not exist is refused.
    expect((await importOf(p, demoFile([row1(demo, 77, { status: "cancelled", lines: [] })]), "ghost.csv")).rows[0]).toMatchObject({ outcome: "rejected", errorCode: "ORDER_NOT_FOUND" });
  });
  it("keeps the scope identity of unchanged lines: matched by client line reference, else by SoR code and position", async () => {
    const { p, demo } = await org();
    const lines = (n: number) => [{ clientLineReference: "A", sorCode: "REPAIR-DOOR", quantity: "1" }, { clientLineReference: null, sorCode: "FIT-LOCK", quantity: String(n) }];
    const first = await importOf(p, demoFile([row1(demo, 1, { lines: lines(1) })]));
    const second = await importOf(p, demoFile([row1(demo, 1, { expectedRevision: 1, lines: [{ clientLineReference: "B", sorCode: "PAINT-ROOM", quantity: "1" }, { clientLineReference: "A", sorCode: "REPAIR-DOOR", quantity: "2" }, { clientLineReference: null, sorCode: "FIT-LOCK", quantity: "9" }] })]));
    expect(second.rows[0]!.outcome).toBe("revised");
    const identity = async (revision: number) => (await admin.query("SELECT l.client_line_reference ref,l.sor_code,l.position,l.scope_item_id FROM app.work_order_line l JOIN app.work_order_revision r ON r.id=l.revision_id WHERE r.work_order_id=$1 AND r.revision=$2 ORDER BY l.position", [first.rows[0]!.workOrderId, revision])).rows;
    const one = await identity(1), two = await identity(2);
    // A keeps its identity at a new position; the code+position line FIT-LOCK moved from position 1 to 2, so it is a new line.
    expect(two.find(l => l.ref === "A")!.scope_item_id).toBe(one.find(l => l.ref === "A")!.scope_item_id);
    expect(two.find(l => l.ref === "B")!.scope_item_id).not.toBe(one.find(l => l.ref === null)!.scope_item_id);
    expect(two.find(l => l.ref === null)!.scope_item_id).not.toBe(one.find(l => l.ref === null)!.scope_item_id);
    // The same position and code keep their identity.
    const third = await importOf(p, demoFile([row1(demo, 1, { expectedRevision: 2, lines: [{ clientLineReference: "B", sorCode: "PAINT-ROOM", quantity: "1" }, { clientLineReference: "A", sorCode: "REPAIR-DOOR", quantity: "2" }, { clientLineReference: null, sorCode: "FIT-LOCK", quantity: "7" }] })]));
    const three = (await admin.query("SELECT l.client_line_reference ref,l.scope_item_id FROM app.work_order_line l JOIN app.work_order_revision r ON r.id=l.revision_id WHERE r.work_order_id=$1 AND r.revision=3 ORDER BY l.position", [third.rows[0]!.workOrderId])).rows;
    expect(three.map(l => l.scope_item_id)).toEqual(two.map(l => l.scope_item_id));
    // Every identity is in the existing registry, for this job only.
    const job = (await admin.query("SELECT job_id FROM app.work_order WHERE id=$1", [first.rows[0]!.workOrderId])).rows[0].job_id;
    expect((await admin.query("SELECT count(*)::int n FROM app.scope_identity WHERE job_id=$1 AND state='confirmed'", [job])).rows[0].n).toBe(4);
  });
  it("refuses changes to the parties a job was bound to (CH-3b binds them once) and an incomplete restatement", async () => {
    const { p, demo } = await org();
    await importOf(p, demoFile([row1(demo, 1)]));
    const result = await importOf(p, demoFile([
      row1(demo, 1, { expectedRevision: 1, siteRevisionId: demo.siteRevisionIds[2], priority: "emergency" }),
      row1(demo, 1, { expectedRevision: 1, resident: { kind: "none", reason: "void_property" } }),
      row1(demo, 1, { expectedRevision: 1, siteRevisionId: null }),
      row1(demo, 1, { expectedRevision: 1, clientId: randomUUID() }),
      row1(demo, 1),
    ]));
    expect(result.rows.map(r => r.errorCode)).toEqual(["PARTY_CHANGE_REFUSED", "PARTY_CHANGE_REFUSED", "CONTRACTOR_PARTIES_REQUIRED", "PARTY_CHANGE_REFUSED", null]);
    expect(result.rows[4]!.outcome).toBe("unchanged");
  });
});

describe("ENT-2 DW4 live from import, with no fee setup", () => {
  it("makes the job live at import, passing watchdogActive, with no quote, acceptance, obligation, journal, cap or fee-policy row", async () => {
    const { p, demo } = await org(); const created = await importOf(p, demoFile([row1(demo, 1)]));
    const jobId = (await admin.query("SELECT job_id FROM app.work_order WHERE id=$1", [created.rows[0]!.workOrderId])).rows[0].job_id;
    const job = (await admin.query("SELECT * FROM app.job WHERE id=$1", [jobId])).rows[0];
    expect(job).toMatchObject({ provenance: "work_order", status: "live", revision: 2, accepted_quote_version_id: null, baseline_quote_version_id: null, accepted_net_value_pence: null, fee_policy_version: null, recovery_cap_pence: null });
    expect(watchdogActive(job)).toBe(true);
    await expect(withTenant(runtime, ctx(p), db => db.$client.query("SELECT app.require_watchdog_live($1)", [jobId]))).resolves.toBeTruthy();
    expect((await admin.query("SELECT job_track,environment,provenance FROM app.job_commercial_track WHERE job_id=$1", [jobId])).rows).toEqual([{ job_track: "contractor", environment: "synthetic_demo", provenance: "work_order_import" }]);
    // Of every table that carries a job_id, only the contractor / party / scope records have rows for this job: no quote, acceptance, activation, baseline, cap, obligation, journal or fee row.
    const jobTables = (await admin.query("SELECT table_name FROM information_schema.columns WHERE table_schema='app' AND column_name='job_id' AND table_name IN(SELECT tablename FROM pg_tables WHERE schemaname='app') ORDER BY table_name")).rows.map(r => r.table_name as string);
    const populated: string[] = [];
    for (const table of jobTables) if ((await admin.query(`SELECT count(*)::int n FROM app.${table} WHERE job_id=$1`, [jobId])).rows[0].n > 0) populated.push(table);
    expect(populated.sort()).toEqual(["contractor_party_binding", "contractor_resident_contact", "job_assignment", "job_commercial_track", "job_party_binding", "job_party_current", "scope_identity", "work_order", "work_order_line"]);
    for (const forbidden of ["quote_version", "quote_document_version", "quote_acceptance", "job_activation", "imported_job_baseline", "cap_snapshot", "synthetic_obligation", "recovery_fee_journal", "fee_illustration_source", "ledger_book"]) expect(populated, forbidden).not.toContain(forbidden);
    expect((await admin.query("SELECT count(*)::int n FROM app.journal WHERE tenant_id=$1", [p.tenantId])).rows[0].n).toBe(0);
    // A work-order job can be neither created nor moved by runtime SQL, and its provenance is immutable.
    await expect(withTenant(runtime, ctx(p), db => db.$client.query("INSERT INTO app.job(id,tenant_id,title,provenance) VALUES($1,$2,'Forged','work_order')", [randomUUID(), p.tenantId]))).rejects.toMatchObject({ code: "42501" });
    await expect(withTenant(admin, testTenantContext(p.tenantId), db => db.$client.query("INSERT INTO app.job(id,tenant_id,title,provenance) VALUES($1,$2,'Forged','work_order')", [randomUUID(), p.tenantId]))).rejects.toMatchObject({ code: "42501" });
    await expect(withTenant(admin, testTenantContext(p.tenantId), db => db.$client.query("UPDATE app.job SET provenance='imported' WHERE id=$1", [jobId]))).rejects.toMatchObject({ code: "55000" });
  });
  it("CH-3b DW1 held clause: the import calls app.bind_contractor_parties in its transaction and the routine refuses each missing party, committing nothing", async () => {
    const { p, demo } = await org(); const before = await counts(p.tenantId);
    const bindWith = (fields: Record<string, unknown>) => withTenant(runtime, ctx(p), async db => {
      const jobId = randomUUID();
      await db.$client.query("SELECT app.work_order_begin($1,$2,'Fictional held clause')", [p.membershipId, jobId]);
      return parties.bindInTransaction(db, p, { version: "contractor-party-import.v1", environment: "synthetic_demo", commandId: randomUUID(), jobId, workOrderId: randomUUID(), expectedJobRevision: 0, clientId: demo.clientId, contractId: demo.contractId, siteRevisionId: demo.siteRevisionIds[0], resident: { kind: "contact", contact: { version: "resident-contact.v1", ...resident(1) } }, ...fields });
    });
    for (const missing of ["clientId", "contractId", "siteRevisionId", "resident"]) {
      await assertContractorPartiesRequired(() => bindWith({ [missing]: null }));
      expect(await counts(p.tenantId), `missing ${missing}`).toEqual(before);
    }
    // The same through the import path: the receipt carries the routine's typed refusal, and nothing of the order is committed.
    for (const missing of ["clientId", "contractId", "siteRevisionId", "resident"]) {
      const result = await importOf(p, demoFile([row1(demo, 1, { [missing]: null })]));
      expect(result.rows[0], missing).toMatchObject({ outcome: "rejected", errorCode: "CONTRACTOR_PARTIES_REQUIRED" });
    }
    expect((await counts(p.tenantId)).job).toBe(before.job);
    const complete = await importOf(p, demoFile([row1(demo, 1)]));
    expect(complete.rows[0]).toMatchObject({ outcome: "created" });
    // The routine bound the order exactly once, with the order's own identity.
    expect((await admin.query("SELECT count(*)::int n FROM app.contractor_party_binding WHERE work_order_id=$1", [complete.rows[0]!.workOrderId])).rows[0].n).toBe(1);
  });
  it("refuses an import for a small-builder-track tenant with the typed TRACK_FORBIDDEN, for both the order and the SoR import (Q5)", async () => {
    const { p, demo } = await org(); const csv = demoFile([row1(demo, 1)]);
    const before = await counts(p.tenantId);
    await withTenant(admin, testTenantContext(p.tenantId), async db => {
      const assignment = randomUUID();
      await db.$client.query("SELECT app.assign_commercial_track($1,$2,'small_builder',$3,1,'operations:test')", [p.tenantId, assignment, `synthetic-agreement:${p.tenantId}`]);
      const { appendAuditBatch } = await import("../src/index.js");
      await appendAuditBatch(db, [{ id: assignment, version: "audit.v1", actorRef: "operations:test", eventType: "commercial_track.assigned", subjectType: "tenant", subjectRef: p.tenantId, payload: { references: { environment: "synthetic_demo" } } }]);
    });
    await expect(importOf(p, csv)).rejects.toMatchObject({ code: "TRACK_FORBIDDEN" });
    await expect(rates.importVersion(p, { version: "sor-version-import.v1", environment: "synthetic_demo", commandId: randomUUID(), scheduleId: randomUUID(), reference: "Fictional small builder", effectiveFrom: "2026-02-01", items: [{ code: "X", description: "x", unit: "each", rate: { pence: 1, currency: "GBP" } }] })).rejects.toMatchObject({ code: "TRACK_FORBIDDEN" });
    await expect(orders.overview(p)).rejects.toMatchObject({ code: "TRACK_FORBIDDEN" });
    expect({ ...(await counts(p.tenantId)), audit_event: 0 }).toEqual({ ...before, audit_event: 0 });
  });
});

describe("ENT-2 DW6 personal data and origin", () => {
  it("keeps resident name, phone and email out of audit payloads, receipts, projections, the batch results and captured logs", async () => {
    const spies = [vi.spyOn(console, "log"), vi.spyOn(console, "info"), vi.spyOn(console, "warn"), vi.spyOn(console, "error"), vi.spyOn(console, "debug")];
    try {
      const { p, demo } = await org(); const canary = resident(321);
      const rowsIn = [row1(demo, 1, { resident: { kind: "contact", contact: { version: "resident-contact.v1", ...canary } } }), row1(demo, 2, { siteRevisionId: null, resident: { kind: "contact", contact: { version: "resident-contact.v1", ...canary } } })];
      const result = await importOf(p, demoFile(rowsIn));
      const revised = await importOf(p, demoFile([{ ...rowsIn[0]!, expectedRevision: 1, priority: "emergency" }]), "revise.csv");
      const overview = await orders.overview(p), batch = await orders.batch(p, result.batchId), revisions = await orders.revisions(p, result.rows[0]!.workOrderId!);
      const stored = [(await admin.query("SELECT payload FROM app.audit_event WHERE tenant_id=$1", [p.tenantId])).rows, (await admin.query("SELECT result FROM app.command_receipt WHERE tenant_id=$1", [p.tenantId])).rows, (await admin.query("SELECT * FROM app.import_row_receipt WHERE tenant_id=$1", [p.tenantId])).rows,
        (await admin.query("SELECT * FROM app.work_order_revision WHERE tenant_id=$1", [p.tenantId])).rows, (await admin.query("SELECT * FROM app.work_order_line WHERE tenant_id=$1", [p.tenantId])).rows, (await admin.query("SELECT title FROM app.job WHERE tenant_id=$1", [p.tenantId])).rows];
      const serialized = JSON.stringify([stored, result, revised, overview, batch, revisions, spies.map(s => s.mock.calls)]);
      for (const value of Object.values(canary)) expect(serialized).not.toContain(value);
      expect(serialized).not.toMatch(/"(resident|residentContact|resident_name|resident_email|resident_phone)"/u);
      // The audit payload allowlist: identifiers, hashes and the operational classification only.
      for (const event of (await admin.query("SELECT event_type,payload FROM app.audit_event WHERE tenant_id=$1 AND event_type LIKE 'contractor.work_order%'", [p.tenantId])).rows) {
        expect(Object.keys(event.payload).sort()).toEqual(["classifications", "hashes", "references"]); expect(Object.keys(event.payload.hashes)).toEqual(["document"]);
        expect(Object.keys(event.payload.references).sort()).toEqual(event.event_type === "contractor.work_order_import.recorded" ? ["batchId", "commandId", "environment"] : ["commandId", "environment", "revisionId", "workOrderId"]);
      }
    } finally { spies.forEach(s => s.mockRestore()); }
  });
  it("can write no origin but client_instruction: lines carry it by CHECK, and no import receipt can raise an extra origin of any kind", async () => {
    const { p, demo } = await org(); const created = await importOf(p, demoFile([row1(demo, 1)]));
    expect((await admin.query("SELECT DISTINCT origin FROM app.work_order_line WHERE tenant_id=$1", [p.tenantId])).rows).toEqual([{ origin: "client_instruction" }]);
    const line = (await admin.query("SELECT * FROM app.work_order_line WHERE revision_id=$1 AND position=0", [created.rows[0]!.revisionId])).rows[0];
    for (const origin of ["site_user", "jobguard_surfaced_confirmed", "office_entry", "builder_logged", "final_review", "jobguard_catch", ""]) {
      await expect(withTenant(admin, testTenantContext(p.tenantId), db => db.$client.query("INSERT INTO app.work_order_line(tenant_id,id,work_order_id,revision_id,job_id,position,scope_item_id,sor_version_id,sor_code,unit,rate_pence,quantity,net_pence,origin) VALUES($1,$2,$3,$4,$5,9,$6,$7,$8,$9,$10,$11,$12,$13)",
        [p.tenantId, randomUUID(), line.work_order_id, line.revision_id, line.job_id, randomUUID(), line.sor_version_id, line.sor_code, line.unit, line.rate_pence, line.quantity, line.net_pence, origin])), origin).rejects.toMatchObject({ code: expect.stringMatching(/^(23514|23503)$/u) });
    }
    // SH-1's command-type map: the only receipts an import writes are contractor_parties.bind, which maps to no extra kind, so extra_origin refuses all four contractor kinds tried below.
    const bind = (await admin.query("SELECT command_id,actor_membership_id FROM app.command_receipt WHERE tenant_id=$1 AND command_type='contractor_parties.bind'", [p.tenantId])).rows;
    expect(bind).toHaveLength(1);
    expect((await admin.query("SELECT DISTINCT command_type FROM app.command_receipt WHERE tenant_id=$1 AND command_type NOT LIKE 'contractor.%' ORDER BY command_type", [p.tenantId])).rows).toEqual([{ command_type: "contractor_parties.bind" }, { command_type: "contractor_parties.link" }]);
    for (const kind of ["site_user", "jobguard_surfaced_confirmed", "office_entry", "client_instruction"]) {
      await expect(withTenant(runtime, ctx(p), db => db.$client.query("INSERT INTO app.extra_origin(tenant_id,job_id,variation_id,job_track,kind,command_id,raising_membership_id,raising_role,provenance,source_capture_kind,source_capture_hash) VALUES($1,$2,$3,'contractor',$4,$5,$6,'owner','command','text',$7)",
        [p.tenantId, line.job_id, randomUUID(), kind, bind[0]!.command_id, p.membershipId, "a".repeat(64)])), kind).rejects.toMatchObject({ code: "23514" });
    }
    expect((await admin.query("SELECT count(*)::int n FROM app.variation WHERE tenant_id=$1", [p.tenantId])).rows[0].n).toBe(0);
    expect((await admin.query("SELECT count(*)::int n FROM app.extra_origin WHERE tenant_id=$1", [p.tenantId])).rows[0].n).toBe(0);
  });
});

describe("ENT-2 roles: who may import (Ben, 9 Oct 2026, card jobguard-ent-2-import-roles-2026-10-08, \"Existing roles\")", () => {
  const importAllowed: Record<ContractorRole, boolean> = { owner: true, admin: true, finance: true, operative: false, supervisor: false, surveyor: false, commercial_manager: false, read_only: false, client_approver: false };
  const sorAllowed: Record<ContractorRole, boolean> = { owner: true, admin: true, commercial_manager: true, finance: false, operative: false, supervisor: false, surveyor: false, read_only: false, client_approver: false };
  let fixture: Awaited<ReturnType<typeof org>>; const actors = new Map<ContractorRole, AuthenticatedMembership>();
  beforeAll(async () => {
    fixture = await org();
    const v = await view(fixture.p);
    for (const role of contractorRoles) {
      if (role === "owner") { actors.set(role, fixture.p); continue; }
      const scope = role === "operative" ? { kind: "team", id: v.teams[0]!.id } : role === "client_approver" ? { kind: "client", id: fixture.demo.clientId } : { kind: "tenant", id: fixture.p.tenantId };
      actors.set(role, await member(fixture.p, role, scope, role === "client_approver" ? fixture.demo.clientId : null));
    }
  }, 120000);
  const sorBody = () => ({ version: "sor-version-import.v1", environment: "synthetic_demo", commandId: randomUUID(), scheduleId: randomUUID(), reference: `Fictional roles ${randomUUID()}`, effectiveFrom: "2027-01-01", items: [{ code: "R-1", description: "Roles test item", unit: "each", rate: { pence: 100, currency: "GBP" } }] });
  for (const role of contractorRoles) it(`work-order import: ${role} is ${importAllowed[role] ? "allowed" : "refused"}`, async () => {
    const actor = actors.get(role)!, { demo, p } = fixture, reference = `WO-ROLE-${role}`;
    const attempt = () => importOf(actor, demoFile([row1(demo, 1, { workOrderReference: reference })]), `${role}.csv`);
    if (importAllowed[role]) {
      const result = await attempt();
      expect(result.rows[0], role).toMatchObject({ outcome: "created", errorCode: null });
      expect((await orders.overview(actor)).orders.some(o => o.reference === reference), `${role} reads the register it imported into`).toBe(true);
    } else {
      const before = await counts(p.tenantId);
      await expect(attempt(), role).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(orders.overview(actor), `${role} overview`).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(await counts(p.tenantId), role).toEqual(before);
    }
  }, 60000);
  for (const role of contractorRoles) it(`SoR price-list import: ${role} is ${sorAllowed[role] ? "allowed" : "refused"}`, async () => {
    const actor = actors.get(role)!, { p } = fixture;
    if (sorAllowed[role]) {
      const body = sorBody(), result = await rates.importVersion(actor, body);
      expect(result).toMatchObject({ itemCount: 1, replayed: false });
      expect(await rates.importVersion(actor, body)).toMatchObject({ versionId: result.versionId, replayed: true });
    } else {
      const before = await counts(p.tenantId);
      await expect(rates.importVersion(actor, sorBody()), role).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(await counts(p.tenantId), role).toEqual(before);
    }
  }, 60000);
  it("refuses a non-member, a revoked member, an expired member and a scoped admin whose scope holds no client, for both imports", async () => {
    const { p, demo } = fixture, v = await view(p);
    const csv = demoFile([row1(demo, 1, { workOrderReference: "WO-ROLE-nonmember" })]);
    for (const stranger of [{ ...p, membershipId: randomUUID() }, { ...p, identityUserId: randomUUID() }] as AuthenticatedMembership[]) {
      await expect(importOf(stranger, csv)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(rates.importVersion(stranger, sorBody())).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    const revoked = await member(p, "admin", { kind: "tenant", id: p.tenantId }); await command(p, { kind: "membership.revoke", membershipId: revoked.membershipId });
    const expired = await member(p, "admin", { kind: "tenant", id: p.tenantId }); await admin.query("UPDATE app.membership SET expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2", [p.tenantId, expired.membershipId]);
    for (const gone of [revoked, expired]) { await expect(importOf(gone, csv)).rejects.toMatchObject({ code: "NOT_FOUND" }); await expect(rates.importVersion(gone, sorBody())).rejects.toMatchObject({ code: "NOT_FOUND" }); }
    // A branch-scoped admin holds organisation.manage only inside that branch: the demo client sits in another branch, so there is nothing for them to import.
    const region = v.units.find(u => u.kind === "region")!.id;
    const otherBranch = (await command(p, { kind: "unit.create", unitKind: "branch", parentId: region, name: "Fictional other branch" })).id;
    const branchAdmin = await member(p, "admin", { kind: "branch", id: otherBranch });
    await expect(importOf(branchAdmin, csv)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(rates.importVersion(branchAdmin, sorBody())).rejects.toMatchObject({ code: "NOT_FOUND" });
    // An admin of the client's own branch may import for that client (organisation.manage on the client) but cannot import a SoR version (not tenant-wide).
    const ownBranchAdmin = await member(p, "admin", { kind: "branch", id: v.teams[0]!.branch_id });
    expect((await importOf(ownBranchAdmin, demoFile([row1(demo, 1, { workOrderReference: "WO-ROLE-branch-admin" })]), "branch.csv")).rows[0]).toMatchObject({ outcome: "created" });
    await expect(rates.importVersion(ownBranchAdmin, sorBody())).rejects.toMatchObject({ code: "NOT_FOUND" });
  }, 60000);
  it("scopes the revisions view and the scheduling projections to the same not-found for out-of-scope and non-existent ids", async () => {
    const { p, demo } = fixture; const created = (await orders.overview(p)).orders[0]!;
    const outsider = actors.get("client_approver")!, reader = actors.get("read_only")!;
    await expect(orders.revisions(outsider, created.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(orders.revisions(outsider, randomUUID())).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(scheduling.assignments(outsider, created.jobId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(scheduling.assignments(outsider, randomUUID())).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(scheduling.siteVisits(outsider, created.jobId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    // A tenant-wide reader (job.read) sees the assignment; hierarchy identifiers are never job identifiers, even for them.
    expect((await scheduling.assignments(reader, created.jobId)).team).toMatchObject({ id: demo.teamId });
    expect((await scheduling.siteVisits(reader, created.jobId)).visits).toEqual([]);
    for (const id of [demo.teamId, demo.clientId, demo.branchId, p.tenantId]) await expect(scheduling.assignments(reader, id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("ENT-2 per-order authority: a manager scoped to one branch has no reach into another branch's orders (verdict REPAIR at de29e5c, P1-1)", () => {
  let fixture: Awaited<ReturnType<typeof org>>, demoB: WorkOrderDemo, adminA: AuthenticatedMembership, adminB: AuthenticatedMembership, adminAll: AuthenticatedMembership, finance: AuthenticatedMembership;
  const rowB = (n: number, overrides: Record<string, unknown> = {}) => demoRow(demoB, n, { assignedMembershipIds: [], ...overrides });
  const changedLines = [{ clientLineReference: "L1", sorCode: "REPAIR-DOOR", quantity: "7" }, { clientLineReference: "L2", sorCode: "FIT-LOCK", quantity: "1" }];
  /** A fresh order in each branch (references WO-DEMO-n for client A and WO-DEMO-(n+1) for client B), imported by the tenant owner. */
  async function seed(n: number) {
    const { p, demo } = fixture, result = await importOf(p, demoFile([row1(demo, n), rowB(n + 1)]), `seed-${n}.csv`);
    const one = async (r: (typeof result.rows)[number]) => ({ id: r.workOrderId!, reference: r.reference!, jobId: (await admin.query("SELECT job_id FROM app.work_order WHERE id=$1", [r.workOrderId])).rows[0].job_id as string });
    return { batchId: result.batchId, a: await one(result.rows[0]!), b: await one(result.rows[1]!) };
  }
  const stateOf = async (workOrderId: string) => (await admin.query("SELECT r.revision,r.status FROM app.work_order_current k JOIN app.work_order_revision r ON(r.tenant_id,r.work_order_id,r.id)=(k.tenant_id,k.work_order_id,k.revision_id) WHERE k.work_order_id=$1", [workOrderId])).rows[0] as { revision: number; status: string };
  const revisionCount = async (workOrderId: string) => (await admin.query("SELECT count(*)::int n FROM app.work_order_revision WHERE work_order_id=$1", [workOrderId])).rows[0].n as number;
  const referencesOf = async (clientId: string) => (await admin.query("SELECT reference FROM app.work_order WHERE client_id=$1 ORDER BY reference", [clientId])).rows.map(r => r.reference as string);
  const sameNotFound = (hidden: Error & { code?: string }, unknown: Error & { code?: string }) => { expect(hidden).toMatchObject({ code: "NOT_FOUND" }); expect({ ...hidden }).toEqual({ ...unknown }); expect(hidden.message).toBe(unknown.message); };
  beforeAll(async () => {
    fixture = await org(); const { p, demo } = fixture;
    demoB = await addBranchClient(runtime, p, demo, "Second");
    expect(demoB.branchId).not.toBe(demo.branchId); expect(demoB.clientId).not.toBe(demo.clientId);
    adminA = await member(p, "admin", { kind: "branch", id: demo.branchId });
    adminB = await member(p, "admin", { kind: "branch", id: demoB.branchId });
    adminAll = await member(p, "admin", { kind: "tenant", id: p.tenantId });
    finance = await member(p, "finance", { kind: "tenant", id: p.tenantId });
  }, 180000);

  it("shows a branch-scoped admin only the orders, batches and revisions of clients in that branch: the other branch's are the same not-found as an unknown id", async () => {
    const { p, demo } = fixture, s = await seed(10), bOnly = await importOf(p, demoFile([rowB(12)]), "branch-b-only.csv"), bOrder = bOnly.rows[0]!.workOrderId!;
    // Register: each branch admin lists exactly the orders of the clients in their own branch.
    expect((await orders.overview(adminA)).orders.map(o => o.reference).sort()).toEqual((await referencesOf(demo.clientId)).sort());
    expect((await orders.overview(adminB)).orders.map(o => o.reference).sort()).toEqual((await referencesOf(demoB.clientId)).sort());
    // Batches: a batch holding only the other branch's rows is not listed; a mixed batch is listed with only this branch's rows counted.
    const batchesA = (await orders.overview(adminA)).batches, batchesB = (await orders.overview(adminB)).batches;
    expect(batchesA.map(b => b.sourceName)).toContain("seed-10.csv"); expect(batchesA.map(b => b.sourceName)).not.toContain("branch-b-only.csv");
    expect(batchesB.map(b => b.sourceName)).toContain("branch-b-only.csv");
    expect(batchesA.find(b => b.sourceName === "seed-10.csv")!.counts).toEqual({ rows: 1, created: 1, revised: 0, unchanged: 0, rejected: 0 });
    // Batch view: only this branch's receipts; the other branch's batch is the same not-found as an unknown id.
    const mixed = await orders.batch(adminA, s.batchId);
    expect(mixed.rows.map(r => r.reference)).toEqual([s.a.reference]); expect(mixed.counts).toEqual({ rows: 1, created: 1, revised: 0, unchanged: 0, rejected: 0 });
    expect((await orders.batch(adminB, s.batchId)).rows.map(r => r.reference)).toEqual([s.b.reference]);
    sameNotFound(await orders.batch(adminA, bOnly.batchId).catch(e => e), await orders.batch(adminA, randomUUID()).catch(e => e));
    // Revisions: own branch yes; the other branch's order is the same not-found as an unknown id.
    expect((await orders.revisions(adminA, s.a.id)).revisions).toHaveLength(1); expect((await orders.revisions(adminB, s.b.id)).revisions).toHaveLength(1);
    sameNotFound(await orders.revisions(adminA, s.b.id).catch(e => e), await orders.revisions(adminA, randomUUID()).catch(e => e));
    sameNotFound(await orders.revisions(adminB, s.a.id).catch(e => e), await orders.revisions(adminB, randomUUID()).catch(e => e));
    sameNotFound(await orders.revisions(adminA, bOrder).catch(e => e), await orders.revisions(adminA, randomUUID()).catch(e => e));
    // A tenant-wide admin, finance (data.import) and the owner see both branches everywhere.
    for (const [label, actor] of [["owner", p], ["tenant-wide admin", adminAll], ["finance", finance]] as const) {
      const overview = await orders.overview(actor);
      expect(overview.orders.map(o => o.reference), label).toEqual(expect.arrayContaining([s.a.reference, s.b.reference, "WO-DEMO-0012"]));
      expect(overview.batches.map(b => b.sourceName), label).toEqual(expect.arrayContaining(["seed-10.csv", "branch-b-only.csv"]));
      expect((await orders.batch(actor, s.batchId)).rows, label).toHaveLength(2); expect((await orders.batch(actor, bOnly.batchId)).rows, label).toHaveLength(1);
      expect((await orders.revisions(actor, s.a.id)).revisions, label).toHaveLength(1); expect((await orders.revisions(actor, s.b.id)).revisions, label).toHaveLength(1);
    }
  });

  it("refuses a branch-A admin's revision and cancellation of a branch-B order through the import, as it would for an order that does not exist, and commits nothing of it", async () => {
    const { p, demo } = fixture, s1 = await seed(20), s2 = await seed(30), before = await counts(p.tenantId);
    const result = await importOf(adminA, demoFile([
      rowB(21, { expectedRevision: 1, lines: changedLines }),             // revise a branch-B order
      rowB(31, { expectedRevision: 1, status: "cancelled", lines: [] }),  // cancel a branch-B order
      rowB(97, { expectedRevision: 1, lines: changedLines }),             // the same shape for an order that does not exist
      rowB(98, { expectedRevision: 1, status: "cancelled", lines: [] }),
      row1(demo, 20, { expectedRevision: 1, lines: changedLines }),       // control: the admin's own branch revises normally
    ]), "cross-branch.csv");
    expect(result.rows.map(r => r.outcome)).toEqual(["rejected", "rejected", "rejected", "rejected", "revised"]);
    expect(result.rows[0]!.errorCode).not.toBeNull(); expect(result.rows[0]!.errorCode).toBe(result.rows[2]!.errorCode);
    expect(result.rows[1]!.errorCode).not.toBeNull(); expect(result.rows[1]!.errorCode).toBe(result.rows[3]!.errorCode);
    for (const r of result.rows.slice(0, 4)) { expect(r.workOrderId).toBeNull(); expect(r.revisionId).toBeNull(); }
    expect([await stateOf(s1.b.id), await stateOf(s2.b.id)]).toEqual([{ revision: 1, status: "ordered" }, { revision: 1, status: "ordered" }]);
    expect([await revisionCount(s1.b.id), await revisionCount(s2.b.id), await revisionCount(s1.a.id)]).toEqual([1, 1, 2]);
    const after = await counts(p.tenantId);
    expect(after).toEqual({ ...before, work_order_revision: before.work_order_revision! + 1, work_order_line: before.work_order_line! + 2, job_assignment: before.job_assignment! + 2, import_batch: before.import_batch! + 1, import_row_receipt: before.import_row_receipt! + 5, audit_event: before.audit_event! + 2 });
    // The reverse holds too: a branch-B admin cannot touch branch A.
    const reverse = await importOf(adminB, demoFile([row1(demo, 20, { expectedRevision: 2, status: "cancelled", lines: [] })]), "reverse.csv");
    expect(reverse.rows[0]).toMatchObject({ outcome: "rejected", workOrderId: null }); expect(await stateOf(s1.a.id)).toEqual({ revision: 2, status: "ordered" });
  });

  // Probes call the controlled routines directly, as the runtime role, inside a savepoint that is always rolled back: nothing is committed whatever the answer.
  const probe = (actor: AuthenticatedMembership, sql: string, params: unknown[]) => withTenant(runtime, ctx(actor), async db => {
    const c = db.$client; await c.query("SAVEPOINT probe");
    try { return { ok: true as const, value: (await c.query(sql, params)).rows[0] }; }
    catch (error) { return { ok: false as const, code: (error as { code?: string }).code, message: (error as Error).message }; }
    finally { await c.query("ROLLBACK TO SAVEPOINT probe"); }
  });
  const refused = { ok: false, code: "P0002", message: "NOT_FOUND" };
  const commitSql = "SELECT app.work_order_commit($1,$2::jsonb) result";
  /** A complete, correctly priced revise payload for a branch-B order (and its cancellation); the tenant-wide admin's identical payload is accepted, which proves it is valid. */
  const commitPayloads = (order: { id: string; jobId: string; reference: string }) => {
    const base = { version: "work-order-commit.v1", kind: "revise", rowNumber: 2, jobId: order.jobId, workOrderId: order.id, reference: order.reference, expectedRevision: 1, issuedOn: fixture.demo.issuedOn, dueOn: null, priority: "routine", contentHash: "0".repeat(64), diff: {}, adjustment: fixture.demo.adjustment, team: { teamId: null, membershipIds: [] } };
    return {
      revise: () => ({ ...base, batchId: randomUUID(), revisionId: randomUUID(), status: "ordered", sorVersionId: fixture.demo.sorVersionId,
        lines: [{ id: randomUUID(), scopeItemId: randomUUID(), position: 0, clientLineReference: "L1", sorVersionId: fixture.demo.sorVersionId, sorCode: "REPAIR-DOOR", unit: "each", quantity: "7", ratePence: 10000, netPence: 67550, origin: "client_instruction" }] }),
      cancel: () => ({ ...base, batchId: randomUUID(), revisionId: randomUUID(), status: "cancelled", sorVersionId: null, lines: [] }),
    };
  };

  it("answers a branch-A admin's party check on a branch-B order with the not-found whatever is guessed: the check is no yes/no oracle on another branch's resident contact", async () => {
    const s = await seed(40), row = rowB(41), resident = { kind: "contact", contact: (row.resident as { contact: unknown }).contact }, wrong = JSON.stringify({ kind: "none", reason: "void_property" });
    const check = "SELECT app.work_order_parties_unchanged($1,$2,$3,$4,$5,$6::jsonb) same", args = [s.b.id, demoB.clientId, demoB.contractId, row.siteRevisionId];
    // A tenant-wide admin gets the real answer to the right and the wrong guess.
    expect(await probe(adminAll, check, [adminAll.membershipId, ...args, JSON.stringify(resident)])).toEqual({ ok: true, value: { same: true } });
    expect(await probe(adminAll, check, [adminAll.membershipId, ...args, wrong])).toEqual({ ok: true, value: { same: false } });
    // Branch A's admin gets the not-found to every guess, and to an order that does not exist.
    expect(await probe(adminA, check, [adminA.membershipId, ...args, JSON.stringify(resident)])).toEqual(refused);
    expect(await probe(adminA, check, [adminA.membershipId, ...args, wrong])).toEqual(refused);
    expect(await probe(adminA, check, [adminA.membershipId, randomUUID(), ...args.slice(1), JSON.stringify(resident)])).toEqual(refused);
  });

  it("refuses at work_order_commit a branch-A admin's revision and cancellation of a branch-B order, while the tenant-wide admin's and finance's identical commands are accepted", async () => {
    const s = await seed(44), payloads = commitPayloads(s.b);
    for (const [label, payload] of [["revise", payloads.revise], ["cancel", payloads.cancel]] as const) {
      expect(await probe(adminAll, commitSql, [adminAll.membershipId, JSON.stringify(payload())]), `${label} by the tenant-wide admin`).toMatchObject({ ok: true, value: { result: { revision: 2 } } });
      expect(await probe(finance, commitSql, [finance.membershipId, JSON.stringify(payload())]), `${label} by finance`).toMatchObject({ ok: true, value: { result: { revision: 2 } } });
      expect(await probe(adminA, commitSql, [adminA.membershipId, JSON.stringify(payload())]), `${label} by the branch-A admin`).toEqual(refused);
    }
    expect(await probe(adminA, commitSql, [adminA.membershipId, JSON.stringify({ ...payloads.revise(), workOrderId: randomUUID() })]), "an order that does not exist").toEqual(refused);
    expect(await stateOf(s.b.id)).toEqual({ revision: 1, status: "ordered" }); expect(await revisionCount(s.b.id)).toBe(1);
  });

  it("refuses at work_order_commit a create whose parties were bound to a branch-B client when branch A's admin commits it (defence in depth), and accepts it for the tenant-wide admin", async () => {
    const s = await seed(48), row = rowB(49), resident = { kind: "contact", contact: (row.resident as { contact: unknown }).contact }, payloads = commitPayloads(s.b);
    const created: Array<{ ok: boolean; code?: string | undefined; message?: string | undefined }> = [];
    await withTenant(runtime, ctx(adminAll), async db => {
      const c = db.$client, jobId = randomUUID(), workOrderId = randomUUID();
      await c.query("SELECT app.work_order_begin($1,$2,'Work order probe')", [adminAll.membershipId, jobId]);
      await parties.bindInTransaction(db, adminAll, { version: "contractor-party-import.v1", environment: "synthetic_demo", commandId: randomUUID(), jobId, workOrderId, expectedJobRevision: 0, clientId: demoB.clientId, contractId: demoB.contractId, siteRevisionId: row.siteRevisionId, resident });
      const create = () => JSON.stringify({ ...payloads.revise(), kind: "create", jobId, workOrderId, reference: "WO-PROBE-CREATE", expectedRevision: 0 });
      for (const actor of [adminA, adminAll]) {
        await c.query("SAVEPOINT create_probe");
        try { await c.query(commitSql, [actor.membershipId, create()]); created.push({ ok: true }); }
        catch (error) { created.push({ ok: false, code: (error as { code?: string }).code, message: (error as Error).message }); }
        finally { await c.query("ROLLBACK TO SAVEPOINT create_probe"); }
      }
      throw new Error("roll the probe back");
    }).catch(error => { if ((error as Error).message !== "roll the probe back") throw error; });
    expect(created).toEqual([refused, { ok: true }]);
    expect((await admin.query("SELECT count(*)::int n FROM app.work_order WHERE reference='WO-PROBE-CREATE'")).rows[0].n).toBe(0);
  });

  it("lets a tenant-wide admin and finance revise and cancel the orders of both branches through the import, and each branch admin revise their own", async () => {
    const { demo } = fixture, s = await seed(50), t = await seed(60);
    const revisedBy = async (actor: AuthenticatedMembership, rows: Record<string, unknown>[], name: string) => (await importOf(actor, demoFile(rows), name)).rows.map(r => [r.outcome, r.errorCode]);
    expect(await revisedBy(adminAll, [row1(demo, 50, { expectedRevision: 1, lines: changedLines }), rowB(51, { expectedRevision: 1, lines: changedLines })], "all-admin.csv")).toEqual([["revised", null], ["revised", null]]);
    expect(await revisedBy(finance, [row1(demo, 60, { expectedRevision: 1, status: "cancelled", lines: [] }), rowB(61, { expectedRevision: 1, status: "cancelled", lines: [] })], "finance.csv")).toEqual([["revised", null], ["revised", null]]);
    expect(await revisedBy(adminA, [row1(demo, 50, { expectedRevision: 2, priority: "emergency" })], "own-a.csv")).toEqual([["revised", null]]);
    expect(await revisedBy(adminB, [rowB(51, { expectedRevision: 2, priority: "emergency" })], "own-b.csv")).toEqual([["revised", null]]);
    expect([await stateOf(s.a.id), await stateOf(s.b.id), await stateOf(t.a.id), await stateOf(t.b.id)]).toEqual([{ revision: 3, status: "ordered" }, { revision: 3, status: "ordered" }, { revision: 2, status: "cancelled" }, { revision: 2, status: "cancelled" }]);
  });
});

describe("ENT-2 tenant boundary", () => {
  it("answers another tenant's batch, order, job and revision ids exactly as it answers unknown ones, and refuses a context that is missing, hand-built or not a tenant's", async () => {
    const a = await org(), b = await org();
    const result = await importOf(b.p, demoFile([row1(b.demo, 1)])); const bOrder = result.rows[0]!.workOrderId!, bJob = (await admin.query("SELECT job_id FROM app.work_order WHERE id=$1", [bOrder])).rows[0].job_id as string;
    const probes: Array<() => Promise<unknown>> = [() => orders.batch(a.p, result.batchId), () => orders.revisions(a.p, bOrder), () => scheduling.assignments(a.p, bJob), () => scheduling.siteVisits(a.p, bJob)];
    const unknown: Array<() => Promise<unknown>> = [() => orders.batch(a.p, randomUUID()), () => orders.revisions(a.p, randomUUID()), () => scheduling.assignments(a.p, randomUUID()), () => scheduling.siteVisits(a.p, randomUUID())];
    for (let i = 0; i < probes.length; i++) {
      const hidden = await probes[i]!().catch(e => e) as Error & { code?: string }, absent = await unknown[i]!().catch(e => e) as Error & { code?: string };
      expect(hidden, `probe ${i}`).toMatchObject({ code: "NOT_FOUND" }); expect({ ...hidden }).toEqual({ ...absent }); expect(hidden.message).toBe(absent.message);
    }
    // A principal naming tenant B with tenant A's membership, or tenant A's with an unrelated membership, is a non-member everywhere.
    await expect(importOf({ ...a.p, tenantId: b.p.tenantId }, demoFile([row1(b.demo, 2)]))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(orders.overview({ ...b.p, membershipId: a.p.membershipId })).rejects.toMatchObject({ code: "NOT_FOUND" });
    // The controlled routines refuse to run without a transaction-local tenant, and a tenant context made by hand never reaches PostgreSQL.
    for (const sql of ["SELECT app.work_order_begin($1,$2,'x')", "SELECT app.work_order_commit($1,'{}'::jsonb)", "SELECT app.import_batch_record($1,'{}'::jsonb)", "SELECT app.import_sor_version($1,'{}'::jsonb)", "SELECT app.work_order_parties_unchanged($1,$1,$1,$1,$1,'{}'::jsonb)"]) {
      await expect(runtime.query(sql, sql.includes("$2") ? [a.p.membershipId, randomUUID()] : [a.p.membershipId]), sql).rejects.toMatchObject({ message: expect.stringMatching(/^(NOT_FOUND|MODE_FORBIDDEN|INVALID_COMMAND)$/u) });
    }
    await expect(withTenant(runtime, { tenantId: a.p.tenantId } as never, db => db.$client.query("SELECT 1"))).rejects.toMatchObject({ code: "INVALID_TENANT_CONTEXT" });
    await expect(importOf({ ...a.p, tenantId: "not-a-uuid" }, demoFile([row1(a.demo, 3)]))).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await counts(a.p.tenantId)).work_order).toBe(0);
  });
});

describe("ENT-2 office reads", () => {
  it("lists batches and orders and shows each revision with its diff and stable line identities, for import-capable members and the job's own team", async () => {
    const { p, demo } = await org();
    const first = await importOf(p, demoFile([row1(demo, 1), row1(demo, 2)]), "first.csv");
    const second = await importOf(p, demoFile([row1(demo, 1, { expectedRevision: 1, lines: [{ clientLineReference: "L1", sorCode: "REPAIR-DOOR", quantity: "4" }, { clientLineReference: "L2", sorCode: "PAINT-ROOM", quantity: "1" }] }), row1(demo, 2)]), "second.csv");
    const overview = await orders.overview(p);
    expect(overview.batches.map(b => b.sourceName)).toEqual(["second.csv", "first.csv"]);
    expect(overview.orders.map(o => [o.reference, o.revision, o.jobStatus]).sort()).toEqual([["WO-DEMO-0001", 2, "live"], ["WO-DEMO-0002", 1, "live"]]);
    expect((await orders.batch(p, first.batchId)).rows).toHaveLength(2); await expect(orders.batch(p, randomUUID())).rejects.toMatchObject({ code: "NOT_FOUND" });
    const revisions = await orders.revisions(p, first.rows[0]!.workOrderId!);
    expect(revisions.revisions.map(r => r.revision)).toEqual([1, 2]);
    expect(revisions.revisions[1]!.diff.changed).toHaveLength(2);
    expect(revisions.revisions[0]!.lines.map(l => l.scopeItemId).slice(0, 1)).toEqual(revisions.revisions[1]!.lines.map(l => l.scopeItemId).slice(0, 1));
    expect(revisions.revisions[0]!.lines.map(l => l.netPence)).toEqual([9650, 8685]);
    expect(second.counts.revised).toBe(1);
    // The assigned operative reads the job's order through the assignment, not through import authority.
    const unassigned = await member(p, "operative", { kind: "team", id: demo.teamId });
    await expect(orders.revisions(unassigned, first.rows[0]!.workOrderId!)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const assigned = { ...p, membershipId: demo.operativeMembershipId, identityUserId: (await admin.query("SELECT identity_user_id FROM app.membership WHERE id=$1", [demo.operativeMembershipId])).rows[0].identity_user_id } as AuthenticatedMembership;
    expect((await orders.revisions(assigned, first.rows[0]!.workOrderId!)).revisions).toHaveLength(2);
    await expect(orders.overview(assigned)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
  it("canonicalJson is key-order independent, so a request hash is stable", () => { expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe(canonicalJson({ a: [2, { c: 2, d: 1 }], b: 1 })); });
});
