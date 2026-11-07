import { readFileSync, readdirSync } from "node:fs";
import { expect, it } from "vitest";

const directory = new URL("../migrations/", import.meta.url);
const migration = "1217_lp6c_money_binding.sql";
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

it("guards command claim actors before effect updates and completion/replay use", () => {
  for (const name of ["lp5_bind_effect", "complete_command"]) {
    const body = functions(sql()).find(m => m[1] === name)![5]!;
    const check = body.indexOf("c.actor_membership_id IS DISTINCT FROM app.current_actor()");
    expect(check).toBeGreaterThan(body.indexOf("SELECT * INTO c FROM app.command_lifecycle_claim"));
    expect(check).toBeLessThan(body.indexOf("SELECT * INTO r FROM app.command_receipt"));
  }
  const begin = functions(sql()).find(m => m[1] === "begin_command")![5]!;
  expect(begin.indexOf("(p_resource->>'actorMembershipId')::uuid IS DISTINCT FROM app.current_actor()"))
    .toBeLessThan(begin.indexOf("SELECT * INTO reg"));
});

it("declares exactly the five owner-only binding grants and exact identity-form proof arguments", () => {
  const proof = JSON.parse(readFileSync(new URL("./migration-proofs/1217_lp6c_money_binding.proof.json", import.meta.url), "utf8"));
  expect(proof.migration).toBe(migration);
  const grants = proof.lp0.filter((c: { section: string }) => c.section === "entries")
    .map((c: { after: { key: string } }) => c.after.key);
  expect(grants.sort()).toEqual([
    "acl|routine|function:app.bind_request(text,text,uuid)|jobguard_migration|EXECUTE|-",
    ...["current_actor", "current_tenant"].flatMap(name => ["jobguard_command_writer", "jobguard_migration"]
      .map(role => `acl|routine|function:app.${name}()|${role}|EXECUTE|-`)),
  ].sort());
  expect(proof.upgrade).toHaveLength(3);
  for (const change of proof.upgrade) {
    expect(change.section).toBe("routines");
    expect(change.after.args).toBe(change.before.args);
    expect(change.after.args).not.toMatch(/DEFAULT/u);
    const { proacl: _beforeAcl, ...before } = change.before;
    const { proacl: _afterAcl, ...after } = change.after;
    expect(after).toEqual(before);
  }
});

it("pins pg_temp last on every legacy and authorized acceptance, activation and settlement overload", () => {
  const names = ["record_builder_attested_acceptance", "record_quote_disposition", "switch_job_live", "record_simulated_settlement"];
  const definitions = functions(sql()).filter(m => names.includes(m[1]!));
  expect(definitions).toHaveLength(8);
  for (const definition of definitions)
    expect(definition[3], key(definition)).toMatch(/SET search_path=pg_catalog,app,pg_temp\s*$/u);
});
