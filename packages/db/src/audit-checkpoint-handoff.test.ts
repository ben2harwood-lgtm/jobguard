import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join, relative, posix } from "node:path";
import ts from "typescript";
import { exportAuditCheckpoints } from "./audit.js";
import { Pool, type PoolClient } from "pg";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { runAuditCheckpointHandoff } from "./audit-checkpoint-handoff.js";
import { runAuditCheckpointHandoffCli } from "./audit-checkpoint-handoff-cli.js";

const tenant = randomUUID(), other = randomUUID(), headHash = "a".repeat(64);
const parsedOwnerUrl = new URL("postgresql://fixture.invalid/jobguard_synthetic_demo");
parsedOwnerUrl.username = "fixture_owner";
parsedOwnerUrl.password = randomUUID();
const ownerUrl = parsedOwnerUrl.toString();
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
    if (["node_modules", ".next", "test-results", ".turbo", "coverage"].includes(e.name)) return [];
    const path = join(directory, e.name);
    return e.isDirectory() ? sources(path) : /\.(?:[cm]?[jt]sx?)$/u.test(e.name) || e.name === "package.json" ? [path] : [];
  });
}
type Manifest = { name: string; exports?: unknown; main?: string; dependencies?: Record<string, string>; devDependencies?: Record<string, string>; optionalDependencies?: Record<string, string>; peerDependencies?: Record<string, string> };
/** Conservative module graph: importing any module that reaches the operator is forbidden,
 * so aliases, namespaces, export stars and import-then-export bindings cannot hide it. */
function assertOperatorUnreachable(files: ReadonlyMap<string, string>): void {
  const packages = new Map<string, { directory: string; manifest: Manifest }>();
  for (const [path, text] of files) {
    if (/^(?:apps|packages)\/[^/]+\/package\.json$/u.test(path)) {
      const manifest = JSON.parse(text) as Manifest;
      packages.set(manifest.name, { directory: posix.dirname(path), manifest });
    }
  }
  const reachable = new Set<string>();
  const pending = ["@jobguard/api", "@jobguard/web"];
  while (pending.length) {
    const name = pending.pop()!;
    if (reachable.has(name)) continue;
    reachable.add(name);
    const pkg = packages.get(name);
    if (!pkg) throw new Error(`Missing workspace manifest: ${name}`);
    for (const dependencies of [pkg.manifest.dependencies, pkg.manifest.devDependencies, pkg.manifest.optionalDependencies, pkg.manifest.peerDependencies]) {
      for (const [dependency, version] of Object.entries(dependencies ?? {})) {
        if (packages.has(dependency)) pending.push(dependency);
        else if (version.startsWith("workspace:")) throw new Error(`Missing workspace manifest: ${dependency}`);
      }
    }
  }
  const strings = (value: unknown): string[] => typeof value === "string" ? [value] : value && typeof value === "object" ? Object.values(value).flatMap(strings) : [];
  const moduleFiles = (path: string): string[] => {
    const normalized = posix.normalize(path), stem = normalized.replace(/\.(?:[cm]?[jt]sx?)$/u, "");
    const variants = [normalized, ...[".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"].flatMap(extension => [stem + extension, posix.join(normalized, "index" + extension)])];
    // Inspect emitted targets too; before a build, resolve their corresponding source files.
    for (const candidate of [...variants]) if (candidate.includes("/dist/")) variants.push(candidate.replace("/dist/", "/src/"));
    return [...new Set(variants.filter(candidate => files.has(candidate)))];
  };
  const targetFiles = (directory: string, target: string): string[] => {
    const path = posix.normalize(posix.join(directory, target));
    if (!path.includes("*")) return moduleFiles(path);
    const [prefix, suffix] = path.split("*");
    const sourcePrefix = prefix!.replace("/dist/", "/src/");
    const sourceSuffix = suffix!.replace(/\.(?:[cm]?js)$/u, ".ts");
    return [...files.keys()].filter(file => file.startsWith(prefix!) && file.endsWith(suffix!) ||
      file.startsWith(sourcePrefix) && file.endsWith(sourceSuffix)).flatMap(moduleFiles);
  };
  const resolveModule = (from: string, specifier: string): string[] => {
    if (specifier.startsWith(".")) return moduleFiles(posix.join(posix.dirname(from), specifier));
    const name = [...packages.keys()].sort((a, b) => b.length - a.length).find(candidate => specifier === candidate || specifier.startsWith(candidate + "/"));
    if (!name) return [];
    const { directory, manifest } = packages.get(name)!;
    const subpath = specifier === name ? "." : "." + specifier.slice(name.length);
    let targets: string[] = [];
    if (manifest.exports !== undefined) {
      const exports = manifest.exports;
      if (exports && typeof exports === "object" && Object.keys(exports).some(k => k.startsWith("."))) {
        for (const [entry, value] of Object.entries(exports)) {
          if (entry === subpath) targets.push(...strings(value));
          else if (entry.includes("*")) {
            const [prefix, suffix] = entry.split("*");
            if (subpath.startsWith(prefix!) && subpath.endsWith(suffix!)) {
              const matched = subpath.slice(prefix!.length, suffix ? -suffix.length : undefined);
              targets.push(...strings(value).map(target => target.replaceAll("*", matched)));
            }
          }
        }
      } else if (subpath === ".") targets = strings(exports);
    } else targets = [subpath === "." ? manifest.main ?? "./src/index.ts" : subpath];
    return targets.flatMap(target => targetFiles(directory, target));
  };
  const operator = (path: string) => /^packages\/db\/(?:src|dist)\/audit-checkpoint-handoff(?:-cli)?\.(?:[cm]?[jt]sx?)$/u.test(path);
  const edges = new Map<string, string[]>();
  const reachesOperator = (path: string, visited = new Set<string>()): boolean => {
    if (operator(path)) return true;
    if (visited.has(path)) return false;
    visited.add(path);
    if (!edges.has(path)) {
      const source = ts.createSourceFile(path, files.get(path) ?? "", ts.ScriptTarget.Latest, true);
      const dependencies: string[] = [];
      const visit = (node: ts.Node) => {
        if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) dependencies.push(node.moduleSpecifier.text);
        if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference) && node.moduleReference.expression && ts.isStringLiteralLike(node.moduleReference.expression)) dependencies.push(node.moduleReference.expression.text);
        if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === "require") && node.arguments[0] && ts.isStringLiteralLike(node.arguments[0])) dependencies.push(node.arguments[0].text);
        ts.forEachChild(node, visit);
      };
      visit(source);
      edges.set(path, dependencies.flatMap(specifier => resolveModule(path, specifier)));
    }
    return edges.get(path)!.some(dependency => reachesOperator(dependency, visited));
  };
  const roots = new Set<string>();
  for (const name of reachable) {
    const { directory, manifest } = packages.get(name)!;
    for (const path of files.keys()) {
      if (path.startsWith(directory + "/") && /\.(?:[cm]?[jt]sx?)$/u.test(path) &&
        !/\/(?:dist|test|e2e)\/|\.(?:test|spec)\./u.test(path) && !operator(path)) roots.add(path);
    }
    for (const target of [...strings(manifest.exports), ...strings(manifest.main)]) for (const path of targetFiles(directory, target)) roots.add(path);
  }
  for (const path of roots) if (reachesOperator(path)) throw new Error(`Operator reachable from ${path}`);
}
it("[C-OPS-1] all transitive request workspace sources and package entry targets cannot reach the operator", () => {
  const files = new Map([...sources(join(root, "apps")), ...sources(join(root, "packages"))].map(path => [relative(root, path), readFileSync(path, "utf8")]));
  assertOperatorUnreachable(files);
});
function reachabilityFixture(): Map<string, string> {
  return new Map([
    ["apps/api/package.json", JSON.stringify({ name: "@jobguard/api", dependencies: { "@jobguard/bridge": "workspace:*" } })],
    ["apps/web/package.json", JSON.stringify({ name: "@jobguard/web" })],
    ["packages/bridge/package.json", JSON.stringify({ name: "@jobguard/bridge", dependencies: { "@jobguard/second": "workspace:*" }, exports: { ".": "./src/index.ts" } })],
    ["packages/second/package.json", JSON.stringify({ name: "@jobguard/second", dependencies: { "@jobguard/db": "workspace:*" }, exports: { ".": "./src/index.ts" } })],
    ["packages/db/package.json", JSON.stringify({ name: "@jobguard/db", exports: { ".": "./src/index.ts" } })],
    ["apps/api/src/handler.ts", 'import { safe } from "@jobguard/bridge";'],
    ["packages/bridge/src/index.ts", "export const safe = 1;"],
    ["packages/second/src/index.ts", "export const other = 1;"],
    ["packages/db/src/index.ts", "export const query = 1;"],
    ["packages/db/src/audit-checkpoint-handoff.ts", "export function runAuditCheckpointHandoff() {}"],
  ]);
}
it("[Round 1 F2] same guard permits an unrelated workspace graph", () => {
  expect(() => assertOperatorUnreachable(reachabilityFixture())).not.toThrow();
});
it("[Round 1 F2] same guard refuses a direct request import", () => {
  const files = reachabilityFixture();
  files.set("apps/api/src/handler.ts", 'import { runAuditCheckpointHandoff as entry } from "../../../packages/db/src/audit-checkpoint-handoff.js";');
  expect(() => assertOperatorUnreachable(files)).toThrow("Operator reachable");
});
it.each([
  'export { runAuditCheckpointHandoff as renamed } from "../../db/src/audit-checkpoint-handoff.js";',
  'export * from "../../db/src/audit-checkpoint-handoff.js";',
  'import { runAuditCheckpointHandoff as local } from "../../db/src/audit-checkpoint-handoff.js"; export { local as renamed };',
])("[Round 1 F2] same guard refuses an indirect alias through a second workspace: %s", reexport => {
  const files = reachabilityFixture();
  files.set("apps/api/src/handler.ts", 'import { entry } from "@jobguard/bridge";');
  files.set("packages/bridge/src/index.ts", 'export { renamed as entry } from "@jobguard/second";');
  files.set("packages/second/src/index.ts", reexport);
  expect(() => assertOperatorUnreachable(files)).toThrow("Operator reachable");
});
it("[Round 1 F2] emitted module outside source roots is harmless until exported", () => {
  const files = reachabilityFixture();
  files.set("packages/bridge/dist/entry.js", 'export * from "../../db/src/audit-checkpoint-handoff.js";');
  expect(() => assertOperatorUnreachable(files)).not.toThrow();
});
it.each(["exports", "main"])("[Round 1 F2] same guard refuses a %s target exposing the module", field => {
  const files = reachabilityFixture();
  files.set("packages/bridge/package.json", JSON.stringify({ name: "@jobguard/bridge", [field]: field === "exports" ? { "./operator": { import: "./dist/entry.js" } } : "./dist/entry.js" }));
  files.set("packages/bridge/dist/entry.js", 'export * from "../../db/src/audit-checkpoint-handoff.js";');
  expect(() => assertOperatorUnreachable(files)).toThrow("Operator reachable");
});
it("[C-OPS-5] operator source does not construct request tenant authority", () => {
  for (const name of ["audit-checkpoint-handoff.ts", "audit-checkpoint-handoff-cli.ts"]) {
    expect(readFileSync(join(root, "packages/db/src", name), "utf8")).not.toMatch(/verifiedTenantContextFromMembership|verifiedTenantContextForQueuedJob|VerifiedTenantContext|withTenant/u);
  }
});

it("[Round 1 F1] checkpoint export uses one materialized candidate statement for insert and disagreement", async () => {
  const query = vi.fn().mockResolvedValue({ rows: [] });
  expect(await exportAuditCheckpoints({ query } as unknown as Pool)).toEqual([]);
  expect(query).toHaveBeenCalledOnce();
  const sql = query.mock.calls[0]![0] as string;
  expect(sql).toMatch(/WITH candidates AS MATERIALIZED/u);
  expect(sql.match(/FROM app\.audit_event/gu)).toHaveLength(1);
  expect(sql).toMatch(/INSERT INTO audit_control\.checkpoint[\s\S]*FROM candidates/u);
  expect(sql).toMatch(/FROM candidates[\s\S]*JOIN audit_control\.checkpoint/u);
  expect(sql).toContain("ON CONFLICT (tenant_id, sequence) DO NOTHING");
});

it("[Round 1 F1] successful checkpoint results keep the existing public shape", async () => {
  const checkpoint = { tenantId: tenant, sequence: 7, eventHash: headHash, recordedAt: new Date() };
  const query = vi.fn().mockResolvedValue({ rows: [{ ...checkpoint, disagreement: false }] });
  expect(await exportAuditCheckpoints({ query } as unknown as Pool)).toEqual([checkpoint]);
  expect(query).toHaveBeenCalledOnce();
});
it("[Round 1 F1] candidate disagreement reports its exact identity alongside valid insert results", async () => {
  const query = vi.fn().mockResolvedValue({ rows: [
    { tenantId: other, sequence: 8, eventHash: headHash, recordedAt: new Date(), disagreement: false },
    { tenantId: tenant, sequence: 7, eventHash: "f".repeat(64), recordedAt: new Date(), disagreement: true },
  ] });
  await expect(exportAuditCheckpoints({ query } as unknown as Pool)).rejects.toMatchObject({ code: "AUDIT_VERIFICATION_FAILED", message: `Stored checkpoint differs for tenant ${tenant} at sequence 7` });
  expect(query).toHaveBeenCalledOnce();
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
