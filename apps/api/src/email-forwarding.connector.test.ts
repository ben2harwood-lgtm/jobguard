import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { observationV1 } from "@jobguard/core";
import { EmailForwardingConnector, type EmailForwardingPorts } from "./email-forwarding.connector.js";
import { ShadowDetectionWorker, type ShadowWorkerPorts } from "./shadow-detection.worker.js";
const { testTenantContext } = await import(new URL("../../../packages/db/test/tenant-context-test-utils.ts", import.meta.url).href);
const tenantId = "10000000-0000-4000-8000-000000000001", jobId = "10000000-0000-4000-8000-000000000002";
const deliveryId = "10000000-0000-4000-8000-000000000003", foreignId = "10000000-0000-4000-8000-000000000004";
const context = testTenantContext(tenantId);
const configuration = { version: "email-forwarding-config.v1", environment: "synthetic_demo", transport: "fixture", enabled: true };
const request = { version: "email-forwarding-read.v1", jobId, deliveryId };
const text = "Please fit an outside tap.";
const original = { version: "email-forwarding-original.v1", tenantId, jobId, deliveryId, source: "email_forwarding", state: "verified", invalidated: false,
  text, evidence: { id: deliveryId, objectVersionId: "fixture-email-v1", sha256: createHash("sha256").update(text).digest("hex"), serverReceivedAt: "2026-10-28T12:00:00Z" } };
const ports = (): EmailForwardingPorts => ({ authorizeJob: vi.fn(async () => true), readOriginal: vi.fn(async () => structuredClone(original)) });

describe("SV-7B email forwarding DARK contract", () => {
  it("defaults off and refuses every live configuration before calling any port", async () => {
    const p = ports();
    for (const config of [undefined, {}, { ...configuration, enabled: false }, { ...configuration, environment: "pilot_no_charge" },
      { ...configuration, environment: "production_billing" }, { ...configuration, transport: "smtp" }, { ...configuration, endpoint: "https://example.invalid" }]) {
      await expect(new EmailForwardingConnector(p, config).read(context, request)).rejects.toThrow("EMAIL_FORWARDING_DISABLED");
    }
    expect(p.authorizeJob).not.toHaveBeenCalled(); expect(p.readOriginal).not.toHaveBeenCalled();
  });
  it("emits the SV-7A observation contract with exact server evidence; replay is identical", async () => {
    const p = ports(), connector = new EmailForwardingConnector(p, configuration);
    const first = await connector.read(context, request);
    expect(first).toEqual(await connector.read(context, request));
    expect(observationV1.parse(first[0]).evidence).toEqual(original.evidence);
    expect(first[0]?.facts.estimatedValuePence).toBeNull();
    expect(p.authorizeJob).toHaveBeenCalledWith(context, jobId);
    expect(p.readOriginal).toHaveBeenCalledWith(context, jobId, deliveryId);
  });
  it("rejects forged tenant/job authority, bill references, amounts, allocations and evidence in input", async () => {
    const p = ports(), connector = new EmailForwardingConnector(p, configuration);
    for (const extra of [{ tenantId }, { jobId: "bad" }, { from: "fixture@example.invalid" }, { finalAccountId: foreignId },
      { amountPence: 100 }, { allocationId: foreignId }, { evidence: original.evidence }, { approved: true }, { text }]) {
      await expect(connector.read(context, { ...request, ...extra })).rejects.toThrow("INVALID_EMAIL_FORWARDING_INPUT");
    }
    expect(p.authorizeJob).not.toHaveBeenCalled();
  });
  it("refuses missing or unauthorized jobs before reading originals", async () => {
    const p = ports(); vi.mocked(p.authorizeJob).mockResolvedValue(false);
    await expect(new EmailForwardingConnector(p, configuration).read(context, request)).rejects.toThrow("EMAIL_FORWARDING_UNAVAILABLE");
    expect(p.readOriginal).not.toHaveBeenCalled();
  });
  it("fails closed on cross-tenant/job/delivery originals, invalidation, pending bytes and changed replays", async () => {
    const p = ports(), connector = new EmailForwardingConnector(p, configuration);
    for (const change of [{ tenantId: foreignId }, { jobId: foreignId }, { deliveryId: foreignId }, { state: "pending" }, { invalidated: true },
      { text: "Unreviewed content" }, { source: "diary" }, { evidence: { ...original.evidence, objectVersionId: "" } },
      { evidence: { ...original.evidence, sha256: "0".repeat(64) } }, { evidence: { ...original.evidence, serverReceivedAt: "bad" } }]) {
      vi.mocked(p.readOriginal).mockResolvedValue({ ...original, ...change });
      await expect(connector.read(context, request)).rejects.toThrow("EMAIL_FORWARDING_UNAVAILABLE");
    }
    vi.mocked(p.readOriginal).mockResolvedValue(original);
    await expect(connector.read(testTenantContext(foreignId), request)).rejects.toThrow("EMAIL_FORWARDING_UNAVAILABLE");
    vi.mocked(p.readOriginal).mockResolvedValue(null);
    await expect(connector.read(context, request)).rejects.toThrow("EMAIL_FORWARDING_UNAVAILABLE");
  });
  it("redacts adapter failures and cannot return shadow counts or findings", async () => {
    const p = ports(), connector = new EmailForwardingConnector(p, configuration);
    for (const hiddenCount of [0, 5]) {
      vi.mocked(p.readOriginal).mockRejectedValue(new Error(`secret message; shadow count ${hiddenCount}`));
      await expect(connector.read(context, request)).rejects.toMatchObject({ message: "EMAIL_FORWARDING_UNAVAILABLE", code: "EMAIL_FORWARDING_UNAVAILABLE" });
    }
    vi.mocked(p.readOriginal).mockResolvedValue({ ...original, signalCount: 1 });
    await expect(connector.read(context, request)).rejects.toThrow("EMAIL_FORWARDING_UNAVAILABLE");
  });
  it("refuses a valid receipt whose evidence identity differs from the requested delivery", async () => {
    const p = ports();
    vi.mocked(p.readOriginal).mockResolvedValue({ ...original, evidence: { ...original.evidence, id: foreignId } });
    await expect(new EmailForwardingConnector(p, configuration).read(context, request)).rejects.toMatchObject({
      code: "EMAIL_FORWARDING_UNAVAILABLE", message: "EMAIL_FORWARDING_UNAVAILABLE",
    });
  });
  it("feeds only the existing worker; terms refusal prevents source reads and sink writes", async () => {
    const p = ports(), connector = new EmailForwardingConnector(p, configuration);
    const workerPorts: ShadowWorkerPorts = { assertTermsRelation: vi.fn(async () => undefined), hasAcceptedTerms: vi.fn(async () => true),
      read: async c => ({ observations: await connector.read(c, request), captures: [] }),
      propose: vi.fn(async () => ({ proposals: [] })), persist: vi.fn(async () => undefined) };
    const worker = new ShadowDetectionWorker(workerPorts, "synthetic_demo", () => original.evidence.serverReceivedAt);
    const task = { version: "shadow-detection-task.v1", tenantId, jobId };
    await worker.execute(context, task);
    expect(workerPorts.persist).toHaveBeenCalledWith(context, expect.objectContaining({ observations: await connector.read(context, request) }));
    vi.mocked(p.readOriginal).mockClear(); vi.mocked(workerPorts.persist).mockClear();
    vi.mocked(workerPorts.hasAcceptedTerms).mockResolvedValue(false);
    await expect(worker.execute(context, task)).rejects.toThrow("SHADOW_TERMS_NOT_ACCEPTED");
    expect(p.readOriginal).not.toHaveBeenCalled(); expect(workerPorts.persist).not.toHaveBeenCalled();
  });
});
