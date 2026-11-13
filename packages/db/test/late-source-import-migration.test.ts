import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
import {applyUpgradeProofs,loadMigrationProofs} from "./migration-proof-loader.js";
import {lateSourceRegistryRow,currentCommandRegistryRows,lp5RegistryRows,managedRecoveryRegistryRow,siteSupervisorQueryRegistryRow,darkOrderRegistryRow,rateSuggestionRegistryRow,contractorJobFinishRegistryRow,duplicateDispositionRegistryRow,extraProceedRegistryRow,abandonedSiteVisitRegistryRow,duplicateDispositionLifecycleRegistryRow} from "./lp5-command-catalog.js";
const sql=readFileSync(new URL("../migrations/0541_late_source_import.sql",import.meta.url),"utf8");
it("0613 preserves the latest command-result body apart from its new source proof",()=>{
 const original=readFileSync(new URL("../migrations/0522_lp5b_writers.sql",import.meta.url),"utf8");
 const body=(s:string)=>s.slice(s.indexOf("CREATE OR REPLACE FUNCTION app.lp5_command_result("),s.indexOf("END $$;",s.indexOf("CREATE OR REPLACE FUNCTION app.lp5_command_result("))+8).trim();
 const added=/  IF r\.command_type='LateSource\.import' THEN[\s\S]*?   RETURN value;\n  END IF;\n/;
 expect(body(sql).replace(added,"")).toBe(body(original));
});
it("0613 adds only a historical evidence command and no site or shadow authority",()=>{
 const writer=sql.slice(sql.indexOf("CREATE FUNCTION app.import_late_source("));
 expect(writer).not.toMatch(/app\.(?:ch4_admit_place|ch4_capture_site_source|sv7a_intake_job_source|shadow_[a-z_]+|job_work_state_event)/u);
 expect(sql).not.toMatch(/GRANT[^;]+TO jobguard_shadow/u);
 expect(writer).toContain("received:=clock_timestamp()");
 expect(writer).toContain("sent>=locked");
 expect(writer).toContain("app.begin_command");expect(writer).toContain("app.complete_command");
 expect(writer).toContain("INSERT INTO infrastructure.demo_source_hold_request");
});

it("0613 extends the exact successor registry without changing historical LP-5 expectations",()=>{
 const seed=sql.split("INSERT INTO app.command_type_registry VALUES")[1]!.split(";")[0]!;
 const values=seed.match(/\(([^()]+)\)/)![1]!.split(",").map(value=>value.trim()==="NULL"?null:value.trim().slice(1,-1));
 expect(Object.fromEntries(Object.keys(lateSourceRegistryRow).map((key,index)=>[key,values[index]]))).toEqual(lateSourceRegistryRow);
 expect(currentCommandRegistryRows).toEqual([...lp5RegistryRows.map(row=>row.command_type==="IssueClientApproval"?{...row,permission_rule:"contractor"}:row),lateSourceRegistryRow,managedRecoveryRegistryRow,siteSupervisorQueryRegistryRow,darkOrderRegistryRow,rateSuggestionRegistryRow,contractorJobFinishRegistryRow,duplicateDispositionRegistryRow,extraProceedRegistryRow,abandonedSiteVisitRegistryRow,duplicateDispositionLifecycleRegistryRow]);
 expect(currentCommandRegistryRows.filter(row=>row.command_type==="LateSource.import")).toHaveLength(1);
});

it("0620 keeps the exact EndCheck registry delta in snapshot order",()=>{
 const {proofs}=loadMigrationProofs();
 const registryDelta=(migration:string)=>{
  const delta=proofs.find(proof=>proof.migration===migration)!.upgrade.find(change=>
   change.section==="rows" && change.after?.table==="app.command_type_registry");
  if(!delta || delta.section!=="rows") throw new Error("Missing registry proof");
  return delta;
 };
 const previous=registryDelta("0609_rate_suggestion_acceptance.sql");
 const delta=registryDelta("0620_contractor_job_finish.sql");
 expect(delta.before).toEqual(previous.after);
 // jsonb text starts with the shortest key, `version`: end-check.v1 sorts
 // after decision-resolution-command.v1 and before rate-suggestion-accept.v1.
 const rows=delta.before!.data;
 const index=rows.findIndex(row=>(row as {command_type:string}).command_type==="rate.suggestion_accept");
 expect(index).toBeGreaterThan(0);
 expect(rows[index-1]).toMatchObject({command_type:"finding.resolve",version:"decision-resolution-command.v1"});
 const expected=[...rows.slice(0,index),contractorJobFinishRegistryRow,...rows.slice(index)];
 expect(delta.after!.data).toEqual(expected);
 const baseline={rows:{"app.command_type_registry":rows},routines:[],relations:[],policies:[]};
 const proof={migration:"0620_contractor_job_finish.sql",lp0:[],upgrade:[delta],tenancy:[]};
 expect(applyUpgradeProofs(baseline,[proof],{}).rows["app.command_type_registry"]).toEqual(expected);
 expect(baseline.rows["app.command_type_registry"]).toEqual(previous.after!.data);
});
