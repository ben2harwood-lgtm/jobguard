import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { beforeEach, expect, it, vi } from "vitest";
import { ShadowDemoApplication } from "./shadow-demo.application.js";
const ports = vi.hoisted(() => ({ job: vi.fn(), account: vi.fn(), check: vi.fn(), history: vi.fn(), invoices: vi.fn(), value: vi.fn(), packs: vi.fn() }));
vi.mock("./practice-access.js", () => ({ PracticeAccess: class { job = ports.job; } }));
vi.mock("./final-account-lock.application.js", () => ({ FinalAccountLockApplication: class { get = ports.account; } }));
vi.mock("./final-check.application.js", () => ({ FinalCheckApplication: class { get = ports.check; } }));
vi.mock("./recovery-attribution.application.js", () => ({ RecoveryAttributionApplication: class { get = ports.history; } }));
vi.mock("./customer-invoice.application.js", () => ({ CustomerInvoiceApplication: class { get = ports.invoices; } }));
vi.mock("./value/value-v3.application.js", () => ({ ValueV3Application: class { readJob = ports.value; } }));
vi.mock("./evidence-pack.application.js", () => ({ EvidencePackApplication: class { listV3 = ports.packs; } }));
const jobId = randomUUID(), tenantId = randomUUID(), lockId = randomUUID();
const app = () => new ShadowDemoApplication({} as Pool, randomUUID());
beforeEach(() => {
 vi.clearAllMocks(); ports.job.mockResolvedValue({ context: { tenantId } });
 ports.account.mockResolvedValue({ jobId, lock: null, captures: [] });
 ports.invoices.mockResolvedValue({ jobId, invoices: [] });
 ports.value.mockResolvedValue({ status: "incomplete", reason: "producer_bindings_held" });
 ports.check.mockResolvedValue({ state: "completed", lockId, items: [] });
 ports.history.mockResolvedValue({ revisions: [] }); ports.packs.mockResolvedValue({ status: "held" });
});
it("pre-lock reports do not call any reveal, history or pack port, even when those ports fail", async () => {
 ports.check.mockRejectedValue(new Error("hidden")); ports.history.mockRejectedValue(new Error("hidden"));
 const first = await app().read(jobId), second = await app().read(jobId);
 expect(first).toEqual(second); expect(first).not.toHaveProperty("finalCheck"); expect(first).not.toHaveProperty("assessments");
 for (const port of [ports.check, ports.history, ports.packs]) expect(port).not.toHaveBeenCalled();
 expect(first).toMatchObject({ status: "incomplete", customerApproval: "not_ready_yet", realExternalActions: 0 });
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
