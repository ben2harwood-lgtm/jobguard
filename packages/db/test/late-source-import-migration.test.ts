import {readFileSync} from "node:fs";
import {expect,it} from "vitest";
import {lateSourceRegistryRow,currentCommandRegistryRows,lp5RegistryRows,managedRecoveryRegistryRow,siteSupervisorQueryRegistryRow,extraProceedRegistryRow} from "./lp5-command-catalog.js";
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
 expect(currentCommandRegistryRows).toEqual([...lp5RegistryRows,lateSourceRegistryRow,managedRecoveryRegistryRow,siteSupervisorQueryRegistryRow,extraProceedRegistryRow]);
 expect(currentCommandRegistryRows.filter(row=>row.command_type==="LateSource.import")).toHaveLength(1);
});
