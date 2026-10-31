import { readFile } from "node:fs/promises";
import { expect,it } from "vitest";
import { parseInventory,staticScan } from "./lp-0-catalog.js";

const migration=(name:string)=>readFile(new URL(`../migrations/${name}`,import.meta.url),"utf8");
const writer=(sql:string)=>sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION app.write_success_fee_v3"),sql.lastIndexOf("COMMIT;"));
// Parenthesizing an extraction changes neither its source nor its authority.
const jsonGrouping=(sql:string)=>sql.replace(/\(((?:[a-z_]+\.)?[a-z_]+(?:->>?'(?:[^']|'')*')+)\)/gu,"$1");

it("0489 retains the reviewed 0406 authorization, replay and catch validation before adding compensation",async()=>{
 const reviewed=writer(await migration("0406_success_fee_catch_posting.sql"));
 const current=writer(await migration("0489_success_fee_recovery_compensation.sql"));
 const prefix=(sql:string)=>sql.slice(sql.indexOf("BEGIN\n"),sql.indexOf(" PERFORM app.lock_success_fee_sources();"));
 expect(jsonGrouping(prefix(current))).toBe(jsonGrouping(prefix(reviewed)));
 const start=" FOR c IN SELECT id FROM app.recovery_case";
 const catchPath=(sql:string,end:string)=>sql.slice(sql.indexOf(start),sql.indexOf(end));
 expect(jsonGrouping(catchPath(current," -- Builder-opened withheld-payment receipts")))
  .toBe(jsonGrouping(catchPath(reviewed," IF sources='[]'::jsonb")));
 const fence=current.indexOf(" PERFORM app.lock_success_fee_sources();");
 expect(fence).toBeGreaterThan(current.indexOf("LOCK TABLE app.action_authorization"));
 expect(fence).toBeLessThan(current.indexOf(start));
 expect(current.match(/PERFORM app\.lock_success_fee_sources\(\);/gu)).toHaveLength(1);
 expect(current).not.toMatch(/shadow_(commercial_signal|signal_|reconciliation_run|disclosure_event|break_glass_access)/u);
 expect(current).toContain("outstanding:=outstanding-remaining;");
 expect(current).toContain("IF outstanding<>0 THEN RAISE EXCEPTION 'SUCCESS_FEE_SOURCE_CHANGED'");
 expect(current).toContain("'compensationLinks',links");
});

it("both inventories record the final compensation routines without widening their runtime grants",async()=>{
 const sql=await migration("0489_success_fee_recovery_compensation.sql");
 const definitions=[...sql.matchAll(/CREATE OR REPLACE FUNCTION app\.(\w+)\([^;]*? AS \$\$([\s\S]*?)END \$\$;/gu)];
 expect(definitions.map(m=>m[1])).toEqual(["check_success_fee_journal","check_success_fee_derivation","write_success_fee_v3"]);
 const live=JSON.parse(await readFile(new URL("../../../docs/contracts/lp-0-effective-privileges-v1.json",import.meta.url),"utf8"));
 const known=new Set<string>(live.recorded.routines.map((r:{identity:string})=>r.identity.slice(9).split("(")[0]));
 const relations=new Set<string>(live.recorded.routines.flatMap((r:{staticWrites:string[]})=>r.staticWrites));
 for(const file of ["lp-0-effective-privileges-v1.json","lp-downstream-lp-0-recorded-input-v1.json"]){
  const raw=JSON.parse(await readFile(new URL(`../../../docs/contracts/${file}`,import.meta.url),"utf8"));parseInventory(raw);
  for(const [,name,body] of definitions){
   const facts=raw.recorded.routines.filter((r:{identity:string})=>r.identity.startsWith(`function:app.${name}(`));
   expect(facts).toHaveLength(1);
   expect(staticScan(body!,known,relations)).toEqual({staticCalls:facts[0].staticCalls,staticWrites:facts[0].staticWrites});
   expect(facts[0].runtimeExecute).toBe(name==="write_success_fee_v3");
   expect(facts[0].publicExecute).toBe(false);expect(facts[0].otherExecute).toEqual([]);
  }
 }
 expect(sql).not.toMatch(/GRANT /u);
});
