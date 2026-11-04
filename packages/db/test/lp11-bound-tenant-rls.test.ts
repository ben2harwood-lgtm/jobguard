import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { MIGRATION_URLS } from "../src/migrate.js";

const name = "0810_lp11_bound_tenant_rls.sql";
const sql = readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8");
const proof = JSON.parse(readFileSync(new URL(`./migration-proofs/${name.replace(".sql", ".proof.json")}`, import.meta.url), "utf8"));

it("orders the cutover after the binding foundation and all current predecessors", () => {
  const names = MIGRATION_URLS.map(url => url.pathname.split("/").at(-1)!);
  for (const predecessor of [
    "0562_lp6a_request_binding.sql", "0584_lp6b_effective_session_actor.sql",
    "0591_lp6c_money_binding.sql", "0780_lp6d_remaining_routines.sql",
    "0785_lp6e_audit_attribution.sql", "0790_member_administration.sql",
    "0795_lp8a_billing_revokes.sql",
    "0800_lp8b_outbox_evidence.sql", "0805_worker_login.sql",
  ]) {
    expect(names, predecessor).toContain(predecessor);
    expect(names.indexOf(name), predecessor).toBeGreaterThan(names.indexOf(predecessor));
  }
  expect(names).not.toContain("0532_lp11_bound_tenant_rls.sql");
});

it("replaces tenant authority inside both plain and guarded catalogue expressions without removing other conditions", () => {
  const pattern = sql.match(/\$pattern\$(.*?)\$pattern\$/s)![1]!;
  const replace = (expression: string) => expression.replace(new RegExp(pattern, "g"), "(app.current_tenant())::text");
  for (const setting of ["current_setting('app.tenant_id'::text, true)", "pg_catalog.current_setting('app.tenant_id',true)", "current_setting('app.tenant_id'::text)"]) {
    const extra = " AND (current_setting('app.customer_stage_read'::text, true) = 'on'::text)";
    const expression = `tenant_id = NULLIF(${setting}, ''::text)::uuid${extra}`;
    expect(replace(expression)).toBe(`tenant_id = NULLIF((app.current_tenant())::text, ''::text)::uuid${extra}`);
    const guarded = `tenant_id = CASE WHEN pg_input_is_valid(${setting}, 'uuid') THEN NULLIF(${setting}, '')::uuid END`;
    expect(replace(guarded)).not.toContain("app.tenant_id");
    expect(replace(guarded)).toContain("pg_input_is_valid((app.current_tenant())::text");
  }
});

it("covers newly merged schemas and refuses PUBLIC or undeclared policy principals", () => {
  expect(sql).toContain("n.nspname NOT IN ('pg_catalog','information_schema')");
  expect(sql).not.toContain("n.nspname IN ('app','identity','control_plane')");
  expect(sql).toContain("LP11_PUBLIC_TENANT_POLICY");
  expect(sql).toContain("LP11_UNREVIEWED_POLICY_ROLE");
  expect(sql).toContain("LP11_UNCONVERTED_TENANT_POLICY");
  expect(sql).not.toContain("EXECUTE format('GRANT");
  expect(sql).toContain("ALTER VIEW app.ledger_balance SET (security_invoker=true)");
});

it("declares exactly the four new accessor grants without inventing policy catalogue evidence", () => {
  const roles = ["jobguard_identity", "jobguard_meter", "jobguard_meter_owner", "jobguard_shadow"];
  expect(proof.migration).toBe(name);
  expect(proof.lp0.filter((c: { section: string }) => c.section === "entries").map((c: { after: { key: string } }) => c.after.key)).toEqual(
    roles.map(role => `acl|routine|function:app.current_tenant()|${role}|EXECUTE|-`));
  const change = proof.upgrade[0];
  expect(proof.upgrade).toHaveLength(1);
  expect(change.before.proname).toBe("current_tenant");
  const inherited = JSON.parse(readFileSync(new URL("./migration-proofs/0785_lp6e_audit_attribution.proof.json", import.meta.url), "utf8"));
  expect(change.before).toEqual(inherited.upgrade.find((entry: { section: string; after: { proname?: string } }) =>
    entry.section === "routines" && entry.after.proname === "current_tenant").after);
  expect(sql).not.toMatch(/GRANT EXECUTE[^;]*TO jobguard_audit_writer/s);
  expect(change.after).toEqual({ ...change.before, proacl: change.before.proacl.slice(0, -1) + "," + roles.map(role => `${role}=X/jobguard_binding_owner`).join(",") + "}" });
  // The staged fragment is explicit about the remaining exact allowances;
  // discovery/schema validation alone must never be called catalogue proof.
  expect(proof.lp0[0].after.gaps.join(" ")).toContain("exact policy before/after allowances");
});

it("leaves the latest predecessor routines intact and names both bootstrap cycles", () => {
  expect(sql).not.toMatch(/CREATE(?: OR REPLACE)? FUNCTION|DROP FUNCTION/);
  expect(sql).not.toContain("GRANT SELECT");
  expect(sql).not.toContain("GRANT INSERT");
  expect(sql).not.toContain("GRANT UPDATE");
  expect(sql).toContain("lp10_lock_action");
  expect(sql).toContain("worker_action_context");
  const gaps = proof.lp0[0].after.gaps.join(" ");
  expect(gaps).not.toMatch(/LP-10 absent|DO NOT COMMIT/);
  expect(gaps).toContain("bootstrap");
  expect(gaps).toContain("worker");
});
