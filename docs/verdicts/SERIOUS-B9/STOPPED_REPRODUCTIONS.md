# S26 and S27 stopped regressions

Both tests below were executed against the baseline reader copied with `git show 760fe6f52cb1364540c72092c3c882532d9b9d27:packages/db/src/recovery-allocation-repository.ts`. Both failed for the expected reason; see `stopped-before.log`. They are retained here for the coordinator to activate after a ruling, rather than placing knowingly failing stopped work in the normal suite. No existing assertion was changed. These are adapter doubles, not PostgreSQL verification.

To repeat: copy the baseline reader to `packages/db/src/recovery-allocation-b9-original.ts`, put this test at `packages/db/src/serious-b9-stopped.test.ts`, and run `pnpm --filter @jobguard/db exec vitest run src/serious-b9-stopped.test.ts --maxWorkers=1`. Remove both temporary files afterwards. Build core first so its package export reflects the checkout.

```ts
import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
const { query }=vi.hoisted(()=>({query:vi.fn(async(sql:string)=>{
 if(sql.includes("SELECT 1 FROM app.membership")||sql.includes("SELECT 1 FROM app.job")) return {rows:[{}],rowCount:1};
 if(sql.includes("SELECT case_type,revision,claim_pence")) return {rows:[{case_type:"withheld_customer_payment",revision:1,claim_pence:"300000"}]};
 if(sql.includes("SELECT e.id,e.state")) return {rows:[{id:"50000000-0000-4000-8000-000000000005",state:"settled",settled_before_opening:false,duplicate_held:false}]};
 if(sql.includes("to_regclass")) return {rows:[{installed:false}]};
 if(sql.includes("RETURNING encode")) return {rows:[{result_hash:"a".repeat(64)}]};
 return {rows:[],rowCount:0};
})}));
vi.mock("./tenant-context.js",()=>({withTenant:async(_p:unknown,_c:unknown,work:any)=>work({$client:{query}})}));
vi.mock("./audit.js",()=>({appendAuditBatch:async()=>undefined}));
import { RecoveryEligibilityV3Repository } from "./recovery-eligibility-v3-repository.js";
import { RecoveryAllocationRepository } from "./recovery-allocation-b9-original.js";
it("S26 F18 principal-only settlement excludes absent interest",async()=>{
 const repo=new RecoveryEligibilityV3Repository({} as any,"synthetic_demo");
 const r=await repo.review({tenantId:randomUUID()} as any,randomUUID(),{version:"recovery-eligibility-command.v3",action:"review",commandId:randomUUID(),caseId:randomUUID(),expectedCaseRevision:1,expectedReviewRevision:0,fixture:"F18"},{membershipId:randomUUID(),identityUserId:randomUUID()},"a".repeat(64));
 expect(r.result.qualifyingPrincipal.pence).toBe(250000);
});
it("S27 accepts the signed invoice composition with an approved omission",async()=>{
 const rows=[100000,12500,-2500].map(net=>({id:randomUUID(),net_pence:String(net),gross_pence:String(net*6/5),invoice_net_pence:"110000",invoice_gross_pence:"132000",existed_at:"2026-10-15T00:00:00Z"}));
 const db={$client:{query:async(sql:string)=>({rows:sql.includes("SELECT l.*")?rows.filter(row=>Number(row.net_pence)>0):[],rowCount:0})}};
 const repo=new RecoveryAllocationRepository({} as any);
 await expect((repo as any).lineFacts(db,{tenantId:randomUUID()},randomUUID(),{id:randomUUID(),invoice_id:randomUUID(),invoice_net_pence:"110000",movement_at:"2026-10-16T00:00:00Z"},{action:"review",grossPence:38400},{lines:[]},null,null)).resolves.toBeDefined();
});

```
