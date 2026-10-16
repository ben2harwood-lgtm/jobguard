import { vi } from "vitest";
import { randomUUID } from "node:crypto";
import { ExtraApprovalRepository } from "../src/index.js";
import { ContractorBillingRepository } from "../src/contractor-billing-repository.js";
import { chainWorld, cluster, submitted, approveInput, type Cluster } from "./extra-approval-chain-fixtures.js";
export { cluster };
export async function world(c: Cluster) {
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
 const w = await chainWorld(c), ctx = await w.ctx, repo = new ContractorBillingRepository(c.runtime);
 const session = randomUUID();
 await c.admin.query("INSERT INTO control_plane.contractor_practice_session(session_id,tenant_id,membership_id,identity_user_id) VALUES($1,$2,$3,$4)", [session,w.p.tenantId,w.members.finance.member.membershipId,w.members.finance.member.identityUserId]);
 const s = await submitted(c,w,24000);
 await new ExtraApprovalRepository(c.runtime).approveExtraStep(ctx,w.members.supervisor.member,approveInput(s,0));
 const contract = w.demo.contractId;
 const exportInput = () => ({ version:"billing-finalise.v1" as const, commandId:randomUUID(), clientContractId:contract });
 const exported = async () => repo.finalise(ctx,session,s.jobId,exportInput());
 const event = (type = "invoiced", overrides: Record<string,unknown> = {}) => ({version:"billing-status.v1",clientContractId:contract,source:"fictional",sourceEventId:randomUUID(),invoiceNumber:`INV-${s.extraId}`,factType:type,effectiveAt:"2026-10-02T12:00:00Z",remittanceReference:null,reconciliationId:null,originalEventId:null,amount:{netPence:124000,vatPence:24800,grossPence:148800},composition:null,explicit:null,separateInvoice:false,lineAdjustments:[],...overrides});
 const importInput = (events: unknown[]) => ({version:"billing-import-command.v1",commandId:randomUUID(),events,transport:"api",sourceHash:"a".repeat(64)});
 async function invoice() {
  const batch = await exported();
  const line = (await repo.read(ctx,session,s.jobId)).exports.find(e => e.id === batch.batchId)!.artifact.lines[0]!;
  const match = {exportLineId:line.exportLineId,jobId:line.jobId,extraId:line.extraId,scopeItemId:line.scopeItemId,revisionId:line.revisionId,revisionHash:line.revisionHash};
  return event("invoiced",{composition:{declared:{netPence:124000,vatPence:24800,grossPence:148800},lines:[{externalInvoiceLineId:"order",kind:"original_order",existedAt:"2026-10-01T00:00:00Z",netPence:100000,vatPence:20000,grossPence:120000,match:null},{externalInvoiceLineId:"extra",kind:"extra",existedAt:"2026-10-01T00:00:00Z",netPence:24000,vatPence:4800,grossPence:28800,match}]}});
 }
 return { w,ctx,repo,session,s,contract,event,exportInput,exported,importInput,invoice };
}
export type World = Awaited<ReturnType<typeof world>>;
export const code = (p:Promise<unknown>) => p.then(()=>"ok",(e:{code?:string})=>e.code);
