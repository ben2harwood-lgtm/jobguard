import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { MIGRATION_URLS } from "../src/migrate.js";

const read = (name: string) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), "utf8");
const sql = read("0769_lp13_low_value_batch.sql");
it("registers the reserved marker immediately after LP-12", () => {
  const names = MIGRATION_URLS.map(url => url.pathname.split("/").at(-1)!);
  const predecessor = names.indexOf("0768_lp12_narrow_owners.sql");
  expect(predecessor).toBeGreaterThanOrEqual(0);
  expect(names[predecessor + 1]).toBe("0769_lp13_low_value_batch.sql");
});
it("adds no competing routine, reservation store, owner grant or protected proof delta", () => {
  expect(sql.replace(/--[^\n]*/g, "").trim()).toBe("BEGIN;\nCOMMIT;");
  expect(JSON.parse(readFileSync(new URL("./migration-proofs/0769_lp13_low_value_batch.proof.json", import.meta.url), "utf8")))
    .toEqual({ migration: "0769_lp13_low_value_batch.sql", lp0: [], upgrade: [], tenancy: [] });
});
it("preserves checked invoice allocation in the current invoice bodies", () => {
  const money = read("0764_practice_firm_name_invoice.sql");
  for (const name of ["issue_practice_customer_invoice", "issue_lock_bound_customer_invoice"]) {
    const body = money.split(new RegExp(`CREATE OR REPLACE FUNCTION app\\.${name}\\s*\\(`), 2)[1]!.split("END $$;", 1)[0]!;
    expect(body).toContain("app.current_actor()");
    expect(body).toContain("app.current_tenant()");
    expect(body).toContain("INSERT INTO app.customer_invoice_sequence");
    expect(body).toContain("ON CONFLICT(tenant_id) DO UPDATE SET next_number");
  }
});
it("retains legacy unknown attribution, connection sealing and the retired adoption overload", () => {
  const boundRls = read("0765_lp11_bound_tenant_rls.sql");
  const origin = boundRls.split("CREATE OR REPLACE FUNCTION app.record_legacy_builder_origin()", 2)[1]!.split("END $$;", 1)[0]!;
  expect(origin).toContain("legacy_unrecorded");
  expect(origin).toContain("legacy_synthetic_capture");
  const scope = boundRls.split("CREATE FUNCTION identity.lp11_open_sso_scope", 2)[1]!.split("END $$;", 1)[0]!;
  const audit = boundRls.split("CREATE OR REPLACE FUNCTION identity.sso_audit_append", 2)[1]!.split("END $$;", 1)[0]!;
  expect(scope).toContain("connection:=identity.sso_load_connection(c)");
  const openScope = audit.indexOf("PERFORM identity.lp11_open_sso_scope(c,'audit')");
  expect(openScope).toBeGreaterThanOrEqual(0);
  expect(openScope).toBeLessThan(audit.indexOf("PERFORM app.lp4_seal_audit"));
  expect(read("0095_job_parties.sql")).toContain("JOB_PARTIES_REQUIRED");
});
