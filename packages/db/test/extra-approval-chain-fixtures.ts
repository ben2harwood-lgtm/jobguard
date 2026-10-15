// ENT-5b fixtures. Every value here is a SYNTHETIC demo fixture value "to be set by Ben before real use" (see docs/verdicts/ENT-5b/BUILDER_RECEIPT.md).
import { randomUUID, randomBytes } from "node:crypto";
import { approvalRulesV1 } from "@jobguard/core";
import { ContractorRepository, ExtraRepository, ExtraApprovalRepository, WorkOrderRepository, demoFile, demoRow } from "../src/index.js";
import { cluster, siteFixture, command, direct, chain, invite, type Role } from "./site-extra-fixtures.js";
import type { Cluster } from "./extra-fixtures.js";
export { cluster, chain, command, invite };
export type { Cluster };

const supervisorStep = { role: "supervisor", timeLimitMinutes: 1, escalationRole: "commercial_manager", alternateRoles: ["surveyor"] };
/** Demo fixture rules: thresholds in whole pence. T (client approval) = 100000, Y (client before work) = 50000, X (proceed limit) = 25000. One-minute step waits so the escalation test can run. */
export const demoRules = approvalRulesV1.parse({
  version: "approval-rules.v1", proceedLimit: { pence: 25000, currency: "GBP" },
  bands: [
    { upToPence: 50000, steps: [supervisorStep] },
    { upToPence: 150000, steps: [supervisorStep, supervisorStep] },
    { upToPence: null, steps: [supervisorStep, { role: "commercial_manager", timeLimitMinutes: 1, escalationRole: "commercial_manager", alternateRoles: ["surveyor"] }] },
  ],
  clientApproval: { kind: "threshold", abovePence: 100000, beforeWorkAbovePence: 50000, timeLimitMinutes: 2880 },
  evidence: { photosRequired: true, residentConfirmationRequired: false },
});
export async function chainWorld(c: Cluster) {
  const f = await siteFixture(c);
  const supervisor2 = await invite(c, f, "supervisor", { kind: "team", id: f.demo.teamId });
  const client2 = await invite(c, f, "client_approver", { kind: "client", id: f.demo.clientId });
  const world = { ...f, supervisor2, client2, nextOrder: 10 };
  await reviseRules(c, world, demoRules);
  return world;
}
export type ChainWorld = Awaited<ReturnType<typeof chainWorld>>;
export async function reviseRules(c: Cluster, w: ChainWorld, rules: unknown) {
  const repo = new ContractorRepository(c.runtime);
  const contracts = await repo.query(w.p, { version: "contractor-query.v1", tenantId: w.p.tenantId, resource: "contracts" });
  const document = contracts.contracts.filter(x => x.client_id === w.demo.clientId).at(-1)!.document as Record<string, unknown>;
  await command(c, w, { kind: "contract.revise", clientId: w.demo.clientId, contractId: w.demo.contractId, document: { ...document, reference: `ENT5B ${randomUUID()}`.slice(0, 40) }, rules });
}
export async function newJob(c: Cluster, w: ChainWorld) {
  const n = w.nextOrder++;
  await new WorkOrderRepository(c.runtime).importCsv(w.p, { commandId: randomUUID(), name: "fictional.csv", kind: "csv", csv: demoFile([demoRow(w.demo, n)]) });
  return (await c.admin.query("SELECT job_id FROM app.work_order WHERE tenant_id=$1 AND reference=$2", [w.p.tenantId, `WO-DEMO-${String(n).padStart(3, "0")}`])).rows[0]?.job_id as string
    ?? (await c.admin.query("SELECT job_id FROM app.work_order WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 1", [w.p.tenantId])).rows[0].job_id as string;
}
export async function raiseOn(c: Cluster, w: ChainWorld, jobId: string, by: Role | "supervisor2" = "operative") {
  const actor = by === "supervisor2" ? w.supervisor2 : w.members[by];
  return (await new ExtraRepository(c.runtime).raiseExtra(await w.ctx, direct(w, actor, { jobId }))).variationId;
}
/** A logged, surveyor-priced, supervisor-submitted extra on its own new job. */
export async function submitted(c: Cluster, w: ChainWorld, net: number | null, raiser: Role = "operative") {
  const repo = new ExtraApprovalRepository(c.runtime), ctx = await w.ctx;
  const jobId = await newJob(c, w), extraId = await raiseOn(c, w, jobId, raiser);
  if (net !== null) await repo.priceExtra(ctx, w.members.surveyor.member, { version: "price-extra.v1", commandId: randomUUID(), jobId, extraId, netPence: net });
  const r = await repo.submitExtra(ctx, w.members.supervisor.member, { version: "submit-extra.v1", commandId: randomUUID(), jobId, extraId });
  return { jobId, extraId, requestId: r.requestId as string, hash: r.revisionHash as string, net: net as number, result: r };
}
export const approveInput = (s: { jobId: string; requestId: string; hash: string; net: number }, step: number, extra: Record<string, unknown> = {}) =>
  ({ version: "approve-extra-step.v1", commandId: randomUUID(), jobId: s.jobId, requestId: s.requestId, stepIndex: step, revisionHash: s.hash, netPence: s.net, ...extra });
export const newToken = () => randomBytes(32).toString("base64url");
export async function emailOf(c: Cluster, w: ChainWorld, membershipId: string) {
  return (await c.admin.query("SELECT email FROM app.contractor_member WHERE tenant_id=$1 AND membership_id=$2", [w.p.tenantId, membershipId])).rows[0].email as string;
}
export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
