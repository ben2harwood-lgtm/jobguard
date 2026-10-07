import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { beforeEach, describe, expect, it, vi } from "vitest";
const spies = vi.hoisted(() => ({ verify: vi.fn(), command: vi.fn(), list: vi.fn() }));
vi.mock("@jobguard/db", async importOriginal => ({
  ...await importOriginal<typeof import("@jobguard/db")>(),
  readSyntheticDemoJob: spies.verify,
  RecoveryCaseRepository: class { command = spies.command; list = spies.list; listForMember = spies.list; },
}));
import { DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID } from "@jobguard/db";
const serverReviewer = { membershipId: DEMO_MEMBERSHIP_ID, identityUserId: DEMO_IDENTITY_USER_ID };
import { RecoveryCaseApplication } from "./recovery-case.application.js";
import { recoveryCaseCommandResponseV1, recoveryCaseListResponseV1 } from "./recovery-case.contracts.js";
const jobId = randomUUID();
const input = () => ({ version:"recovery-case-command.v1", action:"open", commandId:randomUUID(), caseType:"merchant_overcharge", claimedNetPence:32000, counterparty:"Merchant", book:"supplier_cost", sourceType:"supplier_documents", sourceRefs:["INV-320"], expectedRevision:0 });
const affectedId = randomUUID();
beforeEach(() => { vi.resetAllMocks(); spies.list.mockResolvedValue([]); spies.verify.mockResolvedValue({job:{id:jobId}}); spies.command.mockResolvedValue({id:affectedId}); });
it("derives the reviewer from verified sandbox membership with no client reviewer", async () => {
  const pool = {} as Pool;
  await new RecoveryCaseApplication(pool).command(jobId,input());
  expect(spies.verify).toHaveBeenCalledWith(pool,jobId);
  expect(spies.command).toHaveBeenCalledWith(expect.anything(),jobId,expect.anything(),serverReviewer);
});
it("does not authorize a client-supplied reviewer", async () => {
  await new RecoveryCaseApplication({} as Pool).command(jobId,{...input(),reviewerRef:"forged-reviewer"});
  expect(spies.command.mock.calls[0]?.[3]).toEqual(serverReviewer);
});
it("refuses the command when membership verification fails", async () => {
  spies.verify.mockRejectedValue(new Error("MEMBERSHIP_FORBIDDEN"));
  await expect(new RecoveryCaseApplication({} as Pool).command(jobId,{...input(),reviewerRef:"forged-reviewer"})).rejects.toThrow("MEMBERSHIP_FORBIDDEN");
  expect(spies.command).not.toHaveBeenCalled();
});
// M4-1-S-R repair 10 (Sol P2): reads are authorized exactly like writes. A revoked or expired membership, or a job outside the tenant, must not list cases.
it("verifies the persisted membership and job access before it lists cases", async () => {
  const pool = {} as Pool;
  await expect(new RecoveryCaseApplication(pool).list(jobId)).resolves.toMatchObject({ cases: [] });
  // The read itself rechecks the server-selected membership in its own transaction (Codex P2), not only the preflight.
  expect(spies.list).toHaveBeenCalledWith(expect.anything(), jobId, expect.objectContaining({ membershipId: expect.any(String), identityUserId: expect.any(String) }));
  expect(spies.verify).toHaveBeenCalledWith(pool, jobId);
  expect(spies.verify.mock.invocationCallOrder[0]).toBeLessThan(spies.list.mock.invocationCallOrder[0]!);
});
it.each(["MEMBERSHIP_FORBIDDEN", "JOB_NOT_FOUND"])("lists nothing when the membership or job check refuses with %s", async code => {
  spies.verify.mockRejectedValue(new Error(code));
  await expect(new RecoveryCaseApplication({} as Pool).list(jobId)).rejects.toThrow(code);
  expect(spies.list).not.toHaveBeenCalled();
});
it("returns the refreshed list after a command through the membership-checked read, without a second preflight", async () => {
  await new RecoveryCaseApplication({} as Pool).command(jobId, input());
  expect(spies.verify).toHaveBeenCalledTimes(1); // the preflight; the repository rechecks inside its own write transaction
  expect(spies.list).toHaveBeenCalledTimes(1);
  // The answer after the write is a read of its own, so it carries the membership too (Codex P2 4196319730).
  expect(spies.list).toHaveBeenCalledWith(expect.anything(), jobId, expect.objectContaining({ membershipId: expect.any(String), identityUserId: expect.any(String) }));
});
// M4-1-S-R repair 11 (Sol P2-5): the response names the case THIS command changed, as the repository returned it, so a browser never has to guess
// which case it opened from a list that another browser may have changed in the meantime.
it("returns the id of the case the command affected, even when the refreshed list ends with a later case from another browser", async () => {
  const later = randomUUID();
  spies.list.mockResolvedValue([{ id: affectedId }, { id: later }]);
  const response = await new RecoveryCaseApplication({} as Pool).command(jobId, input());
  expect(response.affectedCaseId).toBe(affectedId);
  expect(response.cases.map(x => x.id)).toEqual([affectedId, later]);
});
it("does not claim an affected case on a plain read", async () => {
  expect(await new RecoveryCaseApplication({} as Pool).list(jobId)).not.toHaveProperty("affectedCaseId");
});

// M4-1-S-R repair 13 (Sol P3-4): a command that creates or changes a case must say which case it affected, and that case must be in the list that comes with it. A browser
// that cannot find the answer to "which case did my command touch?" treats the answer as unreadable instead of choosing a case for itself.
const caseView = (id: string) => ({
  id, jobId, caseType: "withheld_customer_payment", state: "identified", claimedNetPence: 32000, landedNetPence: 0, outstandingNetPence: 32000, writtenOffPence: 0, currency: "GBP",
  counterparty: "Fictional Customer", book: "builder_customer", sourceType: "customer_invoice", sourceRefs: ["Generated customer invoice INV-18800"],
  sources: [{ ref: "Generated customer invoice INV-18800", kind: "Customer invoice", label: "Generated customer invoice INV-18800", recorded: false }],
  feeJobLiabilityPence: 0, feeObligationsPostedPence: 0, feeCompensationsPostedPence: 0, approvedLandedNetPence: 0, revision: 1, reviewerRef: "membership:fictional", createdDate: "2026-10-05", eligibility: null,
});
const envelope = { version: "recovery-case-workbench.v1", environment: "synthetic_demo", realExternalActions: 0 };
it("the command response contract requires an affected case id that is in the list", () => {
  const mine = randomUUID(), other = randomUUID();
  expect(recoveryCaseCommandResponseV1.safeParse({ ...envelope, cases: [caseView(mine)], affectedCaseId: mine }).success).toBe(true);
  expect(recoveryCaseCommandResponseV1.safeParse({ ...envelope, cases: [caseView(mine), caseView(other)], affectedCaseId: other }).success).toBe(true);
  // Missing: nothing says which case the command touched.
  expect(recoveryCaseCommandResponseV1.safeParse({ ...envelope, cases: [caseView(mine)] }).success).toBe(false);
  // Unknown: the id names a case that is not in the list (a client must never fall back to another case).
  expect(recoveryCaseCommandResponseV1.safeParse({ ...envelope, cases: [caseView(mine)], affectedCaseId: other }).success).toBe(false);
  expect(recoveryCaseCommandResponseV1.safeParse({ ...envelope, cases: [], affectedCaseId: mine }).success).toBe(false);
  expect(recoveryCaseCommandResponseV1.safeParse({ ...envelope, cases: [caseView(mine)], affectedCaseId: "not-an-id" }).success).toBe(false);
});
it("the read response contract is a plain list that needs no affected case", () => {
  const mine = randomUUID();
  expect(recoveryCaseListResponseV1.safeParse({ ...envelope, cases: [caseView(mine)] }).success).toBe(true);
  expect(recoveryCaseListResponseV1.safeParse({ ...envelope, cases: [] }).success).toBe(true);
  expect(recoveryCaseListResponseV1.safeParse({ ...envelope, cases: null }).success).toBe(false);
});
it("every real command answer satisfies the command response contract, and a plain read satisfies the list contract", async () => {
  const later = randomUUID();
  spies.list.mockResolvedValue([caseView(affectedId), caseView(later)]);
  const app = new RecoveryCaseApplication({} as Pool);
  expect(recoveryCaseCommandResponseV1.safeParse(await app.command(jobId, input())).success).toBe(true);
  const read = await app.list(jobId);
  expect(recoveryCaseListResponseV1.safeParse(read).success).toBe(true);
  expect(read).not.toHaveProperty("affectedCaseId");
});

it("a command that committed cannot turn its answer-read failure into a refusal", async () => {
 spies.list.mockRejectedValue(new Error("RECOVERY_STALE_REVISION"));
 await expect(new RecoveryCaseApplication({} as Pool).command(jobId, input())).rejects.toMatchObject({ code: "RECOVERY_COMMAND_OUTCOME_UNKNOWN" });
 expect(spies.command).toHaveBeenCalledTimes(1);
});

// Repair 15: every response money field shares the same safe integer magnitude boundary.
describe("repair 15 response money boundaries", () => {
 const view = {id:affectedId,jobId,caseType:"withheld_customer_payment",state:"identified",claimedNetPence:250000,landedNetPence:0,outstandingNetPence:250000,writtenOffPence:0,currency:"GBP",counterparty:"Fictional",book:"builder_customer",sourceType:"customer_invoice",sourceRefs:[],sources:[],feeJobLiabilityPence:0,feeObligationsPostedPence:0,feeCompensationsPostedPence:0,approvedLandedNetPence:0,revision:1,reviewerRef:"membership:fictional",createdDate:"2026-10-07",eligibility:{revision:1,caseRevision:1,evidenceRevision:1,policyVersion:"reference-d03.v1",policyRevision:1,classification:"eligible_for_review",eligibleNetPence:0,reason:"Synthetic",citations:[],status:"reviewed",reviewerRef:"membership:fictional"}};
 const envelope = (row: unknown) => ({version:"recovery-case-workbench.v1",environment:"synthetic_demo",realExternalActions:0,affectedCaseId:affectedId,cases:[row]});
 const principals = ["claimedNetPence","landedNetPence","outstandingNetPence","writtenOffPence","approvedLandedNetPence","feeObligationsPostedPence","feeCompensationsPostedPence","eligibleNetPence"];
 const row = (field:string,value:number|null) => field === "eligibleNetPence" ? {...view,eligibility:{...view.eligibility,eligibleNetPence:value}} : {...view,[field]:value};
 it.each(principals)("%s rejects negative, excessive and unsafe pence in list and command answers", field => {
  for(const value of [-1,1_000_000_000_001,2 ** 53,0.5]) {
   expect(recoveryCaseListResponseV1.safeParse(envelope(row(field,value))).success,`${field}: ${value}`).toBe(false);
   expect(recoveryCaseCommandResponseV1.safeParse(envelope(row(field,value))).success,`${field}: ${value}`).toBe(false);
  }
  for(const value of [0,1_000_000_000_000]) expect(recoveryCaseCommandResponseV1.safeParse(envelope(row(field,value))).success).toBe(true);
 });
 it("job net ledger liability is signed and bounded; eligibility may remain unknown", () => {
  for(const value of [-1,-1_000_000_000_000,0,1_000_000_000_000]) expect(recoveryCaseCommandResponseV1.safeParse(envelope(row("feeJobLiabilityPence",value))).success).toBe(true);
  for(const value of [-1_000_000_000_001,1_000_000_000_001,2 ** 53]) expect(recoveryCaseCommandResponseV1.safeParse(envelope(row("feeJobLiabilityPence",value))).success).toBe(false);
  expect(recoveryCaseCommandResponseV1.safeParse(envelope(row("eligibleNetPence",null))).success).toBe(true);
 });
});
