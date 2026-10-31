import { readFile } from "node:fs/promises";
import { expect,it } from "vitest";
import { parseInventory,staticScan } from "./lp-0-catalog.js";

it("the live LP inventory enumerates exactly the three 0490 routines and their actual calls/writes",async()=>{
 const sql=await readFile(new URL("../migrations/0490_simulation_fee_statement_issue.sql",import.meta.url),"utf8");
 const definitions=[...sql.matchAll(/CREATE FUNCTION app\.(\w+)\([^;]*? AS \$\$([\s\S]*?)END \$\$;/gu)];
 expect(definitions.map(m=>m[1]).sort()).toEqual(["platform_fee_statement_sources","read_platform_fee_statements","write_platform_fee_statement"]);
 // Compare the fully migrated 0497 replacements with the current inventory.
 const replacementSql=await readFile(new URL("../migrations/0497_withheld_payment_statement_source.sql",import.meta.url),"utf8");
 const replacements=new Map([...replacementSql.matchAll(/CREATE OR REPLACE FUNCTION app\.(\w+)\([^;]*? AS \$\$([\s\S]*?)END \$\$;/gu)].map(m=>[m[1],m[2]]));
 for(const file of ["lp-0-effective-privileges-v1.json"]){
  const raw=JSON.parse(await readFile(new URL(`../../../docs/contracts/${file}`,import.meta.url),"utf8"));parseInventory(raw);
  const knownRoutines=new Set<string>(raw.recorded.routines.map((r:{identity:string})=>r.identity.slice("function:".length).split("(")[0]));
  const relations=new Set<string>(raw.recorded.routines.flatMap((r:{staticWrites:string[]})=>r.staticWrites));
  for(const [_,name,body] of definitions){
   const facts=raw.recorded.routines.filter((r:{identity:string})=>r.identity.startsWith(`function:app.${name}(`));
   expect(facts).toHaveLength(1);
   expect(staticScan(replacements.get(name)??body!,knownRoutines,relations)).toEqual({staticCalls:facts[0].staticCalls,staticWrites:facts[0].staticWrites});
   expect(facts[0].runtimeExecute).toBe(name!=="platform_fee_statement_sources");
   if(name!=="platform_fee_statement_sources"){
    expect(raw.entries.filter((e:{key:string})=>e.key===`acl|routine|${facts[0].identity}|jobguard_runtime|EXECUTE|-`)).toHaveLength(1);
   }
  }
 }
});


it("the downstream snapshot records called 0490 dependencies without adding statement capability entries",async()=>{
 const raw=JSON.parse(await readFile(new URL("../../../docs/contracts/lp-downstream-lp-0-recorded-input-v1.json",import.meta.url),"utf8"));parseInventory(raw);
 const ownObject=/app\.(?:platform_fee_statement(?:_sources|_command)?|read_platform_fee_statements|write_platform_fee_statement)(?=[(|]|$)/u;
 expect(raw.entries.filter((e:{key:string})=>ownObject.test(e.key))).toEqual([]);
 const dependencies=raw.recorded.routines.filter((r:{identity:string})=>ownObject.test(r.identity));
 expect(dependencies.map((r:{identity:string})=>r.identity).sort()).toEqual([
  "function:app.platform_fee_statement_sources(uuid,uuid,uuid)",
  "function:app.write_platform_fee_statement(uuid,text,jsonb)",
 ]);
 const live=JSON.parse(await readFile(new URL("../../../docs/contracts/lp-0-effective-privileges-v1.json",import.meta.url),"utf8"));
 for(const record of dependencies){
  expect(record).toEqual(live.recorded.routines.find((r:{identity:string})=>r.identity===record.identity));
 }
 expect(dependencies.find((r:{identity:string})=>r.identity.includes("app.platform_fee_statement_sources("))).toMatchObject({
  owner:"jobguard_migration",securityDefiner:false,reachable:false,runtimeExecute:false,publicExecute:false,otherExecute:[],staticWrites:[],
 });
 for(const section of ["rls","policies","triggers"]){
  expect(raw.recorded[section].filter((row:string)=>ownObject.test(row))).toEqual([]);
 }
});
