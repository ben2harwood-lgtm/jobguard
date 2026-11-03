import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const migration = (stem: string) => readFileSync(new URL(`../migrations/${stem}.sql`, import.meta.url), "utf8");
const resultRoutine = (sql: string) => sql.match(/CREATE OR REPLACE FUNCTION app\.lp5_command_result\([\s\S]*?END \$\$;/u)![0];

it("preserves every main completion adapter, including late source import and locked invoice checks", () => {
  const latest = resultRoutine(migration("0541_late_source_import"));
  const caughtUp = resultRoutine(migration("0582_managed_recovery_election"));
  // Compare the complete predecessor body after removing only MON-9's case arm.
  // This detects a stale routine copy that would silently undo another piece.
  expect(caughtUp.replace(/ WHEN 'managed_recovery' THEN[\s\S]*?(?= WHEN 'source_intake' THEN)/u, "")).toBe(latest);
});
