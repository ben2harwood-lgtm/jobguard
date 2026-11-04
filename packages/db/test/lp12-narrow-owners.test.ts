import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { loadReviewedInventory, pathCompleteness, repoFileExists } from "./lp-0-catalog.js";
import { MIGRATION_URLS } from "../src/migrate.js";
import { lp12ColumnGrants, lp12Moved, lp12Owners, lp12TableGrants } from "./lp12-narrow-owners.js";
const sql = readFileSync(new URL("../migrations/0815_lp12_narrow_owners.sql", import.meta.url), "utf8");

it("discovers the bounded migration and preserves routine bodies and existing migration history", () => {
  expect(MIGRATION_URLS.some(url => url.pathname.endsWith("/0815_lp12_narrow_owners.sql"))).toBe(true);
  expect(sql).not.toMatch(/CREATE (?:OR REPLACE )?FUNCTION|CREATE TABLE|CREATE ROLE|GRANT .* TO jobguard_runtime/i);
  expect([...sql.matchAll(/ALTER FUNCTION (\S+) OWNER TO (\w+);/g)].map(m => [m[1], m[2]])).toEqual(lp12Moved);
  expect(sql).toContain("ALTER TABLE app.command_lifecycle_claim OWNER TO jobguard_migration;");
  for (const owner of lp12Owners) expect(sql).toContain(`'${owner}'`);
  for (const owner of ["jobguard_binding_lookup_owner", "jobguard_money_owner"]) {
    expect(sql).toContain(`GRANT CREATE ON SCHEMA app TO ${owner};`);
    expect(sql).toContain(`REVOKE CREATE ON SCHEMA app FROM ${owner};`);
  }
});

it("records exactly the new table/column permissions without new runtime powers", async () => {
  const { inventory } = await loadReviewedInventory();
  const entries = inventory.entries.filter(e => e.group === "a-lp12-narrow-owners");
  expect(entries.length).toBeGreaterThan(20);
  for (const e of entries) expect(e.key).not.toContain("|jobguard_runtime|");
  for (const name of Object.keys(lp12TableGrants) as (keyof typeof lp12TableGrants)[]) {
    expect(entries.filter(e => e.key.startsWith("acl|rel|table|") && e.key.includes(`|${name}|`)).map(e => {
      const parts = e.key.split("|"); return `${parts[3]}:${parts[5]}`;
    }).sort()).toEqual([...lp12TableGrants[name]].sort());
    expect(entries.filter(e => e.key.startsWith("acl|col|") && e.key.includes(`|${name}|`)).map(e => {
      const parts = e.key.split("|"); return `${parts[2]}:${parts[4]}`;
    }).sort()).toEqual([...lp12ColumnGrants[name]].sort());
  }
  expect(pathCompleteness(inventory, repoFileExists).filter(p => p.includes("lp12"))).toEqual([]);
});


it("keeps the LP-6c accessor calls usable without changing any installed definition", () => {
  expect(sql).toContain("GRANT EXECUTE ON FUNCTION app.current_actor(),app.current_tenant() TO jobguard_money_owner;");
  expect(sql).not.toMatch(/ALTER FUNCTION .* (?:SET|RESET) |SET app\./i);
  const proof = JSON.parse(readFileSync(new URL("./migration-proofs/0815_lp12_narrow_owners.proof.json", import.meta.url), "utf8"));
  expect(proof.migration).toBe("0815_lp12_narrow_owners.sql");
  for (const change of proof.upgrade.filter((c: { section: string }) => c.section === "routines")) {
    expect(change.after.args).toBe(change.before.args);
    expect(change.after.args).not.toContain("DEFAULT");
    expect(change.after.proconfig).toEqual(change.before.proconfig);
    expect(change.after.prosecdef).toBe(change.before.prosecdef);
  }
});
