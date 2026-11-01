import { readFile } from "node:fs/promises";
import { expect,it } from "vitest";
import { parseInventory,staticScan } from "./lp-0-catalog.js";

it("the live LP inventory enumerates exactly the three 0490 routines and their actual calls/writes",async()=>{
 const sql=await readFile(new URL("../migrations/0490_simulation_fee_statement_issue.sql",import.meta.url),"utf8");
 const definitions=[...sql.matchAll(/CREATE FUNCTION app\.(\w+)\([^;]*? AS \$\$([\s\S]*?)END \$\$;/gu)];
 expect(definitions.map(m=>m[1]).sort()).toEqual(["platform_fee_statement_sources","read_platform_fee_statements","write_platform_fee_statement"]);
 for(const file of ["lp-0-effective-privileges-v1.json"]){
  const raw=JSON.parse(await readFile(new URL(`../../../docs/contracts/${file}`,import.meta.url),"utf8"));parseInventory(raw);
  const knownRoutines=new Set<string>(raw.recorded.routines.map((r:{identity:string})=>r.identity.slice("function:".length).split("(")[0]));
  const relations=new Set<string>(raw.recorded.routines.flatMap((r:{staticWrites:string[]})=>r.staticWrites));
  for(const [_,name,body] of definitions){
   const facts=raw.recorded.routines.filter((r:{identity:string})=>r.identity.startsWith(`function:app.${name}(`));
   expect(facts).toHaveLength(1);
   expect(staticScan(body!,knownRoutines,relations)).toEqual({staticCalls:facts[0].staticCalls,staticWrites:facts[0].staticWrites});
   expect(facts[0].runtimeExecute).toBe(name!=="platform_fee_statement_sources");
   if(name!=="platform_fee_statement_sources"){
    expect(raw.entries.filter((e:{key:string})=>e.key===`acl|routine|${facts[0].identity}|jobguard_runtime|EXECUTE|-`)).toHaveLength(1);
   }
  }
 }
});


it("the frozen downstream design snapshot excludes the later 0490 objects",async()=>{
 const raw=JSON.parse(await readFile(new URL("../../../docs/contracts/lp-downstream-lp-0-recorded-input-v1.json",import.meta.url),"utf8"));parseInventory(raw);
 const ownObject=/app\.(?:platform_fee_statement(?:_sources|_command)?|read_platform_fee_statements|write_platform_fee_statement)(?=[(|]|$)/u;
 expect(raw.entries.filter((e:{key:string})=>ownObject.test(e.key))).toEqual([]);
 expect(raw.recorded.routines.filter((r:{identity:string})=>ownObject.test(r.identity))).toEqual([]);
 for(const section of ["rls","policies","triggers"]){
  expect(raw.recorded[section].filter((row:string)=>ownObject.test(row))).toEqual([]);
 }
});
