import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import ShadowJourneyPage from "./page";
import { mapValueReceipt } from "@jobguard/core";
import { practiceFeedResponseV1 } from "@jobguard/api/practice-feed-contracts";
import { randomUUID } from "node:crypto";
import { extractCaptureFixture } from "@jobguard/ai";
import { ShadowJourney, ShadowSavedReport, SavedMatchedReceipts } from "./journey";
import { parseShadowReport, shadowCaptureText, shadowSteps } from "./journey-model";
vi.stubGlobal("React", React);
const jobId = randomUUID();
function report() { return {
 version: "shadow-demo-report.v2", environment: "synthetic_demo", jobId, status: "incomplete", realExternalActions: 0, customerApproval: { state: "not_ready_yet", approvals: [] },
 account: { jobId, account: null, captures: [], lock: null },
 invoices: { version: 1, environment: "synthetic_demo", jobId, invoices: [] },
 value: { version: "job-value.v3", environment: "synthetic_demo", jobId, status: "incomplete", reason: "producer_bindings_held", producers: { sources: "HELD", derivation: "HELD", subscription: "HELD", postedMoney: "HELD" }, asOf: null, receipt: null },
}; }
it("has nine guided steps, source-only £30,000 input and no saved success before a read", async () => {
 expect(shadowSteps).toHaveLength(9);
 const proposal = await extractCaptureFixture(randomUUID(), shadowCaptureText, "deterministic-local-v1");
 expect(proposal.lines).toHaveLength(5);
 expect(proposal.lines.reduce((total, line) => total + (line.unitPricePence.value ?? 0), 0)).toBe(3000000);
 const html = renderToStaticMarkup(<ShadowJourney />);
 for (const text of ["£3,200", "£400", "£500", "£300", "£34,400", "£41,280", "Q £800", "£80", "£720", "£3,600", "£0"]) expect(html).toContain(text);
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
 for (const extra of [{ jobId: randomUUID() }, { finalCheck: { state: "unlocked", items: [] } }, { assessments: [] }, { packs: [] }, { hiddenCount: 0 }, { completed: true }, { realExternalActions: 1 }, { version: "shadow-demo-report.v1" }]) expect(() => parseShadowReport({ ...raw, ...extra }, jobId)).toThrow();
 expect(() => parseShadowReport({ ...raw, account: { ...raw.account, jobId: randomUUID() } }, jobId)).toThrow();
 expect(() => parseShadowReport({ ...raw, invoices: { ...raw.invoices, jobId: randomUUID() } }, jobId)).toThrow();
});
it("rejects a reveal from a different locked bill", () => {
 const raw = report();
 expect(() => parseShadowReport({ ...raw, account: { ...raw.account, lock: { id: randomUUID(), finalAccountRevisionId: randomUUID(), lockedAt: "2026-10-29T00:00:00Z", digest: "a".repeat(64) } }, finalCheck: { state: "completed", lockId: randomUUID(), items: [] } }, jobId)).toThrow("Wrong lock report");
});

function lockedReport() {
 const raw = report();
 return { ...raw, account: { ...raw.account, lock: { id: randomUUID(), finalAccountRevisionId: randomUUID(), lockedAt: "2026-10-01T00:00:00Z", digest: "a".repeat(64) } } };
}
function savedInvoice(revisionId: string, balancePence: number) {
 return { id: randomUUID(), number: "DEMO-1", issuedOn: "2026-10-02", recipient: "customer@example.invalid", pdfSha256: "a".repeat(64), finalAccountRevisionId: revisionId, sourceHash: "b".repeat(64), netPence: 3440000, taxPence: 688000, totalPence: 4128000, balancePence, customerCreditPence: 0, delivery: "simulated_delivery" };
}
it("renders partial customer approvals and an unpaid invoice without inventing value or settlement", () => {
 const raw = lockedReport(), variationId = randomUUID();
 const invoice = savedInvoice(raw.account.lock.finalAccountRevisionId, 4128000);
 const parsed = parseShadowReport({ ...raw, customerApproval: { state: "awaiting_customer", approvals: [{ variationId, approvedAt: "2026-10-02T00:00:00Z", method: "customer_portal" }] }, invoices: { ...raw.invoices, invoices: [invoice] } }, jobId);
 const html = renderToStaticMarkup(<ShadowSavedReport report={parsed} />);
 for (const text of ["Awaiting customer approval", variationId, "customer portal", "£34,400.00 net", "£41,280.00 gross", "balance £41,280.00", "Matched receipt evidence unavailable", "producer bindings held"]) expect(html).toContain(text);
 expect(html).not.toContain('data-testid="found-recovered-net"');
 expect(html).not.toContain("Customer approval recorded.");
});
it("renders a complete mapped report using the shared receipt and source-specific screen links", () => {
 const raw = lockedReport(), caseId = randomUUID();
 const receipt = mapValueReceipt({ tenantId: randomUUID(), jobId, lockId: raw.account.lock.id, lockedRevisionId: raw.account.lock.finalAccountRevisionId, lockedAt: raw.account.lock.lockedAt, foundComplete: true, checkId: randomUUID(), checkedAt: "2026-10-02T00:00:00Z", checked: [], tracked: [{ id: randomUUID(), revisionId: raw.account.lock.finalAccountRevisionId, sourceId: randomUUID(), netPence: 360000, invoiceId: randomUUID(), checkId: randomUUID(), at: "2026-10-02T00:00:00Z" }], assessments: [] });
 // Synthetic presentation fixture: amount derivation is covered by the shared mapper's tests.
 receipt.found = { ...receipt.found, recovered: { pence: 80000, currency: "GBP" }, fee: { pence: 8000, currency: "GBP" }, yoursBeforeVatAndTax: { pence: 72000, currency: "GBP" } };
 const parsed = parseShadowReport({ ...raw, finalCheck: { state: "completed", lockId: raw.account.lock.id, items: [] }, invoices: { ...raw.invoices, invoices: [savedInvoice(raw.account.lock.finalAccountRevisionId, 0)] }, customerApproval: { state: "approved", approvals: [randomUUID(), randomUUID()].map(variationId => ({ variationId, approvedAt: "2026-10-02T00:00:00Z", method: "customer_portal" })) }, packs: [{ caseId, result: { packs: [] } }], value: { version: "job-value.v3", environment: "synthetic_demo", jobId, status: "mapped", receipt } }, jobId);
 const html = renderToStaticMarkup(<ShadowSavedReport report={parsed} />);
 for (const [testId, amount] of [["found-recovered-net", "£800.00"], ["found-success-fee", "£80.00"], ["found-yours-before-tax", "£720.00"], ["tracked-captured-net", "£3,600.00"], ["tracked-fee", "£0.00"]]) expect(html).toContain(`data-testid="${testId}">${amount}`);
 expect(html).toContain("£34,400.00 net / £41,280.00 gross · balance £0.00");
 expect(html).toContain("Customer approval recorded."); expect(html.match(/customer portal/g)).toHaveLength(2);
 expect(html).toContain(`jobId=${jobId}&amp;screen=pack&amp;caseId=${caseId}`);
 expect(html).toContain(`jobId=${jobId}&amp;screen=payment-fees`);
 expect(html).toContain("Illustration — proposed policy; principal only");
 expect(html).not.toMatch(/saved you|You finished|producer bindings held/iu);
 for (const value of [{ ...parsed.value, jobId: randomUUID() }, { ...parsed.value, receipt: { ...receipt, sources: { ...receipt.sources, jobId: randomUUID() } } }, { ...parsed.value, receipt: { ...receipt, sources: { ...receipt.sources, lockId: randomUUID() } } }]) expect(() => parseShadowReport({ ...parsed, value }, jobId)).toThrow();
 expect(() => parseShadowReport({ ...parsed, account: { ...parsed.account, lock: null } }, jobId)).toThrow();
});
it("shows a matched receipt only for the report job and invoice, and preserves reversal state", () => {
 const invoiceId = randomUUID(), paymentId = randomUUID();
 const feed = practiceFeedResponseV1.parse({ version: "practice-feed-view.v1", environment: "synthetic_demo", realExternalActions: 0, jobId, accountId: null, feedState: "not_connected", consent: null, revision: 0, catalogue: [], movementCount: 0, movements: [], receipts: [{ paymentId, invoiceId, paidOn: "2026-10-02", reference: "J3 payment", amountPence: 4128000, currency: "GBP", reversed: false, assessment: { status: "qualifies", reason: "matched", canMatch: false, candidateMovementKey: null, matchedMovementKey: "receipt-41280" } }], allocatedEligibleNetPence: 0, eventCount: 0, nextCursor: null });
 const render = () => renderToStaticMarkup(<SavedMatchedReceipts jobId={jobId} invoiceId={invoiceId} feed={feed} />);
 expect(render()).toContain("Matched settled practice movement"); expect(render()).toContain(paymentId); expect(render()).toContain("£41,280.00");
 feed.receipts[0]!.assessment.status = "attested_only"; expect(render()).toContain("Settlement not verified"); expect(render()).not.toContain("Matched settled");
 feed.receipts[0]!.reversed = true; expect(render()).toContain("Reversed"); expect(render()).not.toContain("Matched settled");
 feed.receipts[0]!.invoiceId = randomUUID(); expect(render()).not.toContain(paymentId);
 feed.jobId = randomUUID(); expect(render()).not.toContain(paymentId);
});

it("opens the existing pack and payment-fee screens with a report return link", async () => {
 const caseId = randomUUID();
 const pack = renderToStaticMarkup(await ShadowJourneyPage({ searchParams: Promise.resolve({ jobId, caseId, screen: "pack" }) }));
 expect(pack).toContain("Lock and reveal evidence pack"); expect(pack).toContain(`?jobId=${jobId}`);
 const payment = renderToStaticMarkup(await ShadowJourneyPage({ searchParams: Promise.resolve({ jobId, screen: "payment-fees" }) }));
 expect(payment).toContain("Success fee on your payment");
 const invalid = renderToStaticMarkup(await ShadowJourneyPage({ searchParams: Promise.resolve({ jobId, caseId: "invalid", screen: "pack" }) }));
 expect(invalid).toContain("Final Check £30,000 journey"); expect(invalid).not.toContain("Lock and reveal evidence pack");
});
