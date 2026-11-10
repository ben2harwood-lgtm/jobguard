import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { MIGRATION_URLS } from "../src/migrate.js";

const read = (name: string) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8");
const sql = read("0980_lp13_low_value_batch.sql");
it("registers the reserved marker after this build-ahead base", () => {
  const names = MIGRATION_URLS.map(url => url.pathname.split("/").at(-1)!);
  expect(names.indexOf("0980_lp13_low_value_batch.sql"))
    .toBeGreaterThan(names.indexOf("0723_lp6c_money_binding.sql"));
});
it("adds no competing routine, reservation store, owner grant or protected proof delta", () => {
  expect(sql.replace(/--[^\n]*/g, "").trim()).toBe("BEGIN;\nCOMMIT;");
  expect(JSON.parse(readFileSync(new URL("./migration-proofs/0980_lp13_low_value_batch.proof.json", import.meta.url), "utf8")))
    .toEqual({ migration: "0980_lp13_low_value_batch.sql", lp0: [], upgrade: [], tenancy: [] });
});
it("preserves checked invoice allocation in the current LP-6c body", () => {
  const money = read("0723_lp6c_money_binding.sql");
  for (const name of ["issue_practice_customer_invoice", "issue_lock_bound_customer_invoice"]) {
    const body = money.split(new RegExp(`CREATE OR REPLACE FUNCTION app\\.${name}\\s*\\(`), 2)[1]!.split("END $$;", 1)[0]!;
    expect(body).toContain("app.current_actor()");
    expect(body).toContain("INSERT INTO app.customer_invoice_sequence");
    expect(body).toContain("ON CONFLICT(tenant_id) DO UPDATE SET next_number");
  }
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
