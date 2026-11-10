import assert from "node:assert/strict";
import type { PoolClient } from "pg";
import { compareInventory, deriveFacts, loadReviewedInventory, readCatalogue } from "./lp-0-catalog.js";

/** Assurance-only, never imported by business runtime. Reads the supplied database;
 * no migration, credential escalation, approval or real-deployment mode. */
export async function checkPreflightDatabase(client: PoolClient, tenantA: string, tenantB: string) {
  assert.match(tenantA, /^[a-f0-9-]{36}$/u);
  assert.match(tenantB, /^[a-f0-9-]{36}$/u);
  assert.notEqual(tenantA, tenantB);
  const role = (await client.query(`SELECT current_user AS name, r.rolsuper, r.rolbypassrls,
    r.rolcreaterole, r.rolcreatedb, r.rolreplication,
    EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname !~ '^(pg_|information_schema$)' AND pg_has_role(current_user,c.relowner,'USAGE')) AS owns_relation,
    EXISTS(SELECT 1 FROM pg_namespace n WHERE n.nspname !~ '^(pg_|information_schema$)'
      AND pg_has_role(current_user,n.nspowner,'USAGE')) AS owns_schema,
    EXISTS(SELECT 1 FROM pg_database d WHERE d.datname=current_database()
      AND pg_has_role(current_user,d.datdba,'USAGE')) AS owns_database
    FROM pg_roles r WHERE r.rolname=current_user`)).rows[0];
  assert.equal(role?.name, "jobguard_runtime", "PREFLIGHT_RUNTIME_ROLE_REQUIRED");
  for (const key of ["rolsuper", "rolbypassrls", "rolcreaterole", "rolcreatedb", "rolreplication", "owns_relation", "owns_schema", "owns_database"])
    assert.equal(role[key], false, "PREFLIGHT_PRIVILEGED_ROLE_REFUSED");

  // Reuse the committed LP-0 inventory and its migration-proof additions, never
  // derive expected privileges from the database under examination.
  const { inventory } = await loadReviewedInventory();
  const catalogue = await readCatalogue(client);
  assert.equal(compareInventory(inventory, deriveFacts(catalogue)).ok, true, "PREFLIGHT_CATALOG_FAILED");
  const accounts = catalogue.relations.find(row => row.schema === "app" && row.name === "account");
  assert.ok(accounts?.rlsEnabled && accounts.rlsForced, "PREFLIGHT_ACCOUNT_RLS_REQUIRED");

  // The M0-4 missing-context, tenant filter and pooled-state assertions, against
  // the supplied database. Two populated fictional tenants prevent vacuous passes.
  await client.query("BEGIN READ ONLY");
  try {
    await client.query("SELECT set_config('app.tenant_id', '', true)");
    assert.equal((await client.query("SELECT id FROM app.account")).rows.length, 0, "PREFLIGHT_MISSING_CONTEXT_LEAK");
    for (const [own, other] of [[tenantA, tenantB], [tenantB, tenantA]]) {
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [own]);
      const rows = (await client.query("SELECT id,tenant_id FROM app.account")).rows;
      assert.ok(rows.length > 0, "PREFLIGHT_FIXTURE_ACCOUNT_REQUIRED");
      assert.ok(rows.every(row => row.tenant_id === own), "PREFLIGHT_TENANT_LEAK");
      assert.equal((await client.query("SELECT id FROM app.account WHERE tenant_id=$1", [other])).rows.length, 0, "PREFLIGHT_CROSS_TENANT_LEAK");
    }
  } finally { await client.query("ROLLBACK"); }
  assert.equal((await client.query("SELECT id FROM app.account")).rows.length, 0, "PREFLIGHT_POOLED_CONTEXT_LEAK");
}
