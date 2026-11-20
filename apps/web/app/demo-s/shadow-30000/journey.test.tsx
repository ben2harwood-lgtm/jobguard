import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mapValueReceipt } from "@jobguard/core";
import { extractCaptureFixture } from "@jobguard/ai";
import { ShadowJourney, ShadowSavedReport } from "./journey";
import { parseShadowReport, shadowCaptureText } from "./journey-model";
vi.stubGlobal("React", React);
const jobId = randomUUID();
function report() { return {
 version: "shadow-demo-report.v2", environment: "synthetic_demo", jobId, status: "incomplete", realExternalActions: 0, customerApproval: { state: "not_ready_yet", approvals: [] },
 account: { jobId, account: null, captures: [], lock: null },
 invoices: { version: 1, environment: "synthetic_demo", jobId, invoices: [] },
 value: { version: "job-value.v3", environment: "synthetic_demo", jobId,
  status: "incomplete", reason: "producer_bindings_held", producers: { sources: "HELD", derivation: "HELD", subscription: "HELD", postedMoney: "HELD" }, asOf: null, receipt: null },
}; }
it("has nine guided steps, source-only £30,000 input and no saved success before a read", async () => {
 const proposal = await extractCaptureFixture(randomUUID(), shadowCaptureText, "deterministic-local-v1");
 expect(proposal.lines).toHaveLength(5);
 expect(proposal.lines.reduce((total, line) => total + (line.unitPricePence.value ?? 0), 0)).toBe(3000000);
 const html = renderToStaticMarkup(<ShadowJourney />);
 for (const text of ["£3,200", "£400", "£500", "£300", "£34,400", "£41,280", "£800 recovered", "£80", "£720", "£3,600", "£0", "only saved customer responses count as approval", "customer portal"]) expect(html).toContain(text);
 expect(html.match(/<li>/gu)).toHaveLength(9);
 // The start button uses its visible plain-English copy as its accessible name.
 const visible = html.replace(/<[^>]*>/gu, " ");
 expect(visible).not.toMatch(/landing allocations|SV-6 assessment|target Q|J3 capture|\bRED\b|verdict|observations|0 of 2/i);
 expect(html).toContain('<button>Create or resume the £30,000 practice job</button>');
 expect(html).toContain('<button type="submit">Load this job’s saved results</button>');
 expect(html).not.toContain("Saved job evidence"); expect(html).not.toContain("You finished");
});
it("reports every capture state fee-free without implying customer approval or verified payment", () => {
 const raw = report();
 const parsed = parseShadowReport({ ...raw, account: { ...raw.account, captures: ["draft", "priced", "approved", "rejected", "withdrawn"].map((state, i) => ({ id: randomUUID(), state, description: `Fictional capture ${i}`, origin: i === 0 ? "final_review" : "builder_logged", netPence: i === 0 ? 40000 : 320000 })) } }, jobId);
 const html = renderToStaticMarkup(<ShadowSavedReport report={parsed} />);
 expect(html.match(/recovery fee £0/gu)).toHaveLength(5); expect(html).toContain("No invoice issued"); expect(html).toContain("complete the Final Check first");
 expect(html).toContain("Supporting evidence packs"); expect(html).toContain("Job value report"); expect(html).not.toContain("Saved fee calculations");
});
it("rejects another job, pre-lock reveal/count/history/pack leaks and client completion flags", () => {
 const raw = report();
 for (const extra of [{ jobId: randomUUID() }, { finalCheck: { state: "unlocked", items: [] } }, { assessments: [] }, { packs: [] }, { hiddenCount: 0 }, { completed: true }, { realExternalActions: 1 }]) expect(() => parseShadowReport({ ...raw, ...extra }, jobId)).toThrow();
 expect(() => parseShadowReport({ ...raw, account: { ...raw.account, jobId: randomUUID() } }, jobId)).toThrow();
 expect(() => parseShadowReport({ ...raw, invoices: { ...raw.invoices, jobId: randomUUID() } }, jobId)).toThrow();
});
it("rejects a reveal from a different locked bill", () => {
 const raw = report();
 expect(() => parseShadowReport({ ...raw, account: { ...raw.account, lock: { id: randomUUID(), finalAccountRevisionId: randomUUID(), lockedAt: "2026-10-29T00:00:00Z", digest: "a".repeat(64) } }, finalCheck: { state: "completed", lockId: randomUUID(), items: [] } }, jobId)).toThrow("Wrong lock report");
});

it.each(["not_ready_yet", "awaiting_customer", "approved"])("accepts the v2 customer approval state %s", state => {
 const customerApproval = { state, approvals: state === "approved"
  ? [{ variationId: randomUUID(), approvedAt: "2026-10-31T04:00:00Z", method: "customer_portal" }] : [] };
 const parsed = parseShadowReport({ ...report(), customerApproval }, jobId);
 expect(parsed.customerApproval).toEqual(customerApproval);
 const html = renderToStaticMarkup(<ShadowSavedReport report={parsed} />);
 expect(html).toContain(state === "not_ready_yet" ? "Not ready for the customer yet" : state === "awaiting_customer" ? "Awaiting customer" : "Approved through the customer portal");
 if (state !== "not_ready_yet") expect(html).not.toContain("MON-5");
 for (const approval of customerApproval.approvals) {
  expect(html).toContain(approval.variationId); expect(html).toContain(approval.approvedAt);
 }
 expect(html).toContain("Incomplete"); expect(html).toContain("No invoice issued");
 expect(html).not.toContain("£80");
});
it("accepts the full mapped v3 value receipt for the same locked job", () => {
 const raw = report(), lockId = randomUUID();
 const lock = { id: lockId, finalAccountRevisionId: randomUUID(), lockedAt: "2026-10-31T04:00:00Z", digest: "a".repeat(64) };
 const value = { version: "job-value.v3", environment: "synthetic_demo", jobId, status: "mapped",
  receipt: mapValueReceipt({ tenantId: randomUUID(), jobId, lockId, lockedRevisionId: lock.finalAccountRevisionId,
   lockedAt: lock.lockedAt, foundComplete: true, checkId: randomUUID(), checkedAt: lock.lockedAt,
   checked: [], tracked: [], assessments: [] }) };
 const saved = { ...raw, account: { ...raw.account, lock }, value };
 const parsed = parseShadowReport(saved, jobId);
 expect(parsed.value).toEqual(value);
 const html = renderToStaticMarkup(<ShadowSavedReport report={parsed} />);
 expect(html).toContain("Job value report: mapped; figures and supporting records saved");
 expect(html).not.toContain("Job value report: mapped; supporting records are not ready yet");
 expect(html).not.toContain("Saved practice payment"); expect(html).not.toContain("a completed practice payment is matched to each extra");
 expect(() => parseShadowReport({ ...saved, value: { ...value, jobId: randomUUID() } }, jobId)).toThrow();
 expect(() => parseShadowReport({ ...saved, value: { ...value, receipt: { ...value.receipt,
  sources: { ...value.receipt.sources, lockId: randomUUID() } } } }, jobId)).toThrow();
 expect(() => parseShadowReport({ ...saved, account: raw.account }, jobId)).toThrow();
});
it("rejects stale v1 reports, unbound value shortcuts and unknown approval fields or methods", () => {
 const raw = report();
 for (const patch of [
  { version: "shadow-demo-report.v1" }, { customerApproval: "not_ready_yet" },
  { customerApproval: { state: "unknown", approvals: [] } },
  { customerApproval: { ...raw.customerApproval, attested: true } },
  { customerApproval: { state: "approved", approvals: [{ variationId: randomUUID(), approvedAt: "2026-10-31T04:00:00Z", method: "builder_attestation" }] } },
  { value: { status: "incomplete", reason: "producer_bindings_held" } },
  { value: { ...raw.value, hiddenCount: 0 } },
 ]) expect(() => parseShadowReport({ ...raw, ...patch }, jobId)).toThrow();
});

it("shows step 6 approved only for persisted customer portal approval", () => {
 const parsed = parseShadowReport({ ...report(), customerApproval: { state: "approved", approvals: [{ variationId: randomUUID(), approvedAt: "2026-10-31T08:00:00Z", method: "customer_portal" }] } }, jobId);
 expect(renderToStaticMarkup(<ShadowSavedReport report={parsed} />)).toContain("Step 6: approved by the customer");
});

function completeReport() {
 const lock = { id: randomUUID(), finalAccountRevisionId: randomUUID(), lockedAt: "2026-10-31T04:00:00Z", digest: "a".repeat(64) };
 const receipt = { ...mapValueReceipt({ tenantId: randomUUID(), jobId, lockId: lock.id, lockedRevisionId: lock.finalAccountRevisionId, lockedAt: lock.lockedAt, foundComplete: true, checkId: randomUUID(), checkedAt: lock.lockedAt, checked: [], tracked: [], assessments: [] }) };
 const raw = report();
 return { ...raw, status: "complete", customerApproval: { state: "approved", approvals: [{ variationId: randomUUID(), approvedAt: "2026-10-31T08:00:00Z", method: "customer_portal" }] },
  account: { ...raw.account, lock }, packs: [{ caseId: randomUUID(), result: {} }],
  invoices: { ...raw.invoices, invoices: [{ id: randomUUID(), number: "DEMO-CUST-000001", issuedOn: "2026-10-31", recipient: "practice-customer@example.invalid", pdfSha256: "b".repeat(64), finalAccountRevisionId: randomUUID(), sourceHash: "c".repeat(64), netPence: 3440000, taxPence: 688000, totalPence: 4128000, balancePence: 0, customerCreditPence: 0, paidPence: 4128000, creditedPence: 0, delivery: "simulated_delivery" }] },
  value: { version: "job-value.v3", environment: "synthetic_demo", jobId, status: "mapped", receipt } };
}
it("shows complete only for the server's complete status and never for an incomplete one", () => {
 const html = renderToStaticMarkup(<ShadowSavedReport report={parseShadowReport(completeReport(), jobId)} />);
 expect(html).toContain("Complete. All nine steps are saved on this job."); expect(html).not.toContain("Incomplete");
 expect(html).not.toMatch(/\bRED\b|verdict|observations|0 of 2|SV-6/i);
 expect(html).toContain("Supporting evidence packs: approved packs are saved with records linked to each extra.");
 expect(html).toContain("<dt>Saved practice payment</dt><dd>Saved practice data: a completed practice payment is matched to each extra.</dd>");
 const incomplete = renderToStaticMarkup(<ShadowSavedReport report={parseShadowReport(report(), jobId)} />);
 expect(incomplete).not.toContain("Complete."); expect(incomplete).toContain("Supporting evidence packs: not all approved yet.");
 expect(incomplete).not.toContain("approved packs are saved with records linked to each extra");
 expect(incomplete).not.toContain("Saved practice payment"); expect(incomplete).not.toContain("a completed practice payment is matched to each extra");
});
it("refuses a complete status that contradicts its own saved parts", () => {
 const good = completeReport();
 for (const patch of [
  { customerApproval: { state: "awaiting_customer", approvals: [] } }, { value: report().value },
  { invoices: { ...good.invoices, invoices: [] } }, { packs: [] }, { packs: undefined },
 ]) expect(() => parseShadowReport({ ...good, ...patch }, jobId)).toThrow();
 expect(() => parseShadowReport({ ...report(), status: "finished" }, jobId)).toThrow();
});

it("accepts CH-9 v2 while preserving the shadow receipt's job and lock checks",async()=>{
 const {mapValueReceiptV2}=await import("@jobguard/core");
 const raw=report(),lock={id:randomUUID(),finalAccountRevisionId:randomUUID(),lockedAt:"2026-10-31T04:00:00Z",digest:"a".repeat(64)};
 const receipt=mapValueReceiptV2({base:{tenantId:randomUUID(),jobId,lockId:lock.id,lockedRevisionId:lock.finalAccountRevisionId,lockedAt:lock.lockedAt,foundComplete:true,checkId:randomUUID(),checkedAt:lock.lockedAt,checked:[],tracked:[],assessments:[]},supplier:{reason:"No supplier derivation",balances:[]},withheld:{reason:"No withheld derivation",balances:[]}});
 const saved={...raw,account:{...raw.account,lock},value:{version:"job-value.v3",environment:"synthetic_demo",jobId,status:"mapped",receipt}};
 expect(parseShadowReport(saved,jobId).value).toEqual(saved.value);
 receipt.sources.base.lockId=randomUUID();expect(()=>parseShadowReport(saved,jobId)).toThrow("Wrong value report");
});
