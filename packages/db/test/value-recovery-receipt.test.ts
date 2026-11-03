import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { loadMigrationProofs, proofSchema } from "./migration-proof-loader.js";
const read=(path:string)=>readFileSync(new URL(path,import.meta.url),"utf8");
const sql=read("../migrations/0543_value_recovery_receipt.sql");
it("delegates existing refusals before looking at recovery sources and never introduces a write path",()=>{
 expect(sql.indexOf("base:=app.read_value_job(j,digest)")).toBeLessThan(sql.indexOf("FROM app.success_fee_derivation"));
 expect(sql.indexOf("IF base IS NULL THEN RETURN NULL")).toBeLessThan(sql.indexOf("FROM app.success_fee_derivation"));
 expect(sql).toContain("base->>'tenantId' IS DISTINCT FROM t::text");
 expect(sql).toContain("live:=app.platform_fee_statement_sources");
 expect(sql).toContain("(live->>'feePence')::bigint IS DISTINCT FROM d.fee_pence");
 expect(sql).not.toMatch(/\b(?:INSERT INTO|UPDATE app\.|DELETE FROM|CREATE TABLE|ef_round_half_even)\b/u);
 expect(sql).not.toMatch(/\b(?:IF|ELSIF|WHILE)\s+CASE\b/u);
 expect(sql).toMatch(/^BEGIN;[\s\S]*COMMIT;\n$/u);
});
it("loads explicit routine, upgrade and tenancy proof without changing legacy allowances",()=>{
 const proof=proofSchema.parse(JSON.parse(read("./migration-proofs/0543_value_recovery_receipt.proof.json")));
 expect(proof.tenancy).toEqual([]);expect(proof.upgrade).toHaveLength(1);
 expect(proof.lp0.find(c=>c.section==="routines")?.after).toMatchObject({identity:"function:app.read_value_job_v2(uuid,text)",securityDefiner:true,staticWrites:[],publicExecute:false});
 expect(loadMigrationProofs().proofs).toContainEqual(proof);
});
