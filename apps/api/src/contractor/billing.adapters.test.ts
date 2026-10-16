import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { renderBillingExport } from "@jobguard/core";
import type { OutboundAction } from "@jobguard/db";
import { createSyntheticBillingAdapter } from "./billing.adapters.js";
import { parseBillingImportEnvelope } from "./billing.contracts.js";

const id = (n: number) => `20000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function artifact() {
  return renderBillingExport({ version: "billing-export.v1", clientContractId: id(1), lines: [{
    jobId: id(2), extraId: id(3), scopeItemId: id(4), revisionId: id(5), revisionHash: "a".repeat(64),
    approvalBindingId: id(6), approvalSnapshotHash: "b".repeat(64), description: "Fictional item",
    quantity: "1", unit: "item", priceProvenance: "server_sor", approvedNet: { pence: 12000, currency: "GBP" },
  }] });
}
function action(channel: "fake_download" | "fake_sftp" | "fake_api"): OutboundAction {
  const a = artifact();
  return { version: "outbound-action.v1", id: id(7), authorizationId: id(8), adapter: channel,
    providerEffectKey: "fictional-effect-1", actionType: "billing_export", recipient: "billing.invalid",
    contentHash: a.jsonHash, immutableContent: a.json, aggregateRevision: 1, amountPence: 12000,
    currency: "GBP", policyVersion: "synthetic-fixture.v1", authorizationExpiresAt: new Date("2026-10-16T00:00:00Z") };
}

it("E6-02 fake adapters reject non-synthetic server configuration and real destinations", async () => {
  for (const mode of ["production_billing", "pilot_no_charge", undefined]) {
    expect(() => createSyntheticBillingAdapter({ version: "billing-fake-adapter.v1", mode, channel: "fake_api", scenario: "success" })).toThrow();
  }
  const adapter = createSyntheticBillingAdapter({ version: "billing-fake-adapter.v1", mode: "synthetic_demo", channel: "fake_api", scenario: "success" });
  await expect(adapter.deliver({ ...action("fake_api"), recipient: "billing.example.com" })).rejects.toThrow();
  await expect(adapter.deliver({ ...action("fake_api"), adapter: "fake_sftp" })).rejects.toThrow();
  expect(adapter.simulatedEffects).toBe(0);
});

it("E6-01 import contracts reject caller mode/authority fields, invalid JSON and transport flags", () => {
  for (const envelope of [{ version: "billing-import.v1", transport: "api", events: [], mode: "synthetic_demo" },
    { version: "billing-import.v1", transport: "api", events: [], tenantId: id(1) },
    { version: "billing-import.v1", transport: "api", events: [], actorId: id(1) },
    { version: "billing-import.v1", transport: "api", events: ["{invalid"] },
    { version: "billing-import.v1", transport: "live", events: [] }]) {
    expect(() => parseBillingImportEnvelope(envelope)).toThrow();
  }
});

it("E6-11 internal API and CSV envelopes preserve source hashes separately from semantic identity", async () => {
  const { renderBillingCsv } = await import("@jobguard/core");
  const event = { version: "billing-status.v1", source: "fictional-ledger", sourceEventId: "invoice-1", clientContractId: id(1),
    invoiceNumber: "INV-1", factType: "invoiced", effectiveAt: "2026-10-01T00:00:00Z", remittanceReference: null,
    reconciliationId: null, originalEventId: null, amount: { netPence: 12000, vatPence: 2400, grossPence: 14400 },
    composition: { declared: { netPence: 12000, vatPence: 2400, grossPence: 14400 }, lines: [{ externalInvoiceLineId: "order",
      kind: "original_order", existedAt: "2026-10-01T00:00:00Z", netPence: 12000, vatPence: 2400, grossPence: 14400, match: null }] },
    explicit: null, separateInvoice: false };
  const api = parseBillingImportEnvelope({ version: "billing-import.v1", transport: "api", events: [event] });
  const csv = parseBillingImportEnvelope({ version: "billing-import.v1", transport: "csv", csv: renderBillingCsv([event]) });
  expect(api.observations).toEqual(csv.observations);
  expect(api.sourceHash).not.toBe(csv.sourceHash);
});

it.each(["fake_download", "fake_sftp", "fake_api"] as const)("E6-02 E6-24 %s is an in-memory adapter contract only", async channel => {
  const adapter = createSyntheticBillingAdapter({ version: "billing-fake-adapter.v1", mode: "synthetic_demo", channel, scenario: "success" });
  const a = action(channel);
  const first = await adapter.deliver(a);
  expect(first.kind).toBe("succeeded");
  expect(await adapter.deliver(a)).toEqual(first);
  expect(await adapter.reconcile(a.providerEffectKey)).toBe("succeeded");
  expect(adapter.simulatedEffects).toBe(1);
  await expect(adapter.deliver({ ...a, recipient: "different.invalid" })).rejects.toThrow("BILLING_CONFLICT");
});

it("E6-06 fake boundary refuses tampered artifact bindings even with a recalculated hash", async () => {
  const adapter = createSyntheticBillingAdapter({ version: "billing-fake-adapter.v1", mode: "synthetic_demo", channel: "fake_api", scenario: "success" });
  const a = action("fake_api");
  const parsed = JSON.parse(a.immutableContent);
  parsed.lines[0].exportLineId = id(99);
  const text = JSON.stringify(parsed);
  await expect(adapter.deliver({ ...a, immutableContent: text, contentHash: createHash("sha256").update(text).digest("hex") })).rejects.toThrow();
  await expect(adapter.deliver({ ...a, amountPence: 1 })).rejects.toThrow();
  expect(adapter.simulatedEffects).toBe(0);
});

it("E6-24 unknown acceptance reconciles without another simulated effect", async () => {
  const adapter = createSyntheticBillingAdapter({ version: "billing-fake-adapter.v1", mode: "synthetic_demo", channel: "fake_sftp", scenario: "unknown_accepted" });
  const a = action("fake_sftp");
  expect((await adapter.deliver(a)).kind).toBe("outcome_unknown");
  expect((await adapter.deliver(a)).kind).toBe("outcome_unknown");
  expect(adapter.simulatedEffects).toBe(1);
  expect(await adapter.reconcile(a.providerEffectKey)).toBe("succeeded");
  expect((await adapter.deliver(a)).kind).toBe("succeeded");
  expect(adapter.simulatedEffects).toBe(1);
});

it("E6-24 retryable failure, interruption and unknown nonacceptance stay distinct", async () => {
  for (const scenario of ["retryable", "interruption", "unknown_not_accepted", "unknown_unresolved"] as const) {
    const adapter = createSyntheticBillingAdapter({ version: "billing-fake-adapter.v1", mode: "synthetic_demo", channel: "fake_api", scenario });
    const a = action("fake_api");
    expect((await adapter.deliver(a)).kind).toBe(scenario === "retryable" ? "retryable" : "outcome_unknown");
    expect(await adapter.reconcile(a.providerEffectKey)).toBe(scenario === "retryable" || scenario === "unknown_not_accepted" ? "not_found" : "unknown");
    expect(adapter.simulatedEffects).toBe(0);
  }
});
