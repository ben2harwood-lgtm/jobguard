import { randomUUID } from "node:crypto";
import { expect,it,vi } from "vitest";
import type { Pool } from "pg";
import { PaymentFeeRepository } from "./payment-fee-repository.js";
import { verifiedTenantContextForQueuedJob } from "./tenant-context.js";
function fixture(){
 const context=verifiedTenantContextForQueuedJob(randomUUID()),jobId=randomUUID(),digest="a".repeat(64);
 const query=vi.fn(async(sql:string)=>({rows:sql.includes("read_payment_fees")?[{result:{version:"payment-fee-view.v1",jobId,receipts:[],statements:[],standingAuthority:null,productionEnabled:false,realExternalActions:0}}]:[]}));
 const pool={connect:async()=>({query,release:vi.fn()})} as unknown as Pool;
 return {context,jobId,digest,query,repo:new PaymentFeeRepository(pool)};
}
it("passes stamped tenant context and session through the controlled SQL read",async()=>{
 const f=fixture();expect((await f.repo.read(f.context,f.jobId,f.digest)).statements).toEqual([]);
 expect(f.query).toHaveBeenCalledWith("SELECT app.read_payment_fees($1,$2) result",[f.jobId,f.digest]);
 expect(f.query).toHaveBeenLastCalledWith("COMMIT");
});
it("rejects copied contexts and app supplied amounts before accessing the database",async()=>{
 const f=fixture();await expect(f.repo.read({...f.context},f.jobId,f.digest)).rejects.toThrow("verified tenant context");
 await expect(f.repo.command(f.context,f.jobId,f.digest,{version:"payment-fee-command.v1",action:"prepare",commandId:randomUUID(),paymentId:randomUUID(),feePence:8000})).rejects.toThrow("INVALID_PAYMENT_FEE_COMMAND");
 expect(f.query).not.toHaveBeenCalled();
});
it("a foreign returned job cannot be displayed as this job's statement",async()=>{
 const f=fixture();await expect(f.repo.read(f.context,randomUUID(),f.digest)).rejects.toThrow("NOT_FOUND");
 expect(f.query).toHaveBeenLastCalledWith("ROLLBACK");
});
