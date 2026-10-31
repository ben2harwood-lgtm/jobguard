import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { MIGRATION_URLS } from "../src/migrate.js";

const sql=readFileSync(new URL("../migrations/0534_lp13_low_value_batch.sql",import.meta.url),"utf8");
it("discovers the forward migration without changing the closed migration list",()=>{
  expect(MIGRATION_URLS.some(url=>url.pathname.endsWith("/0534_lp13_low_value_batch.sql"))).toBe(true);
});
it("keeps reservations on the private checked claim with no runtime table grants",()=>{
  expect(sql).toContain("ALTER TABLE app.command_lifecycle_claim ADD COLUMN reserved_invoice_number bigint");
  expect(sql).not.toMatch(/CREATE TABLE|GRANT (?:SELECT|INSERT|UPDATE|DELETE|ALL)[^;]*TO jobguard_runtime/);
  expect(sql).not.toMatch(/GRANT [^;]*TO PUBLIC|GRANT jobguard_/);
  expect(sql).toContain("ALTER FUNCTION app.reserve_customer_invoice_number(uuid) OWNER TO jobguard_command_writer");
  expect(sql).toContain("REVOKE CREATE ON SCHEMA app FROM jobguard_command_writer");
});
it("preserves the existing progress transition rules and changes only its tenant guard",()=>{
  const old=readFileSync(new URL("../migrations/0003_job_spine.sql",import.meta.url),"utf8")
    .split("CREATE FUNCTION app.transition_scope_progress",2)[1]!.split("\nDO $$",1)[0]!;
  const current=sql.split("CREATE OR REPLACE FUNCTION app.transition_scope_progress",2)[1]!.split("\n-- 0053",1)[0]!;
  expect(current.replace(/ IF p_tenant IS DISTINCT FROM app.current_tenant\(\) THEN\n  RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';\n END IF;\n/,"").trim()).toBe(old.trim());
});
it("preserves the already-closed legacy, SSO and adoption bodies instead of copying obsolete definitions",()=>{
  expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION (?:app\.(?:record_legacy_builder_origin|adopt_in_flight_job)|identity\.sso_audit_append)/);
  const audit=readFileSync(new URL("../migrations/0456_lp4_database_audit.sql",import.meta.url),"utf8")
    .split("CREATE OR REPLACE FUNCTION identity.sso_audit_append",2)[1]!.split("END $$;",1)[0]!;
  expect(audit.indexOf("PERFORM identity.sso_load_connection(c)")).toBeLessThan(audit.indexOf("PERFORM app.lp4_seal_audit"));
});
