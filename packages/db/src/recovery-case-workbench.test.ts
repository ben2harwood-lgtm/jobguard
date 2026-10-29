import { randomUUID } from "node:crypto";
import { expect,it,vi } from "vitest";
import { projectRecoveryWorkbench, recoveryWorkbenchHistorySql } from "./recovery-case-workbench.js";
import { resolveFinalCheckRecoverySources } from "./recovery-case-sources.js";
import type { TenantTransaction } from "./tenant-context.js";
const tenant=randomUUID(),job=randomUUID();
function fixture(rows:unknown[]=[]){
 const query=vi.fn(async(_sql:string,_params?:unknown[])=>({rows,rowCount:rows.length}));
 return {rows:rows as import("./recovery-case-workbench.js").RecoveryHistoryRow[],query,db:{$client:{query}} as unknown as TenantTransaction};
}
const event=(kind:string,revision:number,amount_pence:string|null)=>({id:randomUUID(),kind,revision,amount_pence,from_state:"landed",to_state:kind==="claim_revision"?null:"negotiating",reviewer_ref:"membership:synthetic",created_at:new Date("2026-01-01T00:00:00Z"),subject_hash:"a".repeat(64),previous_hash:null});
it("keeps immutable claim, dispute, manual reversal and approved reversal facts distinct",async()=>{
 const f=fixture([event("claim_revision",1,"100"),event("dispute",4,"60"),event("reverse_landing",5,"20"),event("approved_reversal",6,"20")]);
 const details=await projectRecoveryWorkbench(f.rows,[],true);
 expect(details).toMatchObject({claimRevision:1,lastDisputedNetPence:60,manualReversedNetPence:20,approvedReversedNetPence:20,evidenceStatus:"sources_unresolved",canCommand:true});
 expect(details.history).toHaveLength(4);
 expect(details.history[0]).toMatchObject({amountPence:100,hash:"a".repeat(64)});
});
it("unknown dispute amounts remain unknown; sequence determines the latest event even for tied timestamps",async()=>{
 const f=fixture([event("dispute",8,null),event("dispute",2,"100")]);
 const result=await projectRecoveryWorkbench(f.rows,[],false);
 expect(result.lastDisputedNetPence).toBeNull();expect(result.ambiguity.join(" ")).toContain("amount is unknown");
});
it("scopes every history stream by tenant, job and case without reading hidden tables",async()=>{
 const f=fixture();await projectRecoveryWorkbench(f.rows,[],false);
 const sql=recoveryWorkbenchHistorySql;
 expect(sql).not.toMatch(/app\.(shadow|recovery_attribution)/u);
 expect(sql.match(/tenant_id=c.tenant_id AND (?:r\.)?job_id=c.job_id/g)).toHaveLength(6);
 expect(sql.match(/case_id=c.id/g)).toHaveLength(6);
});
it("does not call practice labels complete evidence",async()=>{
 const f=fixture([event("assemble_evidence",2,null)]);
 const details=await projectRecoveryWorkbench(f.rows,[{ref:"Supplier invoice INV-320",label:"Practice",kind:"Invoice",recorded:false}],true);
 expect(details.evidenceStatus).toBe("sources_unresolved");expect(details.ambiguity[0]).toContain("missing originals");
});
it("resolves Final Check references only through same-job public approval and lock facts",async()=>{
 const f=fixture([{id:randomUUID()}]),variation=randomUUID(),revision=randomUUID(),signal=randomUUID();
 const refs=[`variation:${variation}`,`revision:${revision}`,`signal:${signal}`];
 const result=await resolveFinalCheckRecoverySources(f.db,tenant,job,refs);
 expect(result.map(source=>source.recorded)).toEqual([true,true,false]);
 expect(f.query).toHaveBeenCalledWith(expect.stringContaining("app.final_account_lock"),[tenant,job,variation,revision]);
 expect(String(f.query.mock.calls[0]![0])).not.toContain("app.shadow");
 const absent=fixture();await expect(resolveFinalCheckRecoverySources(absent.db,tenant,randomUUID(),refs)).rejects.toThrow("RECOVERY_SOURCE_NOT_RECOGNISED");
});
