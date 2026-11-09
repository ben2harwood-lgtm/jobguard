import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { loadReviewedInventory, pathCompleteness, repoFileExists } from "./lp-0-catalog.js";
import { loadMigrationProofs } from "./migration-proof-loader.js";

it("records exact private-reader allowances and a migfix-7 successor routine row", async () => {
  const { inventory } = await loadReviewedInventory();
  expect(pathCompleteness(inventory, repoFileExists).filter(issue => issue.includes("bound-context-reader"))).toEqual([]);
  expect(inventory.entries.filter(entry => entry.group === "a-bound-context-reader").map(entry => entry.key).sort()).toEqual([
    "acl|routine|function:app.bound_context_reader()|jobguard_migration|EXECUTE|-",
    "owner|routine|function:app.bound_context_reader()|jobguard_binding_owner",
  ]);
  const proof = loadMigrationProofs().proofs.find(item => item.migration === "0697_bound_context_reader.sql")!;
  expect(proof.upgrade).toEqual([{ section: "routines", before: null, after: {
    nspname: "app", proname: "bound_context_reader", args: "", proowner: "jobguard_binding_owner",
    proacl: "{jobguard_binding_owner=X/jobguard_binding_owner,jobguard_migration=X/jobguard_binding_owner}",
    prosecdef: true, proconfig: ["search_path=pg_catalog, pg_temp"],
  } }]);
  expect(proof.tenancy).toEqual([]);
});

it("adds only a no-argument read-only definer using the existing bound-request validator", () => {
  const sql = readFileSync(new URL("../migrations/0697_bound_context_reader.sql", import.meta.url), "utf8");
  expect(sql.match(/CREATE FUNCTION /g)).toHaveLength(1);
  expect(sql).toContain("CREATE FUNCTION app.bound_context_reader() RETURNS jsonb");
  expect(sql).toContain("SECURITY DEFINER SET search_path=pg_catalog,pg_temp");
  expect(sql).toContain("bound := app.lp6_bound_request()");
  expect(sql).toContain("SQLERRM = 'REQUEST_BINDING_REFUSED'");
  expect(sql).toContain("RETURN NULL");
  expect(sql).not.toMatch(/CREATE OR REPLACE|CREATE TABLE|CREATE TYPE|CREATE POLICY|INSERT INTO|UPDATE |DELETE FROM|set_config|current_setting|app\.bind_request\(/i);
  expect(sql.match(/GRANT EXECUTE[^;]+/g)).toEqual(["GRANT EXECUTE ON FUNCTION app.bound_context_reader() TO jobguard_migration"]);
  expect(sql).toContain("REVOKE CREATE ON SCHEMA app FROM jobguard_binding_owner");
});
