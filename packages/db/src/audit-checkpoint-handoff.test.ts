import { createHash, randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { execFileSync } from "node:child_process";
import { Pool, type PoolClient } from "pg";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { runAuditCheckpointHandoff } from "./audit-checkpoint-handoff.js";
import { runAuditCheckpointHandoffCli } from "./audit-checkpoint-handoff-cli.js";

const tenant = randomUUID(), other = randomUUID(), headHash = "a".repeat(64);
const ownerUrl = `postgresql://fixture_owner:${randomUUID()}@fixture.invalid/jobguard_synthetic_demo`;
const options = { ownerUrl, operator: "ben.ops-1" };
let queries: Array<{ sql: string; values: unknown[] }>, handed: boolean, failure: string | undefined;
let release: ReturnType<typeof vi.fn>, end: ReturnType<typeof vi.spyOn>, connect: ReturnType<typeof vi.spyOn>;
let foundRole: string, database: string, operatorEvent: unknown[], mismatched: boolean;
beforeEach(() => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  queries = []; handed = false; failure = undefined; foundRole = "fixture_owner"; database = "jobguard_synthetic_demo"; operatorEvent = []; mismatched = false;
  release = vi.fn();
  const client = { release, async query(sql: string, values: unknown[] = []) {
    queries.push({ sql, values });
    if (sql.includes("session_user")) return { rows: [{ database, sessionUser: foundRole, owner: "fixture_owner", migrationMember: foundRole === "fixture_owner", runtimeMember: true }] };
    if (sql.includes("FROM audit_control.audit_head")) return { rows: [{ tenant_id: tenant }] };
    if (sql.includes("app.lock_audit_head()")) return { rows: [{ sequence: "1", event_hash: headHash }] };
    if (sql.includes("FROM app.audit_event") && sql.includes("LIMIT 1")) return { rows: [{ sequence: "1", event_hash: mismatched ? "f".repeat(64) : headHash }] };
    if (sql.includes("FROM audit_control.checkpoint") && !sql.startsWith("INSERT")) return { rows: [] };
    if (sql.includes("FROM app.audit_export_checkpoint")) return { rows: handed ? [{ sequence: "1", event_hash: headHash, event_sequence: "1", actual_hash: headHash }] : [] };
    if (sql.includes("current_setting")) return { rows: [{ tenant_id: tenant }] };
    if (sql.includes("clock_timestamp")) return { rows: [{ occurred_at: new Date("2026-10-11T22:30:00.000Z") }] };
    if (sql.startsWith("INSERT INTO app.audit_event")) operatorEvent = values;
    if (sql.startsWith("INSERT INTO audit_control.checkpoint")) return { rows: [{ recorded_at: new Date("2026-10-11T22:30:00.001Z") }] };
    if (sql.startsWith("INSERT INTO app.audit_export_checkpoint") && failure) throw Object.assign(new Error("driver detail omitted"), { code: failure });
    return { rows: [], rowCount: 1 };
  } } as unknown as PoolClient;
  connect = vi.spyOn(Pool.prototype, "connect").mockImplementation(async () => client);
  end = vi.spyOn(Pool.prototype, "end").mockResolvedValue(undefined);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

it("[A5] unchanged has no inserts and closes its sole connection", async () => {
  handed = true;
  expect(await runAuditCheckpointHandoff(options)).toMatchObject({ outcomes: [{ tenantId: tenant, outcome: "unchanged", sequence: 1 }] });
  expect(queries.some(q => q.sql.startsWith("INSERT"))).toBe(false);
  expect(queries.at(-1)?.sql).toBe("ROLLBACK");
  expect(release).toHaveBeenCalledWith(true); expect(end).toHaveBeenCalledOnce();
});
it("[A9] runtime login is refused before BEGIN or any write", async () => {
  foundRole = "jobguard_runtime";
  await expect(runAuditCheckpointHandoff(options)).rejects.toMatchObject({ code: "AUDIT_CHECKPOINT_FORBIDDEN", message: expect.stringContaining("jobguard_runtime") });
  expect(queries).toHaveLength(1); expect(release).toHaveBeenCalledWith(true);
});
it("[C-OPS-2] another login is refused and names the required owner and migration role", async () => {
  foundRole = "jobguard_identity";
  await expect(runAuditCheckpointHandoff(options)).rejects.toMatchObject({ code: "AUDIT_CHECKPOINT_FORBIDDEN", message: expect.stringContaining("fixture_owner acting as jobguard_migration") });
  expect(queries).toHaveLength(1);
});
it("[A13] modes, URL targets and malformed inputs fail before connecting", async () => {
  for (const mode of [undefined, "pilot_no_charge", "production_billing"]) {
    if (mode === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = mode;
    await expect(runAuditCheckpointHandoff(options)).rejects.toMatchObject({ code: "AUDIT_CHECKPOINT_MODE_HELD" });
  }
  process.env.JOBGUARD_ENV = "synthetic_demo";
  for (const url of [ownerUrl.replace("jobguard_synthetic_demo", "postgres"), ownerUrl.replace("postgresql:", "https:"), "invalid"]) await expect(runAuditCheckpointHandoff({ ...options, ownerUrl: url })).rejects.toMatchObject({ code: "AUDIT_CHECKPOINT_TARGET_FORBIDDEN" });
  await expect(runAuditCheckpointHandoff({ ...options, tenantId: "invalid" })).rejects.toMatchObject({ code: "AUDIT_CHECKPOINT_INVALID_INPUT" });
  expect(connect).not.toHaveBeenCalled();
});
it("[A13] connected target and unknown tenant fail without inserts", async () => {
  database = "postgres";
  await expect(runAuditCheckpointHandoff(options)).rejects.toMatchObject({ code: "AUDIT_CHECKPOINT_TARGET_FORBIDDEN" });
  database = "jobguard_synthetic_demo";
  await expect(runAuditCheckpointHandoff({ ...options, tenantId: other })).rejects.toMatchObject({ code: "AUDIT_CHECKPOINT_TENANT_NOT_FOUND" });
  expect(queries.some(q => q.sql.startsWith("INSERT"))).toBe(false);
});
it("[A14] trace locks before reads, uses only local settings and commits after copy", async () => {
  expect(await runAuditCheckpointHandoff(options)).toMatchObject({ outcomes: [{ outcome: "handed_off", sequence: 2 }] });
  const lock = queries.findIndex(q => q.sql.includes("app.lock_audit_head()"));
  expect(queries.slice(lock - 2, lock).map(q => q.sql)).toEqual(["SELECT set_config('app.tenant_id', $1, true)", "SET LOCAL ROLE jobguard_runtime"]);
  expect(queries.findIndex(q => q.sql.includes("FROM app.audit_event"))).toBeGreaterThan(lock);
  expect(queries.filter(q => /^SET ROLE/u.test(q.sql))).toEqual([]);
  const append = queries.findIndex(q => q.sql.startsWith("INSERT INTO app.audit_event"));
  const checkpoint = queries.findIndex(q => q.sql.startsWith("INSERT INTO audit_control.checkpoint"));
  const copy = queries.findIndex(q => q.sql.startsWith("INSERT INTO app.audit_export_checkpoint"));
  expect(append).toBeLessThan(checkpoint); expect(checkpoint).toBeLessThan(copy);
  expect(queries.slice(copy + 1).map(q => q.sql)).toEqual(["COMMIT"]);
});
it("[A14] copy failure rolls back and produces one redacted JSON line with exit 1", async () => {
  failure = "XX000"; const lines: string[] = [];
  const status = await runAuditCheckpointHandoffCli(["--operator", "ben.ops-1"], { JOBGUARD_ENV: "synthetic_demo", MIGRATION_DATABASE_URL: ownerUrl }, line => lines.push(line));
  expect(status).toBe(1); expect(lines).toHaveLength(1);
  expect(JSON.parse(lines[0]!)).toMatchObject({ ok: false, outcomes: [{ outcome: "failed", code: "AUDIT_CHECKPOINT_UNAVAILABLE" }] });
  expect(queries.at(-1)?.sql).toBe("ROLLBACK");
  for (const value of [ownerUrl, "fixture.invalid", new URL(ownerUrl).password, "driver detail"]) expect(lines[0]).not.toContain(value);
});
it("[C-OPS-4] requires a bounded plain operator label and records session user and server time", async () => {
  for (const operator of [undefined, "", "a".repeat(65), "two names", "mail@example.invalid", "name\n"]) {
    await expect(runAuditCheckpointHandoff({ ...options, operator } as typeof options)).rejects.toMatchObject({ code: "AUDIT_CHECKPOINT_INVALID_INPUT" });
  }
  expect(connect).not.toHaveBeenCalled();
  await runAuditCheckpointHandoff(options);
  expect(operatorEvent[8]).toEqual(new Date("2026-10-11T22:30:00.000Z"));
  expect(JSON.parse(operatorEvent[9] as string).references).toEqual({ environment: "synthetic_demo", priorSequence: "1", operator: "ben.ops-1", sessionUser: "fixture_owner" });
});
it("[C-OPS-4] CLI requires operator, refuses duplicate/unknown flags and says nothing to do", async () => {
  for (const args of [[], ["--operator"], ["--operator", "bad label"], ["--operator", "ben", "--operator", "ben"], ["--operator", "ben", "--unknown", tenant], ["--operator", "ben", "--tenant", "invalid"]]) {
    const lines: string[] = [];
    expect(await runAuditCheckpointHandoffCli(args, { JOBGUARD_ENV: "synthetic_demo", MIGRATION_DATABASE_URL: ownerUrl }, l => lines.push(l))).toBe(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ ok: false, code: "AUDIT_CHECKPOINT_INVALID_INPUT" });
  }
  handed = true; const lines: string[] = [];
  expect(await runAuditCheckpointHandoffCli(["--tenant", tenant, "--operator", "ben"], { JOBGUARD_ENV: "synthetic_demo", MIGRATION_DATABASE_URL: ownerUrl }, l => lines.push(l))).toBe(0);
  expect(JSON.parse(lines[0]!).outcomes[0]).toMatchObject({ outcome: "unchanged", message: "nothing to do" });
});
const root = resolve(import.meta.dirname, "../../..");
function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(e => {
    if (["node_modules", "dist", ".next", "test-results"].includes(e.name)) return [];
    const path = join(directory, e.name);
    return e.isDirectory() ? sources(path) : /\.(?:tsx?|m?js)$/u.test(e.name) ? [path] : [];
  });
}
it("[C-OPS-1] request source and API registrations cannot name or import the operator entry", () => {
  for (const path of [...sources(join(root, "apps/api/src")), ...sources(join(root, "apps/web")), ...sources(join(root, "packages/db/src")).filter(p => !p.includes("audit-checkpoint-handoff"))]) {
    const source = readFileSync(path, "utf8");
    expect(source, path).not.toMatch(/audit-checkpoint-handoff|runAuditCheckpointHandoff/u);
  }
  expect(JSON.parse(readFileSync(join(root, "packages/db/package.json"), "utf8")).exports).toHaveProperty(".");
  expect(Object.keys(JSON.parse(readFileSync(join(root, "packages/db/package.json"), "utf8")).exports)).toEqual(["."]);
});
it("[A15] [C-OPS-5] merged regression files and pinned boundary files match the issued base", () => {
  const paths = ["packages/db/test/audit-export.integration.test.ts", "packages/db/test/verify-audit-export-cli.test.ts", "packages/db/test/audit.integration.test.ts", "packages/db/test/tenancy.integration.test.ts", "packages/db/test/demo-bootstrap.integration.test.ts", "apps/api/src/audit-export/audit-export.application.test.ts", "apps/web/app/admin/contractor/audit-exports/page.test.tsx", "apps/web/e2e/ENT-10b.spec.ts", "packages/db/tools/synthetic-restore.mjs", "packages/db/migrations/0001_audit.sql", "packages/db/migrations/0121_audit_export.sql", "apps/api/src/auth/context-boundary.test.ts", ...["practice-session", "contractor-repository", "contractor-party-repository", "work-order-repository", "sor-repository", "job-scheduling-repository", "work-order-fixtures"].map(n => `packages/db/src/${n}.ts`)];
  const digest = (data: Buffer) => createHash("sha256").update(data).digest("hex");
  for (const path of paths) expect(digest(readFileSync(join(root, path))), path).toBe(digest(execFileSync("git", ["show", `4564e888b85aba559c542e935e52fe9f78769595:${path}`], { cwd: root, maxBuffer: 2_000_000 })));
});

it("[A14] disagreement path has no INSERT and ends in ROLLBACK", async () => {
  mismatched = true;
  expect((await runAuditCheckpointHandoff(options)).outcomes).toEqual([{ tenantId: tenant, outcome: "failed", sequence: null, code: "AUDIT_CHECKPOINT_DISAGREEMENT" }]);
  expect(queries.some(q => q.sql.startsWith("INSERT"))).toBe(false);
  expect(queries.at(-1)?.sql).toBe("ROLLBACK");
});
it.each([['23505', 'AUDIT_CHECKPOINT_DISAGREEMENT'], ['42501', 'AUDIT_CHECKPOINT_FORBIDDEN'], ['55P03', 'AUDIT_CHECKPOINT_UNAVAILABLE']])("[A14] %s transaction failure uses the closed code %s", async (code, expected) => {
  failure = code;
  expect((await runAuditCheckpointHandoff(options)).outcomes[0]).toMatchObject({ outcome: "failed", code: expected });
  expect(queries.at(-1)?.sql).toBe("ROLLBACK");
});
