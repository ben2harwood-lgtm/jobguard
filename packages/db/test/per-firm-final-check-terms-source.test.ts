import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { loadMigrationProofs } from "./migration-proof-loader.js";

const read = (name: string) => readFileSync(new URL(`../migrations/${name}.sql`, import.meta.url), "utf8");
const migration = "0736_per_firm_final_check_terms";
const sql = read(migration);
const tenantTerms = "NOT EXISTS(SELECT 1 FROM app.final_check_terms_acceptance WHERE tenant_id=t AND terms_version='synthetic_final_check_terms.v1')";
const firmTerms = "NOT app.final_check_job_terms(t,j,'synthetic_final_check_terms.v1')";

it("preserves 0732's exact builder definition with only the per-firm terms change", () => {
  const latest = read("0732_final_check_typed_recovery").split("CREATE OR REPLACE FUNCTION app.final_check_builder(")[1]!.split("END $$;")[0]!;
  const installed = sql.split("CREATE OR REPLACE FUNCTION app.final_check_builder(")[1]!.split("END $$;")[0]!;
  expect(latest.split(tenantTerms)).toHaveLength(2);
  expect(installed).toBe(latest.replace(tenantTerms, firmTerms));
});

it("chains builder proof metadata from 0732 to the new delegated per-firm definition", () => {
  const { proofs } = loadMigrationProofs();
  const builder = (name: string) => proofs.find(p => p.migration === `${name}.sql`)!.lp0.find(c =>
    c.section === "routines" && c.after?.identity === "function:app.final_check_builder(uuid,uuid,text,boolean)");
  const prior = builder("0732_final_check_typed_recovery");
  const current = builder(migration);
  expect(current?.before).toEqual(prior?.after);
  expect(current?.after).toEqual({ ...prior?.after, staticCalls: ["app.final_check_job_terms", "app.final_check_read_authority"] });
});

it("retains the exact installed-definition lock guard and uses 0736 for both latest-body pins", () => {
  for (const file of ["plan-entitlement-lifecycle-upgrade.integration.test.ts", "migfix-7-upgrade.integration.test.ts"]) {
    const pins = readFileSync(new URL(file, import.meta.url), "utf8");
    expect(pins).not.toMatch(/^(?:<<<<<<<|=======|>>>>>>>)/mu);
    expect(pins).not.toMatch(/1401_per_firm_final_check_terms/u);
    expect(pins).toContain(`${migration}.sql`);
    expect(pins.match(/\["(?:app\.)?final_check_builder[^\n]+/gu)).toHaveLength(1);
  }
  const upgrade = readFileSync(new URL("plan-entitlement-lifecycle-upgrade.integration.test.ts", import.meta.url), "utf8");
  expect(upgrade).toContain("expect(current?.definition).toBe(expectedDefinition)");
  expect(upgrade).toContain('expect(afterOwner.slice(scopeEnd).startsWith("\\n" + guard)).toBe(true)');
});
