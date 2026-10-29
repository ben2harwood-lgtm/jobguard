// CI-only PostgreSQL: public requests and direct worker calls fail closed until CH-8 part 3.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createEvidencePackV3Fixture, closeEvidencePackV3Fixture, type V3Fixture } from "./evidence-pack-v3-fixture.js";
import { EvidencePackV3Repository, EvidencePackV3WorkerRepository } from "../src/evidence-pack-v3-repository.js";
import { FinalAccountLockRepository } from "../src/final-account-lock-repository.js";
import { asFixtureTenant } from "./recovery-attribution-fixture.js";
let f: V3Fixture;
beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); f = await createEvidencePackV3Fixture();
  await new FinalAccountLockRepository(f.runtime).acceptTerms(f.auth.context, { actorMembershipId: f.auth.membershipId, commandId: randomUUID(), termsVersion: "synthetic_final_check_terms.v1" });
}, 90_000);
afterAll(async () => { if (f) await closeEvidencePackV3Fixture(f); vi.unstubAllEnvs(); });
it("generation and approval requests refuse without a queue, artifact or approval effect", async () => {
  const repo=new EvidencePackV3Repository(f.runtime);
  const before=await repo.read(f.auth.context,f.caseId,f.auth.digest);
  for(const command of [
    {version:"evidence-pack-command.v3",commandId:randomUUID(),format:"TEXT",expectedVisibleSourceRevision:before.visibleSourceRevision},
    {version:"evidence-pack-attachment-approval.v3",commandId:randomUUID(),packId:randomUUID(),expectedManifestHash:"a".repeat(64),expectedContentHash:"b".repeat(64)},
  ])await expect(repo.request(f.auth.context,f.caseId,f.auth.digest,command)).rejects.toThrow("EVIDENCE_PACK_V3_DEPENDENCY_HELD");
  expect(await repo.read(f.auth.context,f.caseId,f.auth.digest)).toEqual(before);
  expect((await f.admin.query("SELECT count(*)::int n FROM infrastructure.evidence_pack_v3_request WHERE tenant_id=$1",[f.source.tenantId])).rows[0].n).toBe(0);
});
it("even an owner-seeded stale request with a must-surface receipt cannot bypass the SQL writer fence",async()=>{
  const repo=new EvidencePackV3Repository(f.runtime),worker=new EvidencePackV3WorkerRepository(f.shadow);
  const before=await repo.read(f.auth.context,f.caseId,f.auth.digest),commandId=randomUUID();
  const command={version:"evidence-pack-command.v3",commandId,format:"TEXT",expectedVisibleSourceRevision:before.visibleSourceRevision};
  // Test-only owner setup models a request queued by an older deployment; runtime has no INSERT grant.
  await asFixtureTenant(f.admin,f.source.tenantId,db=>db.query(`INSERT INTO app.evidence_pack_v3_request
   (tenant_id,job_id,case_id,command_id,session_digest,command,pre_lock) VALUES($1,$2,$3,$4,$5,$6,true)`,[f.source.tenantId,f.source.jobId,f.caseId,commandId,f.auth.digest,command]));
  const prepared=await worker.prepare(f.auth.context,commandId);
  await worker.completeMustSurface(f.auth.context,commandId,prepared.visibleRevision);
  await expect(worker.finish(f.auth.context,commandId,prepared.material)).rejects.toThrow("EVIDENCE_PACK_V3_DEPENDENCY_HELD");
  expect((await repo.read(f.auth.context,f.caseId,f.auth.digest)).packs).toEqual([]);
  for(const table of ["evidence_pack_v3","evidence_pack_v3_approval","shadow_commercial_signal"])
    await expect(f.runtime.query(`SELECT * FROM app.${table}`)).rejects.toThrow(/permission denied/u);
});
