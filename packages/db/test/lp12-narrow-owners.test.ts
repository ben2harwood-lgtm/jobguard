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


it("requires the real predecessor chain and bound policy before narrowing custody", () => {
  const names = MIGRATION_URLS.map(url => url.pathname.split("/").at(-1)!);
  const own = names.indexOf("0815_lp12_narrow_owners.sql");
  for (const predecessor of ["0584_lp6b_effective_session_actor.sql", "0591_lp6c_money_binding.sql",
    "0780_lp6d_remaining_routines.sql", "0785_lp6e_audit_attribution.sql", "0790_member_administration.sql",
    "0795_lp8a_billing_revokes.sql", "0800_lp8b_outbox_evidence.sql", "0805_worker_login.sql", "0810_lp11_bound_tenant_rls.sql"]) {
    expect(names.indexOf(predecessor), predecessor).toBeGreaterThanOrEqual(0);
    expect(names.indexOf(predecessor), predecessor).toBeLessThan(own);
  }
  expect(sql).toContain("OR read_rule NOT LIKE '%current_tenant()%' OR write_rule NOT LIKE '%current_tenant()%'");
  expect(sql).toContain("OR read_rule LIKE '%app.tenant_id%' OR write_rule LIKE '%app.tenant_id%'");
});

it("chains accessor ACLs from LP-6e/LP-11 and permits LP-6d's effective-practice helper", () => {
  const proof = (name: string) => JSON.parse(readFileSync(new URL(`./migration-proofs/${name}.proof.json`, import.meta.url), "utf8"));
  const own = proof("0815_lp12_narrow_owners");
  for (const [name, predecessor] of [["current_actor", "0785_lp6e_audit_attribution"], ["current_tenant", "0810_lp11_bound_tenant_rls"]]) {
    const before = proof(predecessor).upgrade.find((c: { section: string; after: { proname?: string } }) => c.section === "routines" && c.after?.proname === name).after;
    const change = own.upgrade.find((c: { section: string; after: { proname?: string } }) => c.section === "routines" && c.after?.proname === name);
    expect(change.before).toEqual(before);
    expect(change.after.proacl).toBe(before.proacl.slice(0, -1) + ",jobguard_money_owner=X/jobguard_binding_owner}");
  }
  const latest = readFileSync(new URL("../migrations/0780_lp6d_remaining_routines.sql", import.meta.url), "utf8");
  expect(latest).toContain("FROM app.lp6d_contractor_session_identity(p_credential::uuid) effective");
  expect(sql).toContain("app.lp6d_contractor_session_identity(uuid) TO jobguard_binding_lookup_owner;");
  expect(own.upgrade.find((c: { after?: { proname?: string } }) => c.after?.proname === "lp6d_contractor_session_identity").after.proacl)
    .toBe("{jobguard_migration=X/jobguard_migration,jobguard_binding_lookup_owner=X/jobguard_migration}");
});


it("grants only the effect-binding columns needed after command claim custody moves", async () => {
  expect(sql).toContain("GRANT UPDATE(effect_ref,outcome,authorization_id) ON app.command_lifecycle_claim TO jobguard_command_writer;");
  const { inventory } = await loadReviewedInventory();
  expect(inventory.entries.filter(e => e.group === "a-lp12-narrow-owners" &&
    e.key.startsWith("acl|col|app.command_lifecycle_claim.")).map(e => e.key).sort()).toEqual([
    "acl|col|app.command_lifecycle_claim.authorization_id|jobguard_command_writer|UPDATE|-",
    "acl|col|app.command_lifecycle_claim.effect_ref|jobguard_command_writer|UPDATE|-",
    "acl|col|app.command_lifecycle_claim.outcome|jobguard_command_writer|UPDATE|-",
  ]);
  expect(sql).not.toMatch(/GRANT UPDATE ON app\.command_lifecycle_claim|GRANT UPDATE\([^)]*\) ON app\.command_lifecycle_claim TO jobguard_runtime/i);
});
