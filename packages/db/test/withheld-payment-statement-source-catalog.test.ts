import {readFile} from "node:fs/promises";
import {expect,it} from "vitest";
import {parseInventory,staticScan} from "./lp-0-catalog.js";
const read=(name:string)=>readFile(new URL(`../migrations/${name}`,import.meta.url),"utf8");
it("0497 replaces only the five existing consumers, retains private ACLs, and records their exact static privilege facts",async()=>{
 const sql=await read("0497_withheld_payment_statement_source.sql");
 const definitions=[...sql.matchAll(/CREATE OR REPLACE FUNCTION app\.(\w+)\([^;]*? AS \$\$([\s\S]*?)END \$\$;/gu)];
 expect(definitions.map(m=>m[1])).toEqual(["platform_fee_statement_sources","simulation_money_sources","write_platform_fee_statement","write_platform_fee_collection","simulation_money_run"]);
 expect(sql).not.toMatch(/CREATE TABLE|GRANT |REVOKE |ALTER TABLE|DELETE FROM|UPDATE app\./u);
 for(const file of ["lp-0-effective-privileges-v1.json","lp-downstream-lp-0-recorded-input-v1.json"]){
  const raw=JSON.parse(await readFile(new URL(`../../../docs/contracts/${file}`,import.meta.url),"utf8"));parseInventory(raw);
  const known=new Set<string>(raw.recorded.routines.map((r:{identity:string})=>r.identity.slice(9).split("(")[0]));
  const tables=new Set<string>(raw.recorded.routines.flatMap((r:{staticWrites:string[]})=>r.staticWrites));
  for(const [_,name,body] of definitions){
   const facts=raw.recorded.routines.filter((r:{identity:string})=>r.identity.startsWith(`function:app.${name}(`));expect(facts).toHaveLength(1);
   expect(staticScan(body!,known,tables)).toEqual({staticCalls:facts[0].staticCalls,staticWrites:facts[0].staticWrites});
  }
 }
});
it("fences withheld eligibility, allocation, terms and proof writers before all downstream audit writes",async()=>{
 const sql=await read("0497_withheld_payment_statement_source.sql");
 for(const name of ["write_platform_fee_statement","write_platform_fee_collection","simulation_money_run"]){
  const body=sql.slice(sql.indexOf(`CREATE OR REPLACE FUNCTION app.${name}(`)).split('END $$;')[0]!;
  for(const table of ["recovery_case_allocation","recovery_case_allocation_reversal","receipt_line_allocation","recovery_eligibility_revision","recovery_case_terms_approval","evidence_object","practice_feed_receipt_match"]){
   expect(body.indexOf(`app.${table}`)).toBeLessThan(body.indexOf('app.append_final_check_audit'));
   expect(body).toContain(`app.${table}`);
  }
 }
 expect(sql).not.toContain("withheld_payment_statement_source_adapter");
 expect(sql).toContain("source ? 'recoveryAllocationId'");
 expect(sql).toContain("live->>'sourceHash' IS DISTINCT FROM source->>'sourceHash'");
});
