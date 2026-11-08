import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lp4WriterSources } from "./lp4-writer-catchup-fixture.js";

const directory = new URL("../migrations/", import.meta.url);
const functions = (sql: string) => [...sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+([\w.]+)\s*\(.*?\bAS\s+(\$\w*\$).*?\2\s*;/gis)]
  .map(m => ({ name: m[1]!, sql: m[0] }));
const sealingMigration = "0520_lp4_database_audit.sql";
const replacements = new Map(functions(readFileSync(new URL(sealingMigration, directory), "utf8")).map(fn => [fn.name, fn.sql]));
const main = new Map<string, { file: string; sql: string }>();
const final = new Map<string, string>();
const recreatedWriters: { name: string; file: string; sql: string }[] = [];
for (const file of readdirSync(directory).filter(f => /^\d{4}.*\.sql$/.test(f)).sort()) {
  for (const fn of functions(readFileSync(new URL(file, directory), "utf8"))) {
    final.set(fn.name, fn.sql);
    if (file !== sealingMigration && !(file === "0660_baseline_ancestry_audit_trust.sql" && fn.name === "app.decision_check_command") && !(file === "0957_final_check_post_invoice_rerun.sql" && fn.name === "app.guard_final_check_manifest")) main.set(fn.name, { file, sql: fn.sql });
    if (file > sealingMigration && replacements.has(fn.name)) recreatedWriters.push({ ...fn, file });
  }
}
const directWrite = /INSERT\s+INTO\s+app\.audit_event/i;
const sealedCall = /\b(?:PERFORM|SELECT)\s+app\.lp4_seal_audit\s*\(/i;
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
  // Only these two payload adaptations are authorized by LP-4 repair try 2.
  sql = sql.replace("jsonb_build_object('manifestId',NEW.id,'lockId',NEW.lock_id,'exclusions',excluded)",
    "jsonb_build_object('manifestId',NEW.id,'lockId',NEW.lock_id),'hashes',jsonb_build_object('exclusions',app.final_lock_hash(excluded))")
    .replace("jsonb_build_object('references',refs,'hashes','{}'::jsonb)",
      "jsonb_build_object('references',jsonb_strip_nulls(refs),'hashes','{}'::jsonb)");
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
  it("LATER-SAFETY-87 pins the complete successor decision writer", () => {
    const successor = functions(readFileSync(new URL("0660_baseline_ancestry_audit_trust.sql", directory), "utf8"))
      .filter(fn => fn.name === "app.decision_check_command");
    expect(successor).toHaveLength(1);
    expect(final.get("app.decision_check_command")).toBe(successor[0]!.sql);
    expect(successor[0]!.sql).toContain("iv.job_id=next_job.id AND iv.source_job_id=source.id");
    expect(successor[0]!.sql).toContain("rv.command_type='job.adopt_in_flight' AND rv.status='succeeded'");
    expect(successor[0]!.sql).toContain("rv.semantic_key='import:'||next_job.id::text AND rv.result->>'jobId'=next_job.id::text AND rv.result->>'sourceJobId'=source.id::text");
  });
  it("LATER-SAFETY-142 pins the complete append-only manifest guard successor", () => {
    const successor=functions(readFileSync(new URL("0957_final_check_post_invoice_rerun.sql",directory),"utf8"))
      .filter(fn=>fn.name==="app.guard_final_check_manifest");
    expect(successor).toHaveLength(1);
    expect(final.get("app.guard_final_check_manifest")).toBe(successor[0]!.sql);
    expect(successor[0]!.sql).toContain("removed:=app.require_final_check_rerun(NEW.tenant_id,NEW.job_id,predecessor.id)");
    expect(successor[0]!.sql).toContain("NEW.withdrawn_predecessor_source_ids:=removed");
    expect(successor[0]!.sql).toMatch(sealedCall);
    expect(successor[0]!.sql).not.toMatch(directWrite);
  });
  it("LP-0 retains the sealed definition and call inventory for every rerouted writer", () => {
    const catalogue = JSON.parse(readFileSync(new URL("../../../docs/contracts/lp-0-effective-privileges-v1.json", import.meta.url), "utf8"));
    const identities = catalogue.recorded.routines.map((row: { identity: string }) => row.identity);
    expect(new Set(identities).size).toBe(identities.length);
    for (const name of Object.keys(lp4WriterSources)) {
      const rows = catalogue.recorded.routines.filter((row: { identity: string }) => row.identity.startsWith(`function:${name}(`));
      expect(rows, name).toHaveLength(1);
      expect(rows[0].definitionSha256, name).toMatch(/^[a-f0-9]{64}$/);
      expect(rows[0].staticCalls, name).toContain("app.lp4_seal_audit");
      expect(rows[0].staticCalls, name).not.toContain("app.lock_audit_head");
      expect(rows[0].staticWrites, name).not.toContain("app.audit_event");
    }
  });
  it("every re-created LP-4 audit writer keeps its sealer call", () => {
    expect(recreatedWriters.length).toBeGreaterThan(0);
    for (const { name, file, sql } of recreatedWriters) {
      const body = sql.slice(sql.search(/\bAS\s+\$\w*\$/i)).replace(/--[^\n]*/g, "");
      expect(body, `${file}: ${name}`).toMatch(sealedCall);
      expect(body, `${file}: ${name}`).not.toMatch(directWrite);
      expect(body, `${file}: ${name}`).not.toContain("app.lock_audit_head()");
    }
  });
  it("every audit-writing routine on main is replaced; only the private sealer writes directly", () => {
    // Later migrations may re-create an already sealed LP-4 writer. Count it
    // by its sealer call, without treating unrelated newer callers as originals.
    const writers = [...main].filter(([name, fn]) => directWrite.test(fn.sql) ||
      (replacements.has(name) && sealedCall.test(fn.sql))).map(([name]) => name);
    expect(writers).toHaveLength(21);
    for (const name of writers) expect(replacements.has(name), name).toBe(true);
    expect([...final].filter(([, sql]) => directWrite.test(sql)).map(([name]) => name)).toEqual(["app.lp4_seal_audit"]);
  });
});
