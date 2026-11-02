/** Test-only reviewed expectations. Never infer an allowance from a live catalogue. */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import { MIGRATION_URLS } from "../src/migrate.js";
import { inventorySchema, type Inventory } from "./lp-0-catalog.js";

const exact = z.string().min(1).refine(s => !/[*?\[\]]/.test(s), "exact identity required");
const name = z.string().regex(/^\d{4}_[a-z0-9_]+\.sql$/);
const owner = z.string().regex(/^[a-z_][a-z0-9_]*$/);
const routine = z.object({ nspname: exact, proname: exact, args: z.string(), proowner: owner,
  proacl: z.string().nullable(), prosecdef: z.boolean(), proconfig: z.array(z.string()).nullable() }).strict();
const relation = z.object({ nspname: exact, relname: exact, relowner: owner,
  relacl: z.string().nullable(), relrowsecurity: z.boolean(), relforcerowsecurity: z.boolean() }).strict();
const policy = z.object({ schemaname: exact, tablename: exact, policyname: exact, permissive: z.enum(["PERMISSIVE", "RESTRICTIVE"]),
  roles: z.union([z.string(), z.array(z.string())]), cmd: z.enum(["ALL", "SELECT", "INSERT", "UPDATE", "DELETE"]),
  qual: z.string().nullable(), with_check: z.string().nullable() }).strict();
const row = z.object({ table: exact, data: z.array(z.json()) }).strict();
function change<K extends string, S extends z.ZodType>(section: K, schema: S) {
  return z.object({ section: z.literal(section), before: schema.nullable(), after: schema.nullable() }).strict()
    .refine(c => { const v = c as unknown as { before: unknown; after: unknown }; return v.before !== null || v.after !== null; }, "empty change");
}
// Lazy references avoid an initialization cycle with the LP-0 loading boundary.
const lp0Change = z.union([
  change("groups", z.lazy(() => inventorySchema.shape.groups.element)),
  change("entries", z.lazy(() => inventorySchema.shape.entries.element)),
  change("authorityPaths", z.lazy(() => inventorySchema.shape.authorityPaths.element)),
  change("targetState", z.lazy(() => inventorySchema.shape.targetState.element)),
  change("routines", z.lazy(() => inventorySchema.shape.recorded.shape.routines.element)),
  change("rls", exact), change("policies", exact), change("triggers", exact),
]);
export const proofSchema = z.object({ migration: name, lp0: z.array(lp0Change),
  upgrade: z.array(z.union([change("rows", row), change("routines", routine), change("relations", relation), change("policies", policy)])),
  tenancy: z.array(z.object({ relname: exact, before: z.object({ relrowsecurity: z.boolean(), relforcerowsecurity: z.boolean(), guarded: z.boolean(), owner }).strict().nullable(),
    after: z.object({ relrowsecurity: z.boolean(), relforcerowsecurity: z.boolean(), guarded: z.boolean(), owner }).strict().nullable() }).strict()
    .refine(c => c.before !== null || c.after !== null, "empty tenancy change")),
}).strict();
export type MigrationProof = z.infer<typeof proofSchema>;
export const PROOF_DIRECTORY = fileURLToPath(new URL("./migration-proofs/", import.meta.url));
const json = (file: string): unknown => JSON.parse(readFileSync(file, "utf8"));
function unique(values: string[], label: string) {
  if (new Set(values).size !== values.length) throw new Error(`duplicate ${label}`);
}

/** Names, not a numeric cutoff: even an unused low-number migration needs a proof. */
export function loadMigrationProofs(directory = PROOF_DIRECTORY, migrations = MIGRATION_URLS.map(u => u.pathname.split("/").at(-1)!)) {
  const legacyPath = join(directory, "legacy-migrations.json");
  const legacy = z.array(name).parse(json(legacyPath));
  unique(legacy, "legacy migration"); unique(migrations, "migration");
  for (const migration of migrations) name.parse(migration);
  for (const old of legacy) if (!migrations.includes(old)) throw new Error(`missing legacy migration: ${old}`);
  const expected = migrations.filter(m => !legacy.includes(m));
  const files = readdirSync(directory, { withFileTypes: true });
  for (const file of files) {
    if (!file.isFile() || (file.name !== "legacy-migrations.json" && !expected.some(m => file.name === m.replace(/\.sql$/, ".proof.json")))) {
      throw new Error(`orphan or unexpected proof: ${file.name}`);
    }
  }
  const sources = [legacyPath];
  const proofs = expected.map(migration => {
    const path = join(directory, migration.replace(/\.sql$/, ".proof.json"));
    const proof = proofSchema.parse(json(path));
    if (proof.migration !== migration) throw new Error(`mismatched migration: ${path}`);
    sources.push(path);
    return proof;
  });
  // Repeated identities require an exact sequential transition, never independent claims.
  const prior = new Map<string, unknown>();
  for (const proof of proofs) {
    const claims = new Set<string>();
    const claim = (key: string, before: unknown, after: unknown) => {
      if (claims.has(key) || (prior.has(key) &&
        (before === null || !isDeepStrictEqual(prior.get(key), before)))) {
        throw new Error(`duplicate proof identity: ${key}`);
      }
      claims.add(key); prior.set(key, after);
    };
    for (const c of proof.lp0) claim(`lp0:${c.section}:${lpIdentity(c.section, c.after ?? c.before)}`, c.before, c.after);
    for (const c of proof.upgrade) {
      const a = c.after ?? c.before;
      if (c.before && c.after && upgradeIdentity(c.section, c.before) !== upgradeIdentity(c.section, c.after)) throw new Error("changed upgrade identity");
      claim(`upgrade:${c.section}:${upgradeIdentity(c.section, a)}`, c.before, c.after);
    }
    for (const c of proof.tenancy) claim(`tenancy:${c.relname}`, c.before, c.after);
  }
  return { proofs, sources, legacy };
}

function lpIdentity(section: string, value: unknown): string {
  if (typeof value === "string") return value;
  const r = value as Record<string, unknown>;
  return String(section === "entries" ? r.key : section === "routines" ? r.identity : r.id);
}
function upgradeIdentity(section: string, value: unknown): string {
  const r = value as Record<string, unknown>;
  if (section === "rows") return String(r.table);
  return JSON.stringify(section === "routines" ? [r.nspname, r.proname, r.args] : section === "relations" ? [r.nspname, r.relname] : [r.schemaname, r.tablename, r.policyname]);
}
function patch<T>(values: T[], before: T | null, after: T | null, identity: (r: T) => string): T[] {
  const key = identity((after ?? before)!);
  if (before !== null && after !== null && identity(before) !== key) throw new Error(`changed identity: ${key}`);
  const found = values.find(v => identity(v) === key);
  if (before === null ? found !== undefined : !isDeepStrictEqual(found, before)) throw new Error(`before allowance mismatch: ${key}`);
  return [...values.filter(v => identity(v) !== key), ...(after === null ? [] : [after])];
}

export function combineLp0(baseline: Inventory, proofs: MigrationProof[]): Inventory {
  const result = structuredClone(baseline);
  for (const proof of proofs) for (const c of proof.lp0) {
    const target = ["routines", "rls", "policies", "triggers"].includes(c.section) ? result.recorded : result;
    const arrays = target as unknown as Record<string, unknown[]>;
    arrays[c.section] = patch(arrays[c.section]!, c.before, c.after, v => lpIdentity(c.section, v));
  }
  return result;
}

export type MigrationProofSnapshot = { rows: Record<string, unknown>; routines: Record<string, unknown>[]; relations: Record<string, unknown>[]; policies: Record<string, unknown>[] };
/** Only role-name -> OID resolution is external; every approved attribute comes from the proof. */
export function applyUpgradeProofs<T extends MigrationProofSnapshot>(baseline: T, proofs: MigrationProof[], ownerOids: Record<string, number>): T {
  const result = structuredClone(baseline);
  const resolve = (value: Record<string, unknown> | null) => {
    if (value === null) return null;
    const r = { ...value };
    for (const field of ["proowner", "relowner"]) if (field in r) {
      const oid = ownerOids[String(r[field])];
      if (oid === undefined) throw new Error(`missing owner: ${String(r[field])}`);
      r[field] = oid;
    }
    return r;
  };
  for (const proof of proofs) for (const c of proof.upgrade) {
    if (c.section === "rows") {
      const rows = Object.entries(result.rows).map(([table, data]) => ({ table, data }));
      result.rows = Object.fromEntries(patch(rows, c.before, c.after, r => r.table).map(r => [r.table, r.data]));
    } else {
      result[c.section] = patch(result[c.section], resolve(c.before), resolve(c.after), r => upgradeIdentity(c.section, r));
      const fields = c.section === "routines" ? ["nspname", "proname", "args"] : c.section === "relations" ? ["nspname", "relname"] : ["schemaname", "tablename", "policyname"];
      result[c.section].sort((a, b) => { for (const field of fields) { if (a[field] !== b[field]) return String(a[field]) < String(b[field]) ? -1 : 1; } return 0; });
    }
  }
  return result;
}

export function applyTenancyProofs<T extends { relname: string }>(baseline: T[], proofs: MigrationProof[], section: "rls" | "owner"): T[] {
  let result = structuredClone(baseline);
  for (const proof of proofs) for (const c of proof.tenancy) {
    const project = (value: typeof c.before) => value === null ? null : (section === "owner" ? { relname: c.relname, owner: value.owner } :
      { relname: c.relname, relrowsecurity: value.relrowsecurity, relforcerowsecurity: value.relforcerowsecurity, guarded: value.guarded }) as unknown as T;
    result = patch(result, project(c.before), project(c.after), r => r.relname);
  }
  return result.sort((a, b) => a.relname < b.relname ? -1 : a.relname > b.relname ? 1 : 0);
}

export function proofSourceDigests(paths: string[]): Record<string, string> {
  return Object.fromEntries(paths.map(path => [path, createHash("sha256").update(readFileSync(path)).digest("hex")]));
}
