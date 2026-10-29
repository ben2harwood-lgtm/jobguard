// CI-only actual accepted lock/reconciliation/reveal records. No attribution/settlement success is fabricated.
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, expect, it } from "vitest";
import { createFinalCheckFixture, closeFinalCheckFixture, seedFinalCheckJob, availableFinalCheck, finalCheckTenant, type FinalCheckFixture } from "./final-check-fixture.js";
import { EvidencePackV3Repository, EvidencePackV3WorkerRepository } from "../src/evidence-pack-v3-repository.js";
let f: FinalCheckFixture;
beforeAll(async()=>{f=await createFinalCheckFixture();},90_000);
afterAll(async()=>{await closeFinalCheckFixture(f);});
it("a completed SV-5 reveal still cannot create a v3 pack without the part 3 runtime hookup",async()=>{
  const a=await seedFinalCheckJob(f);await availableFinalCheck(f,a);const caseId=randomUUID();
  await finalCheckTenant(f.admin,a.tenantId,db=>db.query(`INSERT INTO app.recovery_case
    (tenant_id,job_id,id,claim_pence,currency,state,synthetic,case_type,book,source_type,source_refs)
    VALUES($1,$2,$3,30000,'GBP','identified',true,'withheld_customer_payment','builder_customer','customer_invoice','[]')`,[a.tenantId,a.jobId,caseId]));
  const runtime=new EvidencePackV3Repository(f.runtime),worker=new EvidencePackV3WorkerRepository(f.shadow);
  const before=await runtime.read(a.context,caseId,a.digest),commandId=randomUUID();
  const command={version:"evidence-pack-command.v3",commandId,format:"TEXT",expectedVisibleSourceRevision:before.visibleSourceRevision};
  await expect(runtime.request(a.context,caseId,a.digest,command)).rejects.toThrow("EVIDENCE_PACK_V3_DEPENDENCY_HELD");
  // Owner-only stale-queue fixture tests the independent writer guard after real lock/reveal completion.
  await finalCheckTenant(f.admin,a.tenantId,db=>db.query(`INSERT INTO app.evidence_pack_v3_request
   (tenant_id,job_id,case_id,command_id,session_digest,command,pre_lock) VALUES($1,$2,$3,$4,$5,$6,false)`,[a.tenantId,a.jobId,caseId,commandId,a.digest,command]));
  const source=await worker.prepare(a.context,commandId);
  await expect(worker.finish(a.context,commandId,source.material)).rejects.toThrow("EVIDENCE_PACK_V3_DEPENDENCY_HELD");
  expect((await runtime.read(a.context,caseId,a.digest)).packs).toEqual([]);
});
