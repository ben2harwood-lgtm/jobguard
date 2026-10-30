import {readFile} from "node:fs/promises";
import {expect,it} from "vitest";
import {parseInventory,staticScan} from "./lp-0-catalog.js";
const read=(name:string)=>readFile(new URL(`../migrations/${name}`,import.meta.url),"utf8");
it("0497 replaces only the five existing consumers, retains private ACLs, and records their exact static privilege facts",async()=>{
 const sql=await read("0497_withheld_payment_statement_source.sql");
 const definitions=[...sql.matchAll(/CREATE OR REPLACE FUNCTION app\.(\w+)\([^;]*? AS \$\$([\s\S]*?)END \$\$;/gu)];
 expect(definitions.map(m=>m[1])).toEqual(["platform_fee_statement_sources","simulation_money_sources","write_platform_fee_statement","write_platform_fee_collection","simulation_money_run"]);
 expect(sql).not.toMatch(/CREATE TABLE|GRANT |REVOKE |ALTER TABLE|DELETE FROM|UPDATE app\./u);
 const shared=await read("0489_success_fee_recovery_compensation.sql");
 const sharedDefinitions=[...shared.matchAll(/CREATE OR REPLACE FUNCTION app\.(\w+)\([^;]*? AS \$\$([\s\S]*?)END \$\$;/gu)]
  .filter(m=>["success_fee_withheld_source","write_success_fee_v3"].includes(m[1]!));
 expect(sharedDefinitions).toHaveLength(2);
 for(const file of ["lp-0-effective-privileges-v1.json","lp-downstream-lp-0-recorded-input-v1.json"]){
  const raw=JSON.parse(await readFile(new URL(`../../../docs/contracts/${file}`,import.meta.url),"utf8"));parseInventory(raw);
  const known=new Set<string>(raw.recorded.routines.map((r:{identity:string})=>r.identity.slice(9).split("(")[0]));
  const tables=new Set<string>(raw.recorded.routines.flatMap((r:{staticWrites:string[]})=>r.staticWrites));
  for(const [_,name,body] of [...definitions,...sharedDefinitions]){
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
 expect(sql).toContain("live->'source'->>'sourceHash' IS DISTINCT FROM source->>'sourceHash'");
});

it("shares one private withheld validator and checks current approval before either statement-source path",async()=>{
 const writer=await read("0489_success_fee_recovery_compensation.sql"),statement=await read("0497_withheld_payment_statement_source.sql");
 expect(writer).toContain("live:=app.success_fee_withheld_source(t,p_job,landing.id)");
 expect(statement).toContain("live:=app.success_fee_withheld_source(t,j,(source->>'recoveryAllocationId')::uuid)");
 const body=statement.split('END $$;')[0]!;
 const gate=body.indexOf("a.expires_at>clock_timestamp()",body.indexOf('FOR source IN'));
 expect(gate).toBeGreaterThan(body.indexOf('FOR source IN'));
 expect(gate).toBeLessThan(body.indexOf("IF source ? 'recoveryAllocationId'"));
 expect(writer.match(/cmd.created_at<=auth.expires_at/gu)).toHaveLength(1);
 expect(statement).not.toContain('cmd.created_at<=auth.expires_at');
 expect(writer).toContain('ALTER FUNCTION app.success_fee_withheld_source(uuid,uuid,uuid) OWNER TO jobguard_migration');
 expect(writer).toContain('REVOKE ALL ON FUNCTION app.success_fee_withheld_source(uuid,uuid,uuid) FROM PUBLIC,jobguard_runtime,jobguard_infrastructure,jobguard_shadow');
 const helper=writer.split('CREATE OR REPLACE FUNCTION app.success_fee_withheld_source')[1]!.split('END $$;')[0]!;
 expect(helper).not.toContain('SECURITY DEFINER');
 expect(helper).not.toMatch(/INSERT INTO|UPDATE app\.|DELETE FROM|GRANT /u);
});
