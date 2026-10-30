import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { jobMutationRegistry } from "@jobguard/core";
import { lp5bReadTables, lp5bRegistryRows, lp5ReadTables, lp5RegistryRows, lp5aReadTables, lp5aRegistryRows, lp5bRoutines } from "./lp5-command-catalog.js";
const sql = readFileSync(new URL("../migrations/0496_lp5b_writers.sql", import.meta.url), "utf8");

describe("LP-5b draft catalogue additions", () => {
  it("unions every installed rule and SELECT policy with the original LP-5a expectations", () => {
    const seeds = sql.split("INSERT INTO app.command_type_registry VALUES")[1]!.split(";")[0]!;
    const rows = [...seeds.matchAll(/\(([^()]+)\)/g)].map(match => Object.fromEntries(match[1]!.split(",").map((value, i) =>
      [Object.keys(lp5bRegistryRows[0]!)[i]!, value.trim() === "NULL" ? null : value.trim().slice(1, -1)])));
    expect(rows).toEqual(lp5bRegistryRows);
    expect(lp5RegistryRows).toEqual([...lp5aRegistryRows, ...rows]);
    for (const row of rows) expect(jobMutationRegistry[`command:${row.command_type}`]).toBeDefined();
    const tables = sql.match(/FOREACH n IN ARRAY ARRAY\[([\s\S]*?)\] LOOP/)![1]!;
    expect([...tables.matchAll(/'([^']+)'/g)].map(match => match[1])).toEqual(lp5bReadTables);
    expect(lp5ReadTables).toEqual([...lp5aReadTables, ...lp5bReadTables]);
    expect(new Set(lp5ReadTables).size).toBe(lp5ReadTables.length);
  });
  it("keeps exact routine inventory and checked writer grants, with no business lock at begin", () => {
    expect([...sql.matchAll(/CREATE OR REPLACE FUNCTION app\.([a-z0-9_]+)/g)].map(match => match[1]).sort())
      .toEqual(["begin_command","lp5_command_result","complete_command","lp5_bind_effect","xa_submit","xa_price","xa_approve","xa_withdraw","xa_mark_duplicate","xa_revoke_link","xa_client_decide","ent3b_start_visit","ent3b_complete_visit"].sort());
    expect([...sql.matchAll(/CREATE FUNCTION app\.([a-z0-9_]+)/g)].map(match=>match[1]).sort())
      .toEqual(lp5bRoutines.map(r=>r.signature.split("(")[0]!.replace("app.","")).sort());
    const begin = sql.split("CREATE OR REPLACE FUNCTION app.begin_command")[1]!.split("END $$;")[0]!;
    expect(begin.replace(/--[^\n]*/g, " ")).not.toMatch(/FOR\s+(UPDATE|SHARE)|pg_advisory|p_(digest|hash)/i);
    expect(begin).toContain("found_count<>1");
    expect(begin).toContain("(p_significant_input->>'legacyJson')::jsonb IS DISTINCT FROM p_significant_input->'input'");
    expect(sql).not.toMatch(/GRANT\s+(INSERT|UPDATE|DELETE)\b/);
    expect([...sql.matchAll(/GRANT EXECUTE ON FUNCTION ([^;]+);/g)].map(m=>m[1])).toEqual([
      "app.record_repository_command(uuid) TO jobguard_runtime,jobguard_migration",
      "app.lp5b_contractor_permission(text,uuid,uuid,jsonb) TO jobguard_command_writer",
    ]);
  });
  it("keeps proof's checked resolution before completion audit and caller audit", () => {
    const complete = sql.split("CREATE OR REPLACE FUNCTION app.complete_command")[1]!;
    expect(complete.indexOf("INSERT INTO app.decision_resolution")).toBeGreaterThan(0);
    expect(complete.indexOf("INSERT INTO app.decision_resolution")).toBeLessThan(complete.indexOf("app.lp4_seal_audit"));
    const proof = readFileSync(new URL("../src/proof-repository.ts", import.meta.url), "utf8");
    expect(proof.indexOf("const completed=await completeRepositoryCommand")).toBeLessThan(proof.indexOf('eventType:"proof.completed"'));
    expect(proof).not.toContain("INSERT INTO app.decision_resolution");
  });
});
