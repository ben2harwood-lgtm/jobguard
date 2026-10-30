import { readFile } from "node:fs/promises";
import { expect,it } from "vitest";
import { parseInventory,staticScan } from "./lp-0-catalog.js";
it("0492 adds exactly its checked run, private loader, private immutable tables and recorded privilege facts",async()=>{
 const sql=await readFile(new URL("../migrations/0492_simulation_money_trail_run.sql",import.meta.url),"utf8");
 expect([...sql.matchAll(/CREATE TABLE app\.(\w+)/gu)].map(m=>m[1])).toEqual(["simulation_money_run","simulation_money_review"]);
 const definitions=[...sql.matchAll(/CREATE FUNCTION app\.(\w+)\([^;]*? AS \$\$([\s\S]*?)END \$\$;/gu)];
 expect(definitions.map(m=>m[1])).toEqual(["simulation_money_sources","simulation_money_run"]);
 for(const file of ["lp-0-effective-privileges-v1.json","lp-downstream-lp-0-recorded-input-v1.json"]){
  const raw=JSON.parse(await readFile(new URL(`../../../docs/contracts/${file}`,import.meta.url),"utf8"));parseInventory(raw);
  const known=new Set<string>(raw.recorded.routines.map((r:{identity:string})=>r.identity.slice(9).split("(")[0]));
  const tables=new Set<string>(raw.recorded.routines.flatMap((r:{staticWrites:string[]})=>r.staticWrites));
  for(const [_,name,body] of definitions){
   const facts=raw.recorded.routines.filter((r:{identity:string})=>r.identity.startsWith(`function:app.${name}(`));expect(facts).toHaveLength(1);
   expect(staticScan(body!,known,tables)).toEqual({staticCalls:facts[0].staticCalls,staticWrites:facts[0].staticWrites});
   expect(facts[0].runtimeExecute).toBe(name==="simulation_money_run");
  }
 }
 expect(sql).not.toMatch(/CREATE OR REPLACE|DELETE FROM|UPDATE app\.|greatest\(/iu);
 expect(sql.indexOf("IF availability->>'state'")).toBeLessThan(sql.indexOf('LOCK TABLE'));
});
