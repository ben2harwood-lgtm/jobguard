import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseInventory, pathCompleteness, repoFileExists, staticScan } from "./lp-0-catalog.js";
import { applyTenancyProofs, applyUpgradeProofs, combineLp0, proofSchema, type MigrationProofSnapshot } from "./migration-proof-loader.js";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = read("../migrations/0582_dark_ais.sql");
const proof = proofSchema.parse(JSON.parse(read("./migration-proofs/0582_dark_ais.proof.json")));
const baseline = parseInventory(JSON.parse(read("../../../docs/contracts/lp-0-effective-privileges-v1.json")));
const tables = ["ais_connection", "ais_lifecycle", "ais_observation", "ais_page"];

describe("M4-7 reviewed migration proof (source-only; no PostgreSQL claim)", () => {
  it("validates this fragment and preserves the shared baseline", () => {
    const combined = parseInventory(combineLp0(baseline, [proof]));
    expect(pathCompleteness(combined, repoFileExists)).toEqual([]);
    expect(combined.entries.filter(e => baseline.entries.some(b => b.key === e.key))).toEqual(baseline.entries);
    expect(proof.lp0.every(c => c.before === null)).toBe(true);
    expect(proof.upgrade.every(c => c.before === null)).toBe(true);
    expect(proof.tenancy.every(c => c.before === null)).toBe(true);
  });

  it("covers every new table, index, routine and policy with explicit ownership and forced tenant RLS", () => {
    expect([...migration.matchAll(/CREATE TABLE app\.(\w+)/g)].map(m => m[1])).toEqual(tables);
    const snapshot = applyUpgradeProofs<MigrationProofSnapshot>({ rows: {}, routines: [], relations: [], policies: [] }, [proof], { jobguard_migration: 42 });
    expect(Object.keys(snapshot.rows)).toEqual(tables.map(t => `app.${t}`));
    expect(snapshot.routines.map(r => r.proname)).toEqual(["ais_immutable", "dark_ais"]);
    expect(snapshot.relations.map(r => r.relname)).toEqual([
      "ais_connection", "ais_connection_pkey", "ais_connection_tenant_id_state_hash_key",
      "ais_lifecycle", "ais_lifecycle_pkey", "ais_link_once", "ais_observation", "ais_observation_pkey", "ais_page", "ais_page_pkey",
    ]);
    expect(snapshot.relations.every(r => r.relowner === 42)).toBe(true);
    for (const r of snapshot.relations) {
      // PostgreSQL RLS applies to parent tables, never to their indexes.
      expect(r.relrowsecurity).toBe(tables.includes(String(r.relname)));
      expect(r.relforcerowsecurity).toBe(tables.includes(String(r.relname)));
    }
    expect(snapshot.policies.map(p => p.tablename)).toEqual(tables);
    expect(applyTenancyProofs([], [proof], "rls")).toEqual(tables.map(relname => ({
      relname, relrowsecurity: true, relforcerowsecurity: true, guarded: true,
    })));
    expect(applyTenancyProofs([], [proof], "owner")).toEqual(tables.map(relname => ({ relname, owner: "jobguard_migration" })));
  });

  it("binds recorded routine source digests and static effects to the unchanged SQL", () => {
    const combined = combineLp0(baseline, [proof]);
    const knownRoutines = new Set(combined.recorded.routines.map(r => r.identity.slice(r.identity.indexOf(":") + 1).split("(")[0]!));
    const knownTables = new Set(tables.map(t => `app.${t}`));
    for (const [name, args, returns, security] of [
      ["ais_immutable", "", "trigger", false],
      ["dark_ais", "t uuid, digest text, c uuid, op text, v jsonb", "jsonb", true],
    ] as const) {
      const source = new RegExp(`CREATE FUNCTION app\\.${name}\\(.*?\\) RETURNS ${returns}.*?AS \\$\\$(.*?)\\$\\$;`, "s").exec(migration)![1]!;
      // PostgreSQL 16 pg_get_functiondef rendering; source-derived, never catalog-derived allowances.
      const definition = `CREATE OR REPLACE FUNCTION app.${name}(${args})\n RETURNS ${returns}\n LANGUAGE plpgsql\n${security ? " SECURITY DEFINER\n" : ""} SET search_path TO 'pg_catalog'\nAS $function$${source}$function$\n`;
      const recorded = combined.recorded.routines.find(r => r.identity.startsWith(`function:app.${name}(`))!;
      expect(recorded.definitionSha256).toBe(createHash("sha256").update(definition).digest("hex"));
      expect(staticScan(source, knownRoutines, knownTables)).toEqual({ staticWrites: recorded.staticWrites, staticCalls: recorded.staticCalls });
    }
  });
});
