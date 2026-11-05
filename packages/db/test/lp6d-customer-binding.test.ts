import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { loadReviewedInventory, pathCompleteness, repoFileExists } from "./lp-0-catalog.js";
import { loadMigrationProofs } from "./migration-proof-loader.js";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const sql = read("../migrations/1000_lp6d_customer_binding.sql");
const definitions = [...sql.matchAll(/CREATE (?:OR REPLACE )?FUNCTION ((?:app|identity)\.\w+)\((.*?)\)\s*RETURNS\b.*?\bAS\s+(\$\w*\$)(.*?)\3\s*;/gis)];
const body = (name: string) => definitions.find(m => m[1] === name)![4]!;

it("keeps customer authority private and disjoint from all member accessors", () => {
  expect(body("app.lp6_bound_request")).toContain("bound.credential_kind='customer'");
  const previous = read("../migrations/0562_lp6a_request_binding.sql").match(/CREATE FUNCTION app\.lp6_bound_request\([\s\S]*?\$\$(.*?)\$\$;/s)![1]!;
  expect(body("app.lp6_bound_request")).toBe(previous.replace("IF NOT FOUND OR bound.expires_at", "IF NOT FOUND OR bound.credential_kind='customer' OR bound.expires_at"));
  const bind = body("app.bind_customer_request");
  expect(bind).toContain("('customer',ref,t,c)");
  expect(bind).toContain("authority:=app.lp6_customer_authority(t,j,c,digest)");
  expect(bind).toContain("(authority->>'sessionId')||':'||j::text");
  expect(bind).not.toMatch(/DELETE|UPDATE\s+control_plane/i);
  expect(sql).not.toMatch(/SET app\.|ADD COLUMN|GRANT.*TO jobguard_identity|GRANT.*TO jobguard_runtime.*EXECUTE/i);
  expect(body("app.sv7a_require_source_owner")).toContain("IF digest LIKE 'customer:%' THEN RAISE EXCEPTION");
  for (const name of ["app.lp6_customer_authority", "app.bind_customer_request"]) {
    expect(sql).toContain(`REVOKE ALL ON FUNCTION ${name}(uuid,uuid,uuid,text) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure`);
  }
  expect(definitions.filter(m => m[1] !== "app.bind_customer_request" && m[4]!.includes("app.bind_customer_request(")).map(m => m[1]))
    .toEqual(["identity.customer_portal_message"]);
});

it("binds before input, locks or replay and never writes a customer as a member", () => {
  const writer = body("identity.customer_portal_message");
  const begin = writer.indexOf("authority:=app.bind_customer_request");
  for (const marker of ["jsonb_typeof(input)", "pg_advisory_xact_lock", "SELECT * INTO prior"]) expect(begin).toBeLessThan(writer.indexOf(marker));
  expect(writer.match(/app.bind_customer_request\(/g)).toHaveLength(3);
  expect(writer).not.toMatch(/app\.(?:begin_command|complete_command|sv7a_intake_job_source|current_actor|require_watchdog_live)\(/);
  expect(writer).not.toMatch(/INSERT INTO app\.(?:command_receipt|customer_message_source|job_source_original)\b/);
  expect(writer).toContain("'customer-session:'||(authority->>'sessionId')");
  expect(writer).toContain("sponsor_membership_id");
  expect(writer).not.toContain("actualTesterMembershipId");
  expect(writer).toContain("prior.request_hash IS DISTINCT FROM h");
  expect(writer.indexOf("RETURN prior.result")).toBeLessThan(writer.indexOf("POST_LOCK_WORK_REQUIRES_LINKED_JOB"));
  expect(sql).toContain("FORCE ROW LEVEL SECURITY");
  expect(sql).toContain("BEFORE UPDATE OR DELETE OR TRUNCATE");
});

it("preserves member read authorization and adds customer evidence to every source reader", () => {
  const prior = read("../migrations/0780_lp6d_remaining_routines.sql").match(/CREATE OR REPLACE FUNCTION app\.read_job_sources\([\s\S]*?\$\$(.*?)\$\$;/s)![1]!;
  const addition = " SELECT records||coalesce(jsonb_agg(r.result->'record' ORDER BY r.source_received_at,r.id),'[]') INTO records\n FROM app.customer_portal_message_record r WHERE r.tenant_id=t AND r.job_id=j;\n";
  expect(body("app.read_job_sources").replace(addition, "")).toBe(prior);
  for (const file of ["../src/job-source-observation-reader.ts", "../src/shadow-detection-repository.ts"]) expect(read(file)).toContain("app.customer_portal_message_record");
  expect(body("app.evidence_pack_v3_ordinary")).toContain("originalBytesBase64");
  expect(body("app.evidence_pack_v3_ordinary")).toContain("app.customer_portal_message_record");
});

it("loads migration 1000 with strict proof identities and complete review paths", async () => {
  expect(loadMigrationProofs().proofs.filter(p => p.migration === "1000_lp6d_customer_binding.sql")).toHaveLength(1);
  const { inventory } = await loadReviewedInventory();
  expect(pathCompleteness(inventory, repoFileExists)).toEqual([]);
});
