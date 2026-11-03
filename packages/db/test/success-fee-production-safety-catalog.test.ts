// Source/proof consistency only; PostgreSQL safety remains an integration gate.
import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
import {loadReviewedInventory,staticScan} from "./lp-0-catalog.js";
import {loadMigrationProofs} from "./migration-proof-loader.js";
const name="0622_success_fee_production_safety.sql";
const sql=readFileSync(new URL(`../migrations/${name}`,import.meta.url),"utf8");
const body=(name:string)=>sql.match(new RegExp(`CREATE (?:OR REPLACE )?FUNCTION app\\.${name}\\([\\s\\S]*?AS \\$\\$([\\s\\S]*?)END \\$\\$;`))![1]!;
it("records every new production-safety routine and trigger in the explicit proof",async()=>{
 const {inventory}=await loadReviewedInventory();
 const proof=loadMigrationProofs().proofs.find(p=>p.migration===name)!;
 const additions=proof.lp0.filter(c=>c.section==="routines").map(c=>c.after!);
 expect(additions.map(r=>r.identity).sort()).toEqual([
  "function:app.success_fee_inputs(uuid,uuid,uuid)","function:app.success_fee_derivation_integrity()",
  "function:app.success_fee_posting_integrity()","function:app.success_fee_production_command(uuid,text,jsonb)",
 ].sort());
 const known=new Set(inventory.recorded.routines.map(r=>r.identity.slice(9).split("(")[0]!));
 const tables=new Set(inventory.recorded.routines.flatMap(r=>r.staticWrites));
 for(const r of [...additions,inventory.recorded.routines.find(r=>r.identity==="function:app.write_success_fee_v3(uuid,text,jsonb,jsonb)")!]){
  const routineName=r.identity.slice(13).split("(")[0]!;
  expect(staticScan(body(routineName),known,tables)).toEqual({staticWrites:r.staticWrites,staticCalls:r.staticCalls});
 }
 expect(proof.upgrade).toHaveLength(4);expect(proof.tenancy).toEqual([]);
 expect(proof.lp0.filter(c=>c.section==="triggers")).toHaveLength(2);
 expect(sql).not.toMatch(/(?:ALTER TABLE|CREATE (?:UNIQUE )?INDEX)/u);
});
it("independently rebuilds the writer's complete catch and withheld-payment sources",()=>{
 const gather=(source:string)=>source.slice(source.indexOf(" FOR a IN SELECT DISTINCT"),source.indexOf(" pair:=app.recovery_allocation_fraction_sum(parts);"));
 const writer=body("write_success_fee_v3");
 expect(gather(body("success_fee_inputs"))).toBe(gather(writer).replaceAll("p_job","j").replaceAll("actor.member_id","p_actor"));
 expect(writer.indexOf("PERFORM app.lock_success_fee_sources()")).toBeLessThan(writer.indexOf("'success-fee-job:'"));
 expect(writer.indexOf("'success-fee-job:'")).toBeLessThan(writer.indexOf(" FOR c IN SELECT id FROM app.recovery_case"));
 expect(writer).toContain("IF invalid_reduction AND delta>0 THEN");
 expect(body("success_fee_derivation_integrity")).toContain("OR stored IS DISTINCT FROM expected_sources");
});

it("preserves main's reversal-netted caps and invalid-proof compensation rules",()=>{
 const main=readFileSync(new URL("../migrations/0537_fee_invalid_proof_reduction.sql",import.meta.url),"utf8");
 const withheld=(source:string)=>source.slice(source.indexOf("  remaining:=landing.eligible_net_pence-reversed_net;"),source.indexOf("\n END LOOP;",source.indexOf("  remaining:=landing.eligible_net_pence-reversed_net;")));
 expect(withheld(body("write_success_fee_v3"))).toBe(withheld(main));
 expect(withheld(body("success_fee_inputs"))).toBe(withheld(main).replaceAll("p_job","j"));
 expect(body("write_success_fee_v3")).toContain("IF invalid_reduction AND delta=0 THEN RAISE EXCEPTION 'SUCCESS_FEE_SOURCE_CHANGED'");
 expect(body("success_fee_derivation_integrity")).toContain("((inputs->>'invalidReduction')::boolean AND NEW.delta_pence>=0)");
});
