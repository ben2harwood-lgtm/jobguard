import { readFileSync, readdirSync } from "node:fs";
import { expect, it } from "vitest";

const directory = new URL("../migrations/", import.meta.url);
const migration = "0525_lp6c_money_binding.sql";
// This is a regression contract for copied bodies, not a permission scanner or source pin.
const functions = (sql: string) => [...sql.matchAll(/CREATE (?:OR REPLACE )?FUNCTION\s+app\.(\w+)\s*\((.*?)\)\s*RETURNS\b(.*?)\bAS\s+(\$\w*\$)(.*?)\4\s*;/gis)];
const key = (m: RegExpMatchArray) => m[1]! + m[2]!.replace(/\s+|\(\d+(?:,\d+)?\)/gu, "").toLowerCase();
const sql = () => readFileSync(new URL(migration, directory), "utf8");

it("guards every activation/acceptance overload, surviving invoice path and money/command helper", () => {
  const definitions = functions(sql());
  expect(definitions).toHaveLength(28);
  for (const name of ["switch_job_live", "record_simulated_settlement", "record_builder_attested_acceptance", "record_quote_disposition"])
    expect(definitions.filter(m => m[1] === name), name).toHaveLength(2);
  for (const definition of definitions) {
    if (definition[1] === "mon1_company_actor") continue;
    expect(definition[5], key(definition)).toMatch(/BEGIN\s+-- LP-6c identity only; existing permission and exact-approval checks follow\.\s+IF .*app\.current_tenant\(\)/u);
    if (/\bp_actor uuid/u.test(definition[2]!))
      expect(definition[5], key(definition)).toContain("p_actor IS DISTINCT FROM app.current_actor()");
  }
});

it("preserves latest predecessor bodies, including permission, approval clocks, resource and replay checks", () => {
  const latest = new Map<string, RegExpMatchArray>();
  for (const filename of readdirSync(directory).filter(f => f.endsWith(".sql") && f < migration).sort())
    for (const definition of functions(readFileSync(new URL(filename, directory), "utf8"))) latest.set(key(definition), definition);
  for (const definition of functions(sql())) {
    if (definition[1] === "mon1_company_actor") continue;
    const unchanged = definition[5]!
      .replace(/\n -- LP-6c identity only; existing permission and exact-approval checks follow\.\n IF [^\n]+ THEN\n  RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501';\n END IF;\n/u, "")
      .replace(/\n IF c\.actor_membership_id IS DISTINCT FROM app\.current_actor\(\) THEN RAISE EXCEPTION 'REQUEST_BINDING_REFUSED' USING ERRCODE='42501'; END IF;/gu, "");
    expect(unchanged, key(definition)).toBe(latest.get(key(definition))?.[5]);
  }
});

it("moves the meter bridge to the common credential binding and keeps its environmental and role restrictions", () => {
  const meter = functions(sql()).find(m => m[1] === "mon1_company_actor")![5]!;
  expect(meter).toContain("app.bind_request('real',digest,t)");
  expect(meter).toContain("actor:=app.current_actor()");
  expect(meter).not.toContain("identity.sso_session_memberships");
  expect(meter).toContain("environment='synthetic_demo'");
  expect(meter).toContain("m.role IN('owner','admin')");
  expect(sql()).not.toMatch(/DROP |GRANT .* TO jobguard_runtime/u);
});
