import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { loadMigrationProofs, proofSchema } from "./migration-proof-loader.js";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const sql = read("../migrations/0538_success_fee_cap_nets_reversals.sql");
const writer = (source: string) => source.match(/CREATE OR REPLACE FUNCTION app\.write_success_fee_v3\([\s\S]*?END \$\$;/u)![0];

it("preserves the latest 0515 writer byte for byte apart from the two capacity sums", () => {
 let restored = writer(sql);
 for (const column of ["eligible_net_pence", "gross_pence"]) {
  const net = `coalesce(sum(greatest(0,ca.${column}-(SELECT coalesce(sum(r.${column}),0)
    FROM app.recovery_case_allocation_reversal r
    WHERE r.tenant_id=ca.tenant_id AND r.job_id=ca.job_id AND r.allocation_id=ca.id))),0)`;
  expect(restored.split(net)).toHaveLength(2);
  restored = restored.replace(net, `coalesce(sum(ca.${column}),0)`);
 }
 expect(restored).toBe(writer(read("../migrations/0515_fee_compensation_gate_and_demo_settle.sql")));
 expect(sql).toMatch(/^BEGIN;[\s\S]*COMMIT;\n$/u);
 expect(sql).not.toMatch(/\b(?:GRANT|REVOKE|ALTER|CREATE TABLE)\b/u);
});

it("retains oversized reversal, authorization, exact arithmetic, invalid-proof and replay guards", () => {
 expect(sql).toContain("IF reversed_net>landing.eligible_net_pence OR reversed_gross>landing.gross_pence");
 expect(sql).toContain("auth.revoked_at IS NULL AND dr.resolution='approved' AND auth.amount_pence=r.gross_pence");
 expect(sql).toContain("fee:=app.ef_round_half_even(pair[1],pair[2]*10); delta:=fee-posted;");
 expect(sql).toContain("IF invalid_reduction AND delta>0 THEN RAISE EXCEPTION 'SUCCESS_FEE_SOURCE_CHANGED'");
 expect(sql).toContain("RETURN prior.result||jsonb_build_object('replayed',true)");
 expect(sql.indexOf("RETURN prior.result")).toBeLessThan(sql.indexOf("SELECT coalesce(max(revision),0)"));
 expect(sql).not.toMatch(/\b(?:IF|ELSIF|WHILE)\s+CASE\b/u);
});

it("declares explicit unchanged privilege metadata for the replaced routine", () => {
 const proof = proofSchema.parse(JSON.parse(read("./migration-proofs/0538_success_fee_cap_nets_reversals.proof.json")));
 expect(proof.migration).toBe("0538_success_fee_cap_nets_reversals.sql");
 expect(proof.tenancy).toEqual([]);
 for (const section of [proof.lp0, proof.upgrade]) {
  expect(section).toHaveLength(1);
  expect(section[0]!.section).toBe("routines");
  expect(section[0]!.before).toEqual(section[0]!.after);
 }
});

it("chains the replacement to the previous reviewed routine and loads all real proofs", () => {
 const previous = proofSchema.parse(JSON.parse(read("./migration-proofs/0511_success_fee_recovery_compensation.proof.json")));
 const proof = proofSchema.parse(JSON.parse(read("./migration-proofs/0538_success_fee_cap_nets_reversals.proof.json")));
 expect(proof.lp0[0]!.before).toEqual(previous.lp0.find(change => change.section === "routines")!.after);
 expect(loadMigrationProofs().proofs).toContainEqual(proof);
});
