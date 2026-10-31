import { readFile } from "node:fs/promises";
import { expect,it } from "vitest";
import { parseInventory,staticScan } from "./lp-0-catalog.js";
it("0492 adds exactly its checked run, private loader, private immutable tables and recorded privilege facts",async()=>{
 const sql=await readFile(new URL("../migrations/0492_simulation_money_trail_run.sql",import.meta.url),"utf8");
 expect([...sql.matchAll(/CREATE TABLE app\.(\w+)/gu)].map(m=>m[1])).toEqual(["simulation_money_run","simulation_money_review"]);
 const definitions=[...sql.matchAll(/CREATE FUNCTION app\.(\w+)\([^;]*? AS \$\$([\s\S]*?)END \$\$;/gu)];
 expect(definitions.map(m=>m[1])).toEqual(["simulation_money_sources","simulation_money_run"]);
 // The downstream design snapshot deliberately excludes later dependency objects.
 // Calls are scanned against the live inventory; only this piece's rows are unioned into each snapshot.
 const live=JSON.parse(await readFile(new URL("../../../docs/contracts/lp-0-effective-privileges-v1.json",import.meta.url),"utf8"));
 const known=new Set<string>(live.recorded.routines.map((r:{identity:string})=>r.identity.slice(9).split("(")[0]));
 for(const file of ["lp-0-effective-privileges-v1.json","lp-downstream-lp-0-recorded-input-v1.json"]){
  const raw=JSON.parse(await readFile(new URL(`../../../docs/contracts/${file}`,import.meta.url),"utf8"));parseInventory(raw);
  const tables=new Set<string>(raw.recorded.routines.flatMap((r:{staticWrites:string[]})=>r.staticWrites));
  for(const [_,name,body] of definitions){
   const facts=raw.recorded.routines.filter((r:{identity:string})=>r.identity.startsWith(`function:app.${name}(`));expect(facts).toHaveLength(1);
   expect(staticScan(body!,known,tables)).toEqual({staticCalls:facts[0].staticCalls,staticWrites:facts[0].staticWrites});
   expect(facts[0].runtimeExecute).toBe(name==="simulation_money_run");
  }
 }
 expect(sql).not.toMatch(/CREATE OR REPLACE|DELETE FROM|UPDATE app\.|greatest\(/iu);
 const closed=sql.indexOf("IF (availability->>'state')"),fence=sql.indexOf("PERFORM app.lock_success_fee_sources()");
 expect(closed).toBeGreaterThan(0);expect(fence).toBeGreaterThan(closed);
 expect(fence).toBeLessThan(sql.indexOf("hashtextextended('simulation-money:"));
 const body=definitions.find(m=>m[1]==="simulation_money_run")![2]!;
 expect(body).not.toMatch(/shadow_(commercial_signal|signal_|reconciliation_run|disclosure_event|break_glass_access)/u);
 expect(body).toContain("r.source_hash<>(p_command->>'sourceHash')");
});
it("0492 copies the exact predecessor policy quoting and every other SQL format string contains complete quoted literals",async()=>{
 const read=(name:string)=>readFile(new URL(`../migrations/${name}`,import.meta.url),"utf8");
 const sql=await read("0492_simulation_money_trail_run.sql"),predecessor=await read("0491_simulation_fee_collection.sql");
 const policy=(text:string)=>text.split("\n").find(l=>l.includes("EXECUTE format('CREATE POLICY success_fee_tenant"));
 expect(policy(sql)).toBe(policy(predecessor));
 // Decode each SQL string exactly as the outer PL/pgSQL parser does. This
 // catches accidental termination/loss of quotes in dynamic policy DDL.
 const formats=[...sql.matchAll(/EXECUTE format\('((?:[^']|'')*)',n\);/gu)].map(m=>m[1]!.replaceAll("''","'"));
 expect(formats).toHaveLength(sql.split("EXECUTE format(").length-1);
 const decodedPolicy=formats.find(s=>s.startsWith("CREATE POLICY"))!;
 const expression="tenant_id=CASE WHEN pg_input_is_valid(current_setting('app.tenant_id',true),'uuid') THEN nullif(current_setting('app.tenant_id',true),'')::uuid END";
 expect(decodedPolicy).toBe(`CREATE POLICY success_fee_tenant ON app.%I FOR ALL TO jobguard_migration USING(${expression}) WITH CHECK(${expression})`);
 expect(sql).not.toMatch(/current_setting\(app\.|,\)::uuid/u);
});
it("0489-0492 do not overwrite each other's routines; compensation is the latest writer and journal/derivation guard",async()=>{
 const files=["0489_success_fee_recovery_compensation.sql","0490_simulation_fee_statement_issue.sql","0491_simulation_fee_collection.sql","0492_simulation_money_trail_run.sql"];
 const definitions=new Map<string,string>();
 for(const file of files){const sql=await readFile(new URL(`../migrations/${file}`,import.meta.url),"utf8");for(const match of sql.matchAll(/CREATE (?:OR REPLACE )?FUNCTION app\.(\w+)\(/gu)){expect(definitions.has(match[1]!)).toBe(false);definitions.set(match[1]!,file);}}
 for(const name of ["write_success_fee_v3","check_success_fee_journal","check_success_fee_derivation"])expect(definitions.get(name)).toBe(files[0]);
});
