import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { MIGRATION_URLS } from "../src/migrate.js";

const read = (name: string) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8");
const sql = read("0820_lp13_low_value_batch.sql");
it("retains reserved 0820 after the actual LP-12 chain", () => {
  const names = MIGRATION_URLS.map(url => url.pathname.split("/").at(-1)!);
  const own = names.indexOf("0820_lp13_low_value_batch.sql");
  expect(own).toBeGreaterThan(names.indexOf("0815_lp12_narrow_owners.sql"));
  for (const name of ["0591_lp6c_money_binding.sql", "0780_lp6d_remaining_routines.sql",
    "0795_lp8a_billing_revokes.sql", "0810_lp11_bound_tenant_rls.sql", "0815_lp12_narrow_owners.sql"]) {
    expect(names.indexOf(name), name).toBeGreaterThanOrEqual(0);
    expect(names.indexOf(name), name).toBeLessThan(own);
  }
});
it("adds no competing routine, reservation store, owner grant or protected proof delta", () => {
  expect(sql.replace(/--[^\n]*/g, "").trim()).toBe("BEGIN;\nCOMMIT;");
  expect(JSON.parse(readFileSync(new URL("./migration-proofs/0820_lp13_low_value_batch.proof.json", import.meta.url), "utf8")))
    .toEqual({ migration: "0820_lp13_low_value_batch.sql", lp0: [], upgrade: [], tenancy: [] });
});
it("uses LP-8a's revoked standalone number capability and leaves checked issuance intact", () => {
  const billing = read("0795_lp8a_billing_revokes.sql");
  expect(billing).toContain("REVOKE EXECUTE ON FUNCTION app.reserve_customer_invoice_number(uuid)\n FROM jobguard_runtime, PUBLIC");
  expect(billing).toContain("REVOKE INSERT, UPDATE, DELETE ON app.customer_invoice_sequence");
  const money = read("0591_lp6c_money_binding.sql");
  for (const name of ["issue_practice_customer_invoice", "issue_lock_bound_customer_invoice"]) {
    const body = money.split(new RegExp(`CREATE OR REPLACE FUNCTION app\\.${name}\\s*\\(`), 2)[1]!.split("END $$;", 1)[0]!;
    expect(body).toContain("app.current_actor()");
    expect(body).toContain("INSERT INTO app.customer_invoice_sequence");
    expect(body).toContain("ON CONFLICT(tenant_id) DO UPDATE SET next_number");
  }
});
it("keeps the latest LP-6d progress binding before lookup and all three operational transitions", () => {
  const progress = read("0780_lp6d_remaining_routines.sql").split("CREATE OR REPLACE FUNCTION app.transition_scope_progress", 2)[1]!
    .split("\n$$;", 1)[0]!;
  expect(progress.indexOf("PERFORM app.current_actor()")).toBeLessThan(progress.indexOf("SELECT * INTO current_progress"));
  expect(progress).toContain("p_tenant IS DISTINCT FROM app.current_tenant()");
  expect(progress).toContain("IS DISTINCT FROM app.current_tenant()::text");
  for (const reason of ["start", "complete", "rework"]) expect(progress).toContain(`p_reason='${reason}'`);
  expect(progress.match(/UPDATE app\.\w+/g)).toEqual(["UPDATE app.scope_progress"]);
});
it("retains legacy unknown attribution, connection sealing and the retired adoption overload", () => {
  const origin = read("0053_shared_money_origin.sql");
  expect(origin).toContain("legacy_unrecorded");
  expect(origin).toContain("legacy_synthetic_capture");
  const audit = read("0520_lp4_database_audit.sql").split("CREATE OR REPLACE FUNCTION identity.sso_audit_append", 2)[1]!.split("END $$;", 1)[0]!;
  expect(audit.indexOf("PERFORM identity.sso_load_connection(c)")).toBeGreaterThanOrEqual(0);
  expect(audit.indexOf("PERFORM identity.sso_load_connection(c)")).toBeLessThan(audit.indexOf("PERFORM app.lp4_seal_audit"));
  expect(read("0095_job_parties.sql")).toContain("JOB_PARTIES_REQUIRED");
});
