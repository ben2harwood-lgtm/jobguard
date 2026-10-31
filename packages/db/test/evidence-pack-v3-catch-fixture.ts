// Fresh made-up source -> actual lock/reveal/catch/invoice/receipt writers.
// Source evidence and classifier proposals are fixture inputs, never settled end states.
import { randomUUID } from "node:crypto";
import { realReceiptFixture } from "./stored-receipt-case-fixture.js";
import type { FinalCheckFixture } from "./final-check-fixture.js";
import { StoredReceiptCaseAllocationRepository } from "../src/stored-receipt-case-allocation-repository.js";
import { RecoveryAttributionRepository } from "../src/recovery-attribution-repository.js";
export async function shadowPackCatch(f: FinalCheckFixture) {
  const x = await realReceiptFixture(f, "F7", 3000000);
  const revision = (await f.admin.query("SELECT revision FROM app.recovery_case_current WHERE tenant_id=$1 AND id=$2", [x.context.tenantId, x.caseId])).rows[0].revision as number;
  const repo = new StoredReceiptCaseAllocationRepository(f.runtime, "synthetic_demo");
  const command = { version: "stored-receipt-case-command.v1", commandId: randomUUID(), action: "review", factLineId: x.fact.lineAllocationId, caseId: x.caseId, workId: x.workId, expectedCaseRevision: revision };
  const review = await repo.command(x.context, x.jobId, x.auth.digest, command);
  const allocation = await repo.command(x.context, x.jobId, x.auth.digest, { ...command, action: "approve", commandId: randomUUID(), reviewId: review.reviewId, approvalHash: review.approvalHash });
  const assess = async (expectedAttributionRevision = 0) => new RecoveryAttributionRepository(f.runtime).assess(x.context, x.jobId, x.auth.digest, {
    version: "recovery-attribution-command.v1", action: "assess", commandId: randomUUID(), caseId: x.caseId, workId: x.workId, lineId: x.line, lockId: x.lock.id,
    expectedCaseRevision: (await f.admin.query("SELECT revision FROM app.recovery_case_current WHERE tenant_id=$1 AND id=$2", [x.context.tenantId, x.caseId])).rows[0].revision,
    expectedAttributionRevision,
  });
  const attribution = await assess();
  return { ...x, allocation, attribution, assess };
}
