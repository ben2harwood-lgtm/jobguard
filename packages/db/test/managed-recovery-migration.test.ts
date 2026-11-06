import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const migration = (stem: string) => readFileSync(new URL(`../migrations/${stem}.sql`, import.meta.url), "utf8");
const resultRoutine = (sql: string) => sql.match(/CREATE OR REPLACE FUNCTION app\.lp5_command_result\([\s\S]*?END \$\$;/u)![0];

it("preserves every main completion adapter, including late source import and locked invoice checks", () => {
  const latest = resultRoutine(migration("0541_late_source_import"));
  const election = migration("0566_managed_recovery_election");
  // Main extends the installed routine rather than storing a stale full copy.
  // Apply that exact insertion to the predecessor and compare everything else.
  expect(election).toContain("original:=pg_get_functiondef('app.lp5_command_result(uuid,jsonb)'::regprocedure);");
  expect(election).not.toContain("CREATE OR REPLACE FUNCTION app.lp5_command_result(");
  const extension = election.match(/changed:=replace\(original,'CASE adapter'\|\|chr\(10\),\$branch\$([\s\S]*?)\$branch\$\);/u);
  expect(extension).not.toBeNull();
  expect(election).toContain("IF changed=original THEN RAISE EXCEPTION 'MON9_RESULT_ADAPTER_NOT_FOUND'; END IF;\n EXECUTE changed;");
  const caughtUp = latest.replace("CASE adapter\n", extension![1]!);
  expect(caughtUp).toContain(" WHEN 'managed_recovery' THEN");
  expect(caughtUp.replace(/ WHEN 'managed_recovery' THEN[\s\S]*?(?= WHEN 'source_intake' THEN)/u, "")).toBe(latest);
});
