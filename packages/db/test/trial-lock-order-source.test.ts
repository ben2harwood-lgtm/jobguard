import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("lock-order-418 migration preservation", () => {
 it("rebuilds the latest trial activation with only job-first locking changes", async () => {
  const old = await readFile(new URL("../migrations/0373_free_first_job_eligibility.sql", import.meta.url), "utf8");
  const next = await readFile(new URL("../migrations/0400_trial_activation_lock_order.sql", import.meta.url), "utf8");
  const body = (sql: string) => sql.slice(sql.indexOf("DECLARE actor uuid; b app.trial_business_verification;"), sql.indexOf("END $$;", sql.indexOf("DECLARE actor uuid; b app.trial_business_verification;")));
  const owner = " actor:=app.mon3_owner(t,digest);";
  const job = " PERFORM 1 FROM app.job WHERE tenant_id=t AND id=(v->>'jobId')::uuid FOR UPDATE;";
  expect(body(next).indexOf(job)).toBeLessThan(body(next).indexOf(owner));
  expect(body(next).match(/FOR UPDATE/g)).toHaveLength(1);
  const restored = body(next)
   .replace(" -- Authenticate without taking the company lock; every entry point locks job first.\n actor:=app.mon1_company_actor(t,digest);", `${owner}\n PERFORM pg_advisory_xact_lock(hashtextextended(t::text,184));\n${owner}`)
   .replace(`${job}\n${owner}\n SELECT * INTO b`, " SELECT * INTO b")
   .replace(" PERFORM app.mon3_owner(t,digest);\n eligibility:=", `${job}\n PERFORM app.mon3_owner(t,digest);\n eligibility:=`);
  expect(restored).toBe(body(old));
  expect(next.startsWith("BEGIN;")).toBe(true); expect(next.endsWith("COMMIT;\n")).toBe(true);
  expect(next).toContain("CREATE OR REPLACE FUNCTION app.mon3_activate");
  const activation = next.slice(next.indexOf("CREATE OR REPLACE FUNCTION app.mon3_activate"), next.indexOf("END $$;")+7);
  expect(activation).not.toMatch(/\b(?:GRANT|REVOKE|ALTER FUNCTION)\b/);
 });
 it("gives runtime only an authenticated definer lock rather than job UPDATE", async () => {
  const sql = await readFile(new URL("../migrations/0400_trial_activation_lock_order.sql", import.meta.url), "utf8");
  const helper = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION app.mon3_lock_activation"));
  expect(helper).toContain("SECURITY DEFINER SET search_path=pg_catalog");
  expect(helper.indexOf("PERFORM app.mon1_company_actor")).toBeLessThan(helper.indexOf("FOR UPDATE"));
  expect(helper.indexOf("FOR UPDATE")).toBeLessThan(helper.indexOf("RETURN app.mon3_owner"));
  expect(helper).toContain("WHERE tenant_id=t AND id=j FOR UPDATE");
  expect(helper).toContain("OWNER TO jobguard_migration");
  expect(helper).toContain("REVOKE ALL ON FUNCTION app.mon3_lock_activation(uuid,text,uuid) FROM PUBLIC;");
  expect(helper).toContain("GRANT EXECUTE ON FUNCTION app.mon3_lock_activation(uuid,text,uuid) TO jobguard_runtime;");
  expect(sql).not.toMatch(/GRANT\s+UPDATE/i);
 });
});
