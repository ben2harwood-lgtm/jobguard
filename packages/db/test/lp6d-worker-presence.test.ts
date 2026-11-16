import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import classification from "./lp6d-runtime-classification.json" with { type: "json" };
import proof from "./migration-proofs/0754_lp6d_worker_binding_presence.proof.json" with { type: "json" };
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const migration = "0754_lp6d_worker_binding_presence.sql";
const sql = read(`../migrations/${migration}`);
const definitions = (source: string) => [...source.matchAll(/CREATE (?:OR REPLACE )?FUNCTION (app\.\w+)\((.*?)\)\s*RETURNS\b.*?\bAS\s+\$\$([\s\S]*?)\$\$\s*;/gis)];
const workers = ["app.lp6d_escalate_overdue_worker", "app.lp6d_recovery_message_sink_worker"];
const predicate = "IF app.lp6d_request_bound() OR app.lp6e_request_binding_present() THEN";

it("changes only the refusal predicate in both exact 0749 worker definitions and ACLs", () => {
  const old = read("../migrations/0749_lp6d_remaining_routines.sql");
  expect(definitions(sql).map(m => m[1])).toEqual(["app.lp6e_request_binding_present", ...workers]);
  expect(sql.match(/^BEGIN;/gm)).toHaveLength(1);
  expect(sql.match(/^COMMIT;/gm)).toHaveLength(1);
  for (const name of workers) {
    const block = (s: string) => s.slice(s.indexOf(`FUNCTION ${name}(`), s.indexOf("TO jobguard_runtime;", s.indexOf(`FUNCTION ${name}(`)) + "TO jobguard_runtime;".length);
    expect(block(sql).replace(predicate, "IF app.lp6d_request_bound() THEN")).toBe(block(old));
    expect(definitions(sql).find(m => m[1] === name)![3]!.trim().split("\n")[name.endsWith("sink_worker") ? 2 : 1]!.trim()).toContain(predicate);
  }
});

it("pins the boolean-only binding-owner probe, exact bind_request environment/xid and no expiry filter", () => {
  const helper = definitions(sql)[0]!;
  expect(helper[2]).toBe("");
  const environment = "extract(epoch FROM pg_postmaster_start_time())::text||':'||(SELECT d.oid::text FROM pg_catalog.pg_database d WHERE d.datname=current_database())";
  expect(read("../migrations/0562_lp6a_request_binding.sql")).toContain(`environment_key text:=${environment}; request_xid xid8:=pg_current_xact_id();`);
  expect(helper[3]!.trim()).toBe(`SELECT EXISTS(SELECT 1 FROM control_plane.request_binding b\n  WHERE b.environment_id=${environment}\n   AND b.transaction_id=pg_current_xact_id())`);
  expect(sql).toContain("RETURNS boolean\n LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$");
  expect(sql).toContain("ALTER FUNCTION app.lp6e_request_binding_present() OWNER TO jobguard_binding_owner;");
  expect(sql).toContain("REVOKE ALL ON FUNCTION app.lp6e_request_binding_present() FROM PUBLIC,jobguard_runtime;");
  expect(sql).toContain("GRANT EXECUTE ON FUNCTION app.lp6e_request_binding_present() TO jobguard_migration;");
  expect(classification["app.lp6e_request_binding_present()"]).toMatch(/^Private to jobguard_migration/u);
  expect(proof.lp0.find(r => r.section === "routines" && "identity" in r.after && r.after.identity === "function:app.lp6e_request_binding_present()")?.after)
    .toMatchObject({ owner: "jobguard_binding_owner", runtimeExecute: false, publicExecute: false, otherExecute: ["jobguard_migration"] });
  expect(sql).not.toMatch(/GRANT EXECUTE ON FUNCTION app\.lp6e_request_binding_present\(\) TO (?!jobguard_migration;)/u);
});

it("inventories every latest worker refusal and pins the complete latest helper caller list", () => {
  const latest = new Map<string, string>();
  for (const file of readdirSync(new URL("../migrations/", import.meta.url)).filter(f => f.endsWith(".sql")).sort())
    for (const m of definitions(read(`../migrations/${file}`))) latest.set(`${m[1]}(${m[2]})`, m[3]!);
  const refusals = [...latest].filter(([name, body]) => name.includes("_worker(") && body.includes("IF app.lp6d_request_bound()"));
  expect(refusals.map(([name]) => name.split("(")[0]).sort()).toEqual([...workers].sort());
  for (const [, body] of refusals) expect(body).toContain(predicate);
  expect([...latest].filter(([, body]) => body.includes("app.lp6e_request_binding_present()")).map(([name]) => name.split("(")[0]).sort()).toEqual([...workers].sort());
});

it("pins complete PostgreSQL definition hashes and registers every recreated routine in both upgrade suites", () => {
  for (const m of definitions(sql)) {
    const name = m[1]!, args = name.endsWith("sink_worker") ? "p_outbox uuid, p_reference text" : "";
    const returns = name.endsWith("sink_worker") ? "void" : name.endsWith("overdue_worker") ? "TABLE(request_id uuid, job_id uuid, variation_id uuid, step_index integer, eligible_roles text[])" : "boolean";
    const definition = `CREATE OR REPLACE FUNCTION ${name}(${args})\n RETURNS ${returns}\n LANGUAGE ${name.endsWith("present") ? "sql" : "plpgsql"}\n SECURITY DEFINER\n SET search_path TO 'pg_catalog'\nAS $function$${m[3]}$function$\n`;
    const row = proof.lp0.find(r => r.section === "routines" && "identity" in r.after && r.after.identity === `function:${name}(${name.endsWith("sink_worker") ? "uuid,text" : ""})`);
    expect(row?.after).toHaveProperty("definitionSha256", createHash("sha256").update(definition).digest("hex"));
    expect(proof.upgrade.some(r => r.after.proname === name.slice(4))).toBe(true);
  }
  for (const file of ["migfix-7-upgrade.integration.test.ts", "plan-entitlement-lifecycle-upgrade.integration.test.ts"])
    expect(read(`./${file}`)).toContain(`../migrations/${migration}`);
});
