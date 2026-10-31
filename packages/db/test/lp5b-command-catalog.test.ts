import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { jobMutationRegistry } from "@jobguard/core";
import { lp5bReadTables, lp5bRegistryRows, lp5ReadTables, lp5RegistryRows, lp5aReadTables, lp5aRegistryRows, lp5bRoutines } from "./lp5-command-catalog.js";
const sql = readFileSync(new URL("../migrations/0536_lp5b_writers.sql", import.meta.url), "utf8");

describe("LP-5b draft catalogue additions", () => {
  it("unions every installed rule and SELECT policy with the original LP-5a expectations", () => {
    const seeds = sql.split("INSERT INTO app.command_type_registry VALUES")[1]!.split(";")[0]!;
    const rows = [...seeds.matchAll(/\(([^()]+)\)/g)].map(match => Object.fromEntries(match[1]!.split(",").map((value, i) =>
      [Object.keys(lp5bRegistryRows[0]!)[i]!, value.trim() === "NULL" ? null : value.trim().slice(1, -1)])));
    expect(rows).toEqual(lp5bRegistryRows);
    expect(lp5RegistryRows).toEqual([...lp5aRegistryRows, ...rows]);
    for (const row of rows) expect(jobMutationRegistry[`command:${row.command_type}`]).toBeDefined();
    const tables = sql.match(/FOREACH n IN ARRAY ARRAY\[([\s\S]*?)\] LOOP/)![1]!;
    expect([...tables.matchAll(/'([^']+)'/g)].map(match => match[1])).toEqual(lp5bReadTables);
    expect(lp5ReadTables).toEqual([...lp5aReadTables, ...lp5bReadTables]);
    expect(new Set(lp5ReadTables).size).toBe(lp5ReadTables.length);
  });
  it("keeps exact routine inventory and checked writer grants, with no business lock at begin", () => {
    expect([...sql.matchAll(/CREATE OR REPLACE FUNCTION app\.([a-z0-9_]+)/g)].map(match => match[1]).sort())
      .toEqual(["begin_command","lp5_command_result","complete_command","lp5_bind_effect","xa_submit","xa_price","xa_approve","xa_withdraw","xa_mark_duplicate","xa_revoke_link","xa_client_decide","ent3b_start_visit","ent3b_complete_visit","issue_lock_bound_customer_invoice","sv7a_intake_job_source"].sort());
    expect([...sql.matchAll(/CREATE FUNCTION app\.([a-z0-9_]+)/g)].map(match=>match[1]).sort())
      .toEqual(lp5bRoutines.map(r=>r.signature.split("(")[0]!.replace("app.","")).sort());
    const begin = sql.split("CREATE OR REPLACE FUNCTION app.begin_command")[1]!.split("END $$;")[0]!;
    expect(begin.replace(/--[^\n]*/g, " ")).not.toMatch(/FOR\s+(UPDATE|SHARE)|pg_advisory|p_(digest|hash)/i);
    expect(begin).toContain("found_count<>1");
    const claimAt=begin.indexOf("INSERT INTO app.command_receipt");
    expect(begin.indexOf("app.lp5b_contractor_permission")).toBeGreaterThan(claimAt);
    expect(begin).toContain("'extra-origin:'||(p_resource->>'subjectRef')||':'||p_command_id::text");
    expect(begin).toMatch(/END IF;\s*END IF;\s*INSERT INTO app\.command_lifecycle_claim/);
    expect(begin).toContain("(p_significant_input->>'legacyJson')::jsonb IS DISTINCT FROM (p_significant_input->'input')");
    expect(sql).not.toMatch(/GRANT\s+(INSERT|UPDATE|DELETE)\b/);
    expect([...sql.matchAll(/GRANT EXECUTE ON FUNCTION ([^;]+);/g)].map(m=>m[1])).toEqual([
      "app.record_repository_command(uuid) TO jobguard_runtime,jobguard_migration",
      "app.lp5b_contractor_permission(text,uuid,uuid,jsonb) TO jobguard_command_writer",
    ]);
  });
  it("keeps the cancellation effect trigger private to its lifecycle owner", () => {
    expect(lp5bRoutines.find(r => r.signature === "app.lp5b_bind_follow_up_cancel()")).toEqual({
      signature: "app.lp5b_bind_follow_up_cancel()", owner: "jobguard_command_writer", securityDefiner: true, execute: [],
    });
    const binding = sql.split("CREATE FUNCTION app.lp5b_bind_follow_up_cancel()")[1]!.split("END $$;")[0]!;
    expect(binding).toMatch(/RETURNS trigger[\s\S]*SECURITY DEFINER/);
    expect(binding).toContain("SET search_path=pg_catalog,pg_temp");
    expect(sql).toContain("ALTER FUNCTION app.lp5b_bind_follow_up_cancel() OWNER TO jobguard_command_writer;");
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION app\.lp5b_bind_follow_up_cancel\(\) FROM PUBLIC,jobguard_runtime,jobguard_identity,jobguard_infrastructure;/);
    expect(sql).toMatch(/CREATE TRIGGER lp5b_follow_up_cancel_effect AFTER INSERT ON app\.recovery_follow_up_event[\s\S]*?WHEN\s*\(NEW\.kind\s*=\s*'cancelled'\)[\s\S]*?EXECUTE FUNCTION app\.lp5b_bind_follow_up_cancel\(\);/);
  });
  it("permits restricted ownership transfers only inside the migration transaction", () => {
    const grant = sql.indexOf("GRANT CREATE ON SCHEMA app TO jobguard_command_writer;");
    const transfer = sql.indexOf("ALTER TABLE app.repository_operational_record OWNER TO jobguard_command_writer;");
    const revoke = sql.indexOf("REVOKE CREATE ON SCHEMA app FROM jobguard_command_writer;");
    expect(grant).toBeGreaterThan(sql.indexOf("BEGIN;"));
    expect(grant).toBeLessThan(transfer);
    expect(revoke).toBeGreaterThan(sql.lastIndexOf("OWNER TO jobguard_command_writer;"));
    expect(revoke).toBeLessThan(sql.lastIndexOf("COMMIT;"));
    expect(sql).not.toMatch(/CREATE\s+ROLE/i);
    const records = sql.split("CREATE FUNCTION app.record_repository_command")[1]!.split("END $$;")[0]!;
    expect(records).not.toMatch(/current_database|LP4_SYNTHETIC_DATABASE_REQUIRED/);
    expect(records).toContain("synthetic_demo.seed");
  });
  it("preserves the complete LP-5a receipt-to-audit tail, including the final seal call", () => {
    const parent = readFileSync(new URL("../migrations/0535_lp5a_commands.sql", import.meta.url), "utf8");
    const tail = (source: string) => {
      const start = source.indexOf(" UPDATE app.command_receipt SET status='succeeded',result=value,completed_at=clock_timestamp()");
      expect(start).toBeGreaterThan(-1);
      return source.slice(start, source.indexOf("END $$;", start) + "END $$;".length);
    };
    expect(tail(sql)).toBe(tail(parent));
  });
  it("keeps proof's checked resolution before the final completion seal, with caller audit first", () => {
    const complete = sql.split("CREATE OR REPLACE FUNCTION app.complete_command")[1]!;
    expect(complete.indexOf("INSERT INTO app.decision_resolution")).toBeGreaterThan(0);
    expect(complete.indexOf("INSERT INTO app.decision_resolution")).toBeLessThan(complete.indexOf("app.lp4_seal_audit"));
    const proof = readFileSync(new URL("../src/proof-repository.ts", import.meta.url), "utf8");
    expect(proof.indexOf("const completed=await completeRepositoryCommand")).toBeGreaterThan(proof.indexOf('eventType:"proof.completed"'));
    expect(proof).not.toContain("INSERT INTO app.decision_resolution");
  });
});
