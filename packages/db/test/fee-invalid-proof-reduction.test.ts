import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { loadMigrationProofs, proofSchema } from "./migration-proof-loader.js";
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const sql = read("../migrations/0548_fee_invalid_proof_reduction.sql");
const routine = (source: string, name: string) => source.match(new RegExp(`CREATE (?:OR REPLACE )?FUNCTION app\\.${name}\\([\\s\\S]*?END \\$\\$;`, "u"))![0].replace("CREATE FUNCTION", "CREATE OR REPLACE FUNCTION");
const prior = read("../migrations/0515_fee_compensation_gate_and_demo_settle.sql");
it("preserves the demo settle happy path and replay ordering apart from source revalidation", () => {
 const settle = routine(sql, "simulation_fee_demo_settle");
 const guard = settle.slice(settle.indexOf(" -- Revalidate collection proof"), settle.indexOf(" INSERT INTO app.platform_fee_attempt_event"));
 expect(guard).toContain("IF attempt.kind='collection'");
 expect(guard).toContain("s.tenant_id=t AND s.job_id=p_job AND s.id=attempt.statement_id");
 expect(guard).toContain("s.source_hash=app.final_lock_hash(app.platform_fee_statement_sources(t,p_job,actor.member_id))");
 expect(guard).toContain("RAISE EXCEPTION 'SUCCESS_FEE_SOURCE_CHANGED'");
 expect(settle.replace(guard, "")).toBe(routine(prior, "simulation_fee_demo_settle"));
 expect(settle.indexOf("RETURN prior.result")).toBeLessThan(settle.indexOf(guard));
 expect(settle.indexOf("app.lock_success_fee_sources()")).toBeLessThan(settle.indexOf(guard));
});
it("makes invalid proof worth zero, binds its loss in both source hashes, preserves net reversal capacity", () => {
 for (const name of ["write_success_fee_v3", "success_fee_withheld_source"]) {
  const body = routine(sql, name);
  expect(body).toContain("THEN remaining:=0; END IF;");
  expect(body).toContain("THEN jsonb_build_object('invalidated',true) ELSE '{}'::jsonb END)");
  expect(body).toContain("IF reversed_net>landing.eligible_net_pence OR reversed_gross>landing.gross_pence");
  expect(body).not.toContain("only a fully reversed landing");
 }
 const writer = routine(sql, "write_success_fee_v3");
 expect(writer).toContain("IF invalid_reduction AND delta>=0 THEN RAISE EXCEPTION 'SUCCESS_FEE_SOURCE_CHANGED'");
 expect(writer).toContain("fee:=app.ef_round_half_even(pair[1],pair[2]*10); delta:=fee-posted;");
 for (const column of ["eligible_net_pence", "gross_pence"]) expect(writer).toContain(`sum(greatest(0,ca.${column}-(SELECT coalesce(sum(r.${column}),0)`);
 expect(sql).not.toMatch(/\b(?:GRANT|REVOKE|ALTER|CREATE TABLE)\b/u);
 expect(sql).not.toMatch(/\b(?:IF|ELSIF|WHILE)\s+CASE\b/u);
});
it("preserves the latest writer except invalid-proof principal, hash and strictly negative gate", () => {
 let restored = routine(sql, "write_success_fee_v3");
 restored = restored.replace("OR proof.id IS NULL\n", "OR proof.id IS NULL OR (EXISTS(SELECT 1 FROM app.evidence_invalidation i WHERE i.tenant_id=t AND i.evidence_id=proof.id)\n    -- 0515: invalid proof may only leave a fully reversed landing, which adds nothing to the fee.\n    AND (SELECT coalesce(sum(r.eligible_net_pence),0) FROM app.recovery_case_allocation_reversal r WHERE r.tenant_id=t AND r.job_id=p_job AND r.allocation_id=landing.id)<landing.eligible_net_pence)\n");
 restored = restored.replace(/\n  -- Invalidated proof supports no principal[^\n]*\n  IF EXISTS\([^\n]*\n  THEN remaining:=0; END IF;/u, "");
 restored = restored.replace(/\|\|\(CASE WHEN EXISTS\(\n     SELECT 1 FROM app.evidence_invalidation[^\n]*\n     THEN jsonb_build_object\('invalidated',true\) ELSE '\{\}'::jsonb END\)/u, "");
 restored = restored.replace("-- 0586: invalid proof permits only a strictly negative compensation delta.", "-- 0515: while invalid proof is in play this command can only reduce or leave what was posted.").replace("IF invalid_reduction AND delta>=0", "IF invalid_reduction AND delta>0");
 expect(restored).toBe(routine(read("../migrations/0547_success_fee_cap_nets_reversals.sql"), "write_success_fee_v3"));
});
it("loads an explicit proof for all three replacements, retaining private ACLs", () => {
 const proof = proofSchema.parse(JSON.parse(read("./migration-proofs/0548_fee_invalid_proof_reduction.proof.json")));
 expect(proof.tenancy).toEqual([]);
 expect(proof.lp0).toHaveLength(3);
 expect(proof.upgrade).toHaveLength(3);
 for (const c of proof.upgrade) expect(c.before).toEqual(c.after);
 const previous = proofSchema.parse(JSON.parse(read("./migration-proofs/0547_success_fee_cap_nets_reversals.proof.json")));
 expect(proof.lp0[0]!.before).toEqual(previous.lp0[0]!.after);
 expect(loadMigrationProofs().proofs).toContainEqual(proof);
});
