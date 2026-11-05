import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { loadMigrationProofs } from "./migration-proof-loader.js";
const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
const sql = read("../migrations/1210_legacy_recovery_money_integrity.sql");
const previous = read("../migrations/0356_unchecked_job_doors.sql");
const routine = (source: string, name: string) => source.match(new RegExp(`CREATE OR REPLACE FUNCTION app\\.${name}\\([\\s\\S]*?END\\$\\$;`, "u"))![0];
it("retains every latest approval restriction apart from adding eligible <= gross", () => {
  expect(routine(sql, "approve_synthetic_landing").replace(" OR eligible>gross", ""))
    .toBe(routine(previous, "approve_synthetic_landing"));
  expect(sql).toContain("ADD CONSTRAINT landing_allocation_eligible_within_gross CHECK(eligible_net_pence<=gross_pence)");
});
it("changes only cumulative reversals and settled credit in the latest reversal body", () => {
  const repaired = routine(sql, "reverse_synthetic_landing");
  const sum = "SELECT COALESCE(sum(a.eligible_net_pence),0)-COALESCE((SELECT sum(r.eligible_net_pence) FROM app.landing_reversal r WHERE r.tenant_id=t AND r.job_id=x.job_id),0) INTO landed FROM app.landing_allocation a WHERE a.tenant_id=t AND a.job_id=x.job_id;";
  const credit = "credit:=least(CASE WHEN EXISTS(SELECT 1 FROM app.simulated_settlement_event s JOIN app.synthetic_obligation o ON(o.tenant_id,o.id)=(s.tenant_id,s.obligation_id)WHERE s.tenant_id=t AND o.job_id=x.job_id)THEN 7900 ELSE 0 END,fee);";
  expect(repaired).toContain(sum); expect(repaired).toContain(credit);
  expect(repaired.replace(sum, "SELECT COALESCE(sum(eligible_net_pence),0)INTO landed FROM app.landing_allocation WHERE tenant_id=t AND job_id=x.job_id;landed:=landed-p_amount;")
    .replace(credit, "credit:=least(7900,fee);")).toBe(routine(previous, "reverse_synthetic_landing"));
});
it("has a discoverable body-only proof and adds no columns, grants, routines or session settings", () => {
  const proof = loadMigrationProofs().proofs.find(p => p.migration === "1210_legacy_recovery_money_integrity.sql")!;
  expect(proof.lp0).toHaveLength(2); expect(proof.upgrade).toHaveLength(2); expect(proof.tenancy).toEqual([]);
  for (const change of [...proof.lp0, ...proof.upgrade]) expect(change.after).toEqual(change.before);
  expect(sql).not.toMatch(/\b(?:GRANT|REVOKE|ADD COLUMN|CREATE TABLE|SET app\.)\b/u);
  expect(sql.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(2);
});
