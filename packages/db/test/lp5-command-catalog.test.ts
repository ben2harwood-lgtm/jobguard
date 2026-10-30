import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { jobMutationRegistry } from "@jobguard/core";
import { lp5ReadTables, lp5RegistryRows, lp5Signatures } from "./lp5-command-catalog.js";
const sql = readFileSync(new URL("../migrations/0475_lp5a_commands.sql", import.meta.url), "utf8");
describe("LP-5a exact catalogue expectations", () => {
  it.each([
    ["0456_lp4_database_audit.sql", "jobguard_audit_writer"],
    ["0475_lp5a_commands.sql", "jobguard_command_writer"],
  ])("%s requires administrative role provisioning without CREATEROLE", (file, role) => {
    const migration = readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8");
    expect(migration).not.toMatch(/CREATE ROLE/i);
    expect(migration).toContain(`IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='${role}')`);
    expect(migration).toContain(`RAISE EXCEPTION '${role} is missing; run administrative ensureRoles before migrations'`);
    expect(migration).toContain(`GRANT CREATE ON SCHEMA app TO ${role}`);
    expect(migration).toContain(`REVOKE CREATE ON SCHEMA app FROM ${role}`);
  });
  it("rejects common reserved SQL identifiers in PL/pgSQL variable declarations", () => {
    // Source guard only; the PostgreSQL suites remain the compilation proof.
    const reserved = new Set(['authorization', 'user', 'order', 'check', 'table', 'grant', 'default', 'constraint',
      'select', 'from', 'where', 'group', 'limit', 'offset', 'returning', 'case', 'when', 'then', 'else', 'end']);
    const declarations = [...sql.matchAll(/\bDECLARE\s+([\s\S]*?)\bBEGIN\b/gi)];
    expect(declarations).toHaveLength(9);
    for (const declaration of declarations) {
      for (const variable of declaration[1]!.split(';').map(part => part.trim().match(/^([a-z_][a-z_0-9]*)\s+/i)?.[1]).filter(Boolean)) {
        expect(reserved.has(variable!.toLowerCase()), variable).toBe(false);
      }
    }
  });
  it("enumerates every installed registry rule and shares the watchdog keys", () => {
    const seeds = sql.split("INSERT INTO app.command_type_registry VALUES")[1]!.split(";")[0]!;
    const installed = [...seeds.matchAll(/\(([^()]+)\)/g)].map(match => Object.fromEntries(match[1]!.split(",").map((v, i) =>
      [Object.keys(lp5RegistryRows[0]!)[i]!, v.trim() === "NULL" ? null : v.trim().slice(1, -1)])));
    expect(installed).toEqual(lp5RegistryRows);
    for (const rule of lp5RegistryRows) expect(jobMutationRegistry[`command:${rule.command_type}`]).toBeDefined();
  });
  it("enumerates all SELECT grants and all new routines", () => {
    const tables = sql.match(/FOREACH n IN ARRAY ARRAY\[([\s\S]*?)\] LOOP/)![1]!;
    expect([...tables.matchAll(/'([^']+)'/g)].map(m => m[1])).toEqual(lp5ReadTables);
    const definitions = [...sql.matchAll(/CREATE FUNCTION app\.([a-z0-9_]+)/g)].map(m => m[1]).sort();
    expect(definitions).toEqual(lp5Signatures.map(s => s.split("(")[0]!.replace("app.", "")).sort());
  });
  it("uses no caller digest or business lock in begin and leaves the existing lock tests unchanged", () => {
    const begin = sql.split("CREATE FUNCTION app.begin_command")[1]!.split("END $$;")[0]!;
    expect(begin.replace(/--[^\n]*/g, " ")).not.toMatch(/FOR\s+(UPDATE|SHARE)|pg_advisory|p_(digest|hash)/i);
    expect(begin).toContain("found_count<>1");
    expect(begin).toContain("app.final_lock_canonical");
    expect(sql).toContain("DEFERRABLE INITIALLY DEFERRED");
  });
  it("copies the latest activation, review and adoption routines with only a private effect handoff", () => {
    for (const [file, name] of [["0109_job_activation_terms.sql", "switch_job_live_v3"], ["0356_unchecked_job_doors.sql", "start_quote_from_review"], ["0356_unchecked_job_doors.sql", "adopt_in_flight_job"]]) {
      const original = readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8");
      const pattern = new RegExp(`CREATE (?:OR REPLACE )?FUNCTION app\\.${name}\\([\\s\\S]*?END \\$\\$;`);
      const before = original.match(pattern)![0].replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION");
      const after = sql.match(pattern)![0].replace(/PERFORM app\.lp5_bind_effect[^;]+; /g, "");
      expect(after).toBe(before);
    }
  });

});
