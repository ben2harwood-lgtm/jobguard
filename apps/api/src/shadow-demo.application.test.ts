import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { beforeEach, expect, it, vi } from "vitest";
import { mapValueReceipt } from "@jobguard/core";
import { heldJobValueV3 } from "./value/value-v3.application.js";
import { ShadowDemoApplication } from "./shadow-demo.application.js";
const ports = vi.hoisted(() => ({ approvals: vi.fn(), job: vi.fn(), account: vi.fn(), check: vi.fn(), history: vi.fn(), invoices: vi.fn(), value: vi.fn(), packs: vi.fn() }));
vi.mock("./practice-access.js", () => ({ PracticeAccess: class { job = ports.job; } }));
vi.mock("./final-account-lock.application.js", () => ({ FinalAccountLockApplication: class { get = ports.account; } }));
vi.mock("./final-check.application.js", () => ({ FinalCheckApplication: class { get = ports.check; } }));
vi.mock("./recovery-attribution.application.js", () => ({ RecoveryAttributionApplication: class { get = ports.history; } }));
vi.mock("./customer-invoice.application.js", () => ({ CustomerInvoiceApplication: class { get = ports.invoices; } }));
vi.mock("@jobguard/db", () => ({
 ShadowDemoApprovalReader: class { read = ports.approvals; },
 ValueV3Reader: class { readJob = ports.value; },
}));
vi.mock("./evidence-pack.application.js", () => ({ EvidencePackApplication: class { listV3 = ports.packs; } }));
const jobId = randomUUID(), tenantId = randomUUID(), lockId = randomUUID();
const app = () => new ShadowDemoApplication({} as Pool, randomUUID());
beforeEach(() => {
 vi.clearAllMocks(); ports.approvals.mockResolvedValue({ complete: false, approvals: [] }); ports.job.mockResolvedValue({ context: { tenantId } });
 ports.account.mockResolvedValue({ jobId, lock: null, captures: [] });
 ports.invoices.mockResolvedValue({ jobId, invoices: [] });
 ports.value.mockResolvedValue(heldJobValueV3(jobId));
 ports.check.mockResolvedValue({ state: "completed", lockId, items: [] });
 ports.history.mockResolvedValue({ revisions: [] }); ports.packs.mockResolvedValue({ status: "held" });
});
it("pre-lock reports do not call any reveal, history or pack port, even when those ports fail", async () => {
 ports.check.mockRejectedValue(new Error("hidden")); ports.history.mockRejectedValue(new Error("hidden"));
 ports.value.mockRejectedValue(new Error("hidden"));
 const first = await app().read(jobId), second = await app().read(jobId);
 expect(first).toEqual(second); expect(first.value).toEqual(heldJobValueV3(jobId)); expect(first).not.toHaveProperty("finalCheck"); expect(first).not.toHaveProperty("assessments");
 for (const port of [ports.approvals, ports.check, ports.history, ports.packs, ports.value]) expect(port).not.toHaveBeenCalled();
 expect(first).toMatchObject({ status: "incomplete", version: "shadow-demo-report.v2", customerApproval: { state: "not_ready_yet", approvals: [] }, realExternalActions: 0 });
});
it.each(["UNAUTHENTICATED", "NOT_FOUND", "SYNTHETIC_MODE_REQUIRED"])("%s denies before source reads, including repeated reads", async code => {
 ports.job.mockRejectedValue(new Error(code));
 for (let i = 0; i < 2; i++) await expect(app().read(jobId)).rejects.toThrow(code);
 for (const port of [ports.account, ports.check, ports.history, ports.invoices, ports.packs, ports.value]) expect(port).not.toHaveBeenCalled();
});
it("rejects client amounts, allocation, lock and completion overrides after authority", async () => {
 for (const raw of [{ fee: 8000 }, { lockId }, { tenantId }, { approved: true }, { Q: 80000 }, { allocation: 80000 }]) await expect(app().read(jobId, raw)).rejects.toThrow();
 expect(ports.account).not.toHaveBeenCalled();
});
it.each(["pending", "failed"])("%s checks cannot read attribution or pack data", async state => {
 ports.account.mockResolvedValue({ jobId, lock: { id: lockId }, captures: [] }); ports.check.mockResolvedValue({ state, lockId, items: [] });
 expect(await app().read(jobId)).not.toHaveProperty("assessments"); expect(ports.history).not.toHaveBeenCalled(); expect(ports.packs).not.toHaveBeenCalled();
});
it.each(["completed", "pending", "failed"])("rejects %s checks for a different locked bill before returning or reading downstream sources", async state => {
 ports.account.mockResolvedValue({ jobId, lock: { id: lockId }, captures: [] });
 ports.check.mockResolvedValue({ state, lockId: randomUUID(), items: [] });
 await expect(app().read(jobId)).rejects.toThrow("SHADOW_DEMO_SOURCE_REJECTED");
 expect(ports.history).not.toHaveBeenCalled(); expect(ports.packs).not.toHaveBeenCalled();
});
async function assessment() {
 const { attributionDocumentFixture } = await import(new URL("../../../packages/db/test/recovery-attribution-fixture.ts", import.meta.url).href);
 const a = attributionDocumentFixture();
 return JSON.parse(JSON.stringify(a).replaceAll(a.tenantId, tenantId).replaceAll(a.jobId, jobId).replaceAll(a.lockId, lockId)) as ReturnType<typeof attributionDocumentFixture>;
}
it("deduplicates repeated assessments and preserves the producer's exact £800/£80/£720 illustration", async () => {
 const a = await assessment(); ports.account.mockResolvedValue({ jobId, lock: { id: lockId }, captures: [] }); ports.history.mockResolvedValue({ revisions: [a, a] });
 const result = await app().read(jobId); expect(result).toHaveProperty("assessments");
 if (!("assessments" in result)) throw new Error("Missing assessments");
 expect(result.assessments).toHaveLength(1); expect(result.assessments[0]?.illustrationAsAssessed).toMatchObject({ qualification: "unreviewed", display: { recovered: "£800.00", fee: "£80.00", yoursBeforeVatAndTax: "£720.00" } });
 expect(ports.packs).toHaveBeenCalledTimes(1); expect(ports.packs).toHaveBeenCalledWith(expect.any(String), a.caseId);
 expect(await app().read(jobId)).toEqual(result);
});
it("a later excluded reversal supersedes the old positive illustration, regardless of input ordering", async () => {
 const a = await assessment(), reversed = { ...a, assessmentId: randomUUID(), revision: a.revision + 1, previousAssessmentId: a.assessmentId, assessmentOutcome: "excluded", reasonCodes: ["invalid_evidence"] };
 reversed.facts = structuredClone(a.facts); reversed.facts.revisionId = reversed.assessmentId; reversed.facts.facts.evidence_received_before_lock!.holds = false;
 ports.account.mockResolvedValue({ jobId, lock: { id: lockId }, captures: [] }); ports.history.mockResolvedValue({ revisions: [reversed, a, reversed] });
 const result = await app().read(jobId); if (!("assessments" in result)) throw new Error("Missing assessments");
 expect(result.assessments).toHaveLength(1); expect(result.assessments[0]?.illustrationAsAssessed.display.fee).toBe("£0.00");
});
it("rejects foreign tenant, job and locked-bill attribution references", async () => {
 ports.account.mockResolvedValue({ jobId, lock: { id: lockId }, captures: [] }); const a = await assessment();
 for (const patch of [{ tenantId: randomUUID() }, { jobId: randomUUID() }, { lockId: randomUUID() }]) {
  ports.history.mockResolvedValue({ revisions: [{ ...a, ...patch }] }); await expect(app().read(jobId)).rejects.toThrow();
 }
 expect(ports.packs).not.toHaveBeenCalled();
});

it("binds the CH-9 reader after lock and returns its full mapped £3,600 / £0 and £800 / £80 / £720 receipt", async () => {
 const a = await assessment();
 // The source mapper requires an ordered revision chain beginning at one.
 a.revision = 1; a.previousAssessmentId = null;
 const revisionId = randomUUID();
 const receipt = mapValueReceipt({ tenantId, jobId, lockId, lockedRevisionId: revisionId,
  lockedAt: "2026-10-01T00:00:00Z", foundComplete: true, checkId: randomUUID(),
  checkedAt: "2026-10-02T00:00:00Z", checked: [],
  tracked: [{ id: randomUUID(), sourceId: randomUUID(), revisionId, invoiceId: randomUUID(),
   checkId: randomUUID(), netPence: 360000, at: "2026-10-03T00:00:00Z" }],
  assessments: [{ document: a, current: true }],
 });
 const value = { version: "job-value.v3", environment: "synthetic_demo", jobId, status: "mapped", receipt };
 ports.account.mockResolvedValue({ jobId, lock: { id: lockId }, captures: [] });
 ports.value.mockResolvedValue(value);
 const report = await app().read(jobId);
 expect(ports.value).toHaveBeenCalledWith(jobId);
 expect(report.value).toEqual(value);
 expect(report.value).toMatchObject({ receipt: { tracked: { pence: 360000 }, trackedFee: { pence: 0 },
  found: { recovered: { pence: 80000 }, fee: { pence: 8000 }, yoursBeforeVatAndTax: { pence: 72000 } } } });
 for (const sources of [{ tenantId: randomUUID() }, { jobId: randomUUID() }, { lockId: randomUUID() }]) {
  ports.value.mockResolvedValue({ ...value, receipt: { ...receipt, sources: { ...receipt.sources, ...sources } } });
  await expect(app().read(jobId)).rejects.toThrow();
 }
});
it("builder-attested approval cannot become customer portal approval", async () => {
 ports.account.mockResolvedValue({ jobId, lock: { id: lockId }, captures: [] });
 ports.check.mockResolvedValue({ state: "completed", lockId,
  items: [{ variationId: randomUUID(), status: "approved", method: "builder_attestation" }] });
 expect((await app().read(jobId)).customerApproval).toEqual({ state: "awaiting_customer", approvals: [] });
});

it("reads exact portal entries and requires all catches to be customer-approved", async () => {
 ports.account.mockResolvedValue({ jobId, lock: { id: lockId }, captures: [] });
 ports.check.mockResolvedValue({ state: "completed", lockId, items: [{ variationId: randomUUID() }] });
 expect((await app().read(jobId)).customerApproval).toEqual({ state: "awaiting_customer", approvals: [] });
 const approvals = [500, 300].map(() => ({ variationId: randomUUID(), approvedAt: "2026-10-31T08:00:00.000Z", method: "customer_portal" }));
 ports.approvals.mockResolvedValue({ complete: true, approvals });
 expect((await app().read(jobId)).customerApproval).toEqual({ state: "approved", approvals });
 ports.approvals.mockResolvedValue({ complete: false, approvals: approvals.slice(0, 1) });
 expect((await app().read(jobId)).customerApproval.state).toBe("awaiting_customer");
});
it("foreign tenant authorization exposes no approval entries", async () => {
 ports.job.mockRejectedValue(new Error("NOT_FOUND"));
 await expect(app().read(jobId)).rejects.toThrow("NOT_FOUND");
 expect(ports.approvals).not.toHaveBeenCalled();
});
