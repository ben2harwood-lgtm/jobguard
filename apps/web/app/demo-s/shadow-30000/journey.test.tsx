import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { mapValueReceipt } from "@jobguard/core";
import { extractCaptureFixture } from "@jobguard/ai";
import { ShadowJourney, ShadowSavedReport } from "./journey";
import { parseShadowReport, shadowCaptureText, shadowSteps } from "./journey-model";
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
 expect(shadowSteps).toHaveLength(9);
 const proposal = await extractCaptureFixture(randomUUID(), shadowCaptureText, "deterministic-local-v1");
 expect(proposal.lines).toHaveLength(5);
 expect(proposal.lines.reduce((total, line) => total + (line.unitPricePence.value ?? 0), 0)).toBe(3000000);
 const html = renderToStaticMarkup(<ShadowJourney />);
 for (const text of ["£3,200", "£400", "£500", "£300", "£34,400", "£41,280", "Q £800", "£80", "£720", "£3,600", "£0", "only saved customer responses count as approval"]) expect(html).toContain(text);
 expect(html).not.toContain("Saved job evidence"); expect(html).not.toContain("You finished");
});
it("reports every capture state fee-free without implying customer approval or verified payment", () => {
 const raw = report();
 const parsed = parseShadowReport({ ...raw, account: { ...raw.account, captures: ["draft", "priced", "approved", "rejected", "withdrawn"].map((state, i) => ({ id: randomUUID(), state, description: `Fictional capture ${i}`, origin: i === 0 ? "final_review" : "builder_logged", netPence: i === 0 ? 40000 : 320000 })) } }, jobId);
 const html = renderToStaticMarkup(<ShadowSavedReport report={parsed} />);
 expect(html.match(/recovery fee £0/gu)).toHaveLength(5); expect(html).toContain("No invoice issued"); expect(html).toContain("MON-5");
 expect(html).toContain("CH-8"); expect(html).toContain("CH-9"); expect(html).not.toContain("SV-6 historical assessments");
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
 expect(html).toContain(state === "not_ready_yet" ? "Not ready yet (MON-5)" : state === "awaiting_customer" ? "Awaiting customer" : "Approved through the customer portal");
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
 expect(html).toContain("CH-9 value report: mapped; source-linked receipt saved");
 expect(html).not.toContain("CH-9 value report: mapped; producer bindings held");
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
