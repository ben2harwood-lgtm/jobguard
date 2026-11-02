import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { parseObservation } from "@jobguard/core";
import { emitFakeAccountingObservations, readAccountingConnector } from "./accounting-observation-connector.js";
import { ShadowDetectionWorker, type ShadowWorkerPorts } from "./shadow-detection.worker.js";

const { testTenantContext } = await import(new URL("../../../packages/db/test/tenant-context-test-utils.ts", import.meta.url).href);
const tenantId = "10000000-0000-4000-8000-000000000001";
const jobId = "10000000-0000-4000-8000-000000000002";
const otherId = "10000000-0000-4000-8000-000000000003";
const scope = { tenantId, jobId };
const at = "2026-10-30T12:00:00Z";
const text = "Fictional supplier document: outside tap.";
const fixtureObservation = () => ({
  version: "observation.v1", tenantId, jobId, kind: "supplier_line",
  evidence: { id: otherId, objectVersionId: "fictional-accounting-v1", sha256: createHash("sha256").update(text).digest("hex"), serverReceivedAt: at },
  text, citations: [{ start: 0, end: text.length, quote: text }],
  facts: { workReference: "outside-tap", scopeArea: "job", description: "outside tap", status: "unknown", estimatedValuePence: null,
    safetyImplication: false, customerClearlyRequested: false, needsPriorWrittenAgreement: false, significantWork: null,
    activeDispute: false, silenceMateriallyWorsensDispute: false, disclosureDuty: false },
});
const batch = (observations: unknown[] = [fixtureObservation()]) => ({
  version: "fake-accounting-observations.v1", environment: "synthetic_demo", observations,
});

describe("SV-7B accounting fake contract (RED hidden data)", () => {
  it.each(["tenantId", "jobId"])("fails closed on %s mismatch, including after a valid object", field => {
    expect(() => emitFakeAccountingObservations(scope, batch([fixtureObservation(), { ...fixtureObservation(), [field]: otherId }])))
      .toThrow("ACCOUNTING_BINDING_MISMATCH");
  });

  it("emits the shared SV-7A contract and freezes its copy without changing input", () => {
    const raw = batch();
    const result = emitFakeAccountingObservations(scope, raw);
    expect(result).toEqual([parseObservation(fixtureObservation())]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result[0]!.evidence)).toBe(true);
    expect(Object.isFrozen(result[0]!.facts)).toBe(true);
    expect(Object.isFrozen(raw.observations[0])).toBe(false);
  });

  it("one immutable evidence object/version emits once; a new version stays distinct", () => {
    const o = fixtureObservation();
    expect(emitFakeAccountingObservations(scope, batch([o, structuredClone(o)]))).toHaveLength(1);
    expect(emitFakeAccountingObservations(scope, batch([o, { ...o, evidence: { ...o.evidence, objectVersionId: "fictional-accounting-v2" } }]))).toHaveLength(2);
  });

  it("refuses changed facts or receive time under the same object version", () => {
    const o = fixtureObservation();
    for (const changed of [{ ...o, facts: { ...o.facts, status: "completed" } },
      { ...o, evidence: { ...o.evidence, serverReceivedAt: "2026-10-30T13:00:00Z" } }])
      expect(() => emitFakeAccountingObservations(scope, batch([o, changed]))).toThrow("ACCOUNTING_VERSION_CONFLICT");
  });

  it("rejects invalid hashes, citations, source kinds and missing immutable evidence", () => {
    const o = fixtureObservation();
    for (const changed of [{ ...o, evidence: { ...o.evidence, sha256: "a".repeat(64) } },
      { ...o, citations: [{ start: 0, end: 4, quote: "fake" }] }, { ...o, kind: "note_or_voice" },
      { ...o, evidence: { ...o.evidence, objectVersionId: "" } }, { ...o, fee: 100 },
      { ...o, evidence: { ...o.evidence, serverReceivedAt: undefined } }])
      expect(() => emitFakeAccountingObservations(scope, batch([changed]))).toThrow("INVALID_ACCOUNTING_FIXTURE");
  });

  it("accepts only the explicit versioned synthetic envelope and scope", () => {
    for (const raw of [null, {}, { ...batch(), version: "v2" }, { ...batch(), environment: "production_billing" },
      { ...batch(), enabled: true }, { ...batch(), observations: Array(101).fill(fixtureObservation()) }])
      expect(() => emitFakeAccountingObservations(scope, raw)).toThrow("INVALID_ACCOUNTING_FIXTURE");
    expect(() => emitFakeAccountingObservations({ ...scope, approved: true }, batch())).toThrow("INVALID_ACCOUNTING_FIXTURE");
    expect(emitFakeAccountingObservations(scope, batch([]))).toEqual([]);
  });

  it.each([undefined, {}, { enabled: true }, { G1: true, D04: "approved", D12: "approved" }, batch()])(
    "stays server-disabled without independently installed approval evidence: %j", raw => {
      expect(() => readAccountingConnector(raw)).toThrow("ACCOUNTING_CONNECTOR_DISABLED");
    },
  );

  it("touches no sink during emission; only the existing worker calls persistence after its gates", async () => {
    const ports: ShadowWorkerPorts = {
      assertTermsRelation: vi.fn(async () => undefined), hasAcceptedTerms: vi.fn(async () => false),
      read: vi.fn(async () => ({ observations: emitFakeAccountingObservations(scope, batch([fixtureObservation(), fixtureObservation()])), captures: [] })),
      propose: vi.fn(async () => ({ proposals: [] })), persist: vi.fn(async () => undefined),
    };
    const worker = new ShadowDetectionWorker(ports, "synthetic_demo", () => at);
    const context = testTenantContext(tenantId), task = { version: "shadow-detection-task.v1", ...scope };
    emitFakeAccountingObservations(scope, batch());
    expect(ports.persist).not.toHaveBeenCalled();
    await expect(worker.execute(context, task)).rejects.toThrow("SHADOW_TERMS_NOT_ACCEPTED");
    expect(ports.read).not.toHaveBeenCalled();
    expect(ports.persist).not.toHaveBeenCalled();
    vi.mocked(ports.hasAcceptedTerms).mockResolvedValue(true);
    await worker.execute(context, task);
    expect(ports.propose).toHaveBeenCalledTimes(1);
    expect(ports.persist).toHaveBeenCalledExactlyOnceWith(context, expect.objectContaining({ observations: [parseObservation(fixtureObservation())] }));
  });
});
