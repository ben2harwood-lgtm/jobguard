import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lp4WriterSources } from "./lp4-writer-catchup-fixture.js";

const directory = new URL("../migrations/", import.meta.url);
const functions = (sql: string) => [...sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([\w.]+)\s*\(.*?\bAS\s+(\$\w*\$).*?\2\s*;/gis)]
  .map(m => ({ name: m[1]!, sql: m[0] }));
const main = new Map<string, { file: string; sql: string }>();
for (const file of readdirSync(directory).filter(f => /^\d{4}.*\.sql$/.test(f) && f !== "0456_lp4_database_audit.sql").sort()) {
  for (const fn of functions(readFileSync(new URL(file, directory), "utf8"))) main.set(fn.name, { file, sql: fn.sql });
}
const replacements = new Map(functions(readFileSync(new URL("0456_lp4_database_audit.sql", directory), "utf8")).map(fn => [fn.name, fn.sql]));
const directWrite = /INSERT\s+INTO\s+app\.audit_event/i;
const normalize = (sql: string) => sql.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim();

// Deliberately compare the WHOLE latest routine, including every guard, branch,
// return, signature and security setting; only audit metadata/write statements
// may differ. This catches rebuilding from a stale original migration.
function expectedSealedDefinition(sql: string) {
  const insert = /INSERT INTO app.audit_event\([^;]*?\)\s*VALUES\((.*?)\);/is.exec(sql)!;
  const values = insert[1]!.split(",").map(v => v.trim());
  expect(values).toHaveLength(13);
  const fields = [["id", 0], ["version", 3], ["actorRef", 4], ["eventType", 5], ["subjectType", 6], ["subjectRef", 7], ["payload", 9]] as const;
  const seal = `PERFORM app.lp4_seal_audit(jsonb_build_array(jsonb_build_object(${fields.map(([k, i]) => `'${k}',${values[i]}`).join(",")})),'checked_operation');`;
  return sql.replace(insert[0], seal)
    .replace(/SELECT sequence,event_hash INTO \w+,\w+ FROM app.lock_audit_head\(\);/g, "")
    .replace(/\b(?:seq|ts|ph|eh):=.*?;/gs, "")
    .replace(/PERFORM app.advance_audit_head\(seq,eh\);/g, "")
    .replace(/CREATE (?:OR REPLACE )?FUNCTION/i, "CREATE OR REPLACE FUNCTION");
}

describe("LP-4 catch-up preserves latest main routine behaviour", () => {
  it.each(Object.entries(lp4WriterSources))("%s seals its existing audit event and preserves all latest-main branches", (name, file) => {
    const source = main.get(name)!;
    expect(source.file).toBe(file);
    const replacement = replacements.get(name)!;
    expect(replacement).toBeDefined();
    expect(normalize(replacement)).toBe(normalize(expectedSealedDefinition(source.sql)));
    expect(replacement).not.toMatch(directWrite);
    expect(replacement).not.toContain("app.lock_audit_head()");
  });
  it("every audit-writing routine on main is replaced; only the private sealer writes directly", () => {
    const writers = [...main].filter(([, fn]) => directWrite.test(fn.sql)).map(([name]) => name);
    expect(writers).toHaveLength(19);
    for (const name of writers) expect(replacements.has(name), name).toBe(true);
    const final = new Map([...main].map(([name, fn]) => [name, fn.sql]));
    for (const [name, sql] of replacements) final.set(name, sql);
    expect([...final].filter(([, sql]) => directWrite.test(sql)).map(([name]) => name)).toEqual(["app.lp4_seal_audit"]);
  });
});
