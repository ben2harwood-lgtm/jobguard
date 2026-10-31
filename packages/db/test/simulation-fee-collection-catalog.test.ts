import { readFile } from "node:fs/promises";
import { expect,it } from "vitest";
import { parseInventory,staticScan } from "./lp-0-catalog.js";

it("the live LP inventory enumerates exactly the two 0491 routines and their actual calls/writes",async()=>{
 const sql=await readFile(new URL("../migrations/0519_simulation_fee_collection.sql",import.meta.url),"utf8");
 const definitions=[...sql.matchAll(/CREATE FUNCTION app\.(\w+)\([^;]*? AS \$\$([\s\S]*?)END \$\$;/gu)];
 expect(definitions.map(m=>m[1]).sort()).toEqual(["read_platform_fee_collection","write_platform_fee_collection"]);
 // Keep the runtime entry points within the shadow-catalog boundary. The private
 // helper holds the identical source locks without granting protected-table access.
 for(const [_,,body] of definitions){
  expect(body).not.toMatch(/\bapp\.shadow_\w+/u);
 }
 const writer=definitions.find(m=>m[1]==="write_platform_fee_collection")![2]!;
 expect(writer).toContain("PERFORM app.lock_success_fee_sources();");
 expect(writer.indexOf("PERFORM app.lock_success_fee_sources();")).toBeGreaterThan(writer.indexOf("LOCK TABLE app.action_authorization IN SHARE ROW EXCLUSIVE MODE;"));
 expect(writer.indexOf("PERFORM app.lock_success_fee_sources();")).toBeLessThan(writer.indexOf("FOR c IN SELECT id FROM app.recovery_case"));
 for(const file of ["lp-0-effective-privileges-v1.json"]){
  const raw=JSON.parse(await readFile(new URL(`../../../docs/contracts/${file}`,import.meta.url),"utf8"));parseInventory(raw);
  const knownRoutines=new Set<string>(raw.recorded.routines.map((r:{identity:string})=>r.identity.slice("function:".length).split("(")[0]));
  const relations=new Set<string>(raw.recorded.routines.flatMap((r:{staticWrites:string[]})=>r.staticWrites));
  for(const [_,name,body] of definitions){
   const facts=raw.recorded.routines.filter((r:{identity:string})=>r.identity.startsWith(`function:app.${name}(`));
   expect(facts).toHaveLength(1);
   expect(staticScan(body!,knownRoutines,relations)).toEqual({staticCalls:facts[0].staticCalls,staticWrites:facts[0].staticWrites});
   expect(facts[0].runtimeExecute).toBe(true);
   if(true){
    expect(raw.entries.filter((e:{key:string})=>e.key===`acl|routine|${facts[0].identity}|jobguard_runtime|EXECUTE|-`)).toHaveLength(1);
   }
  }
 }
});


it("the frozen downstream design snapshot excludes the later 0491 objects",async()=>{
 const raw=JSON.parse(await readFile(new URL("../../../docs/contracts/lp-downstream-lp-0-recorded-input-v1.json",import.meta.url),"utf8"));parseInventory(raw);
 const ownObject=/app\.(?:platform_fee_attempt(?:_event)?|platform_fee_collection_command|read_platform_fee_collection|write_platform_fee_collection)(?=[(|]|$)/u;
 expect(raw.entries.filter((e:{key:string})=>ownObject.test(e.key))).toEqual([]);
 expect(raw.recorded.routines.filter((r:{identity:string})=>ownObject.test(r.identity))).toEqual([]);
 for(const section of ["rls","policies","triggers"]){
  expect(raw.recorded[section].filter((row:string)=>ownObject.test(row))).toEqual([]);
 }
});
