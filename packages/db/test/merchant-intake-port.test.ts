import { createHash, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { supplierFixtures } from "@jobguard/core";
import { FakeMerchantIntakePort, MAX_MERCHANT_ATTACHMENT_BYTES } from "../src/merchant-intake-port.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import type { MerchantOrder } from "../src/purchase-order-action.js";

afterEach(() => vi.unstubAllEnvs());
function setup(state: "open" | "locked" | "superseded" | "cancelled" = "open") {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  const context = testTenantContext(randomUUID());
  const scope = { jobId: randomUUID() };
  const order: MerchantOrder = { version: "merchant-order.v1", environment: "synthetic_demo", tenantId: context.tenantId, ...scope,
    draftId: randomUUID(), revisionId: randomUUID(), revision: 1, merchantId: randomUUID(),
    recipient: "orders@merchant.invalid", deliveryDate: "2030-01-01", line: { requirementId: randomUUID(), skuId: randomUUID(),
      quantity: "10", unit: "each", unitPricePence: 2500, rateId: randomUUID(), rateVersion: 1, agreedPricePence: 2500,
      rateUnit: "each", packQuantity: "1", taxBasis: "net", currency: "GBP" } };
  const binding = { ...scope, alias: "intake@builder.invalid", sender: "invoices@merchant.invalid" };
  const port = new FakeMerchantIntakePort(context, [binding], [{ order, state }]);
  const intake = (fixtureId = "invoice") => ({ version: "dark-merchant-intake.v1", commandId: randomUUID(),
    idempotencyKey: randomUUID(), channel: "upload", fixtureId });
  const receive = (fixtureId = "invoice") => port.receive(context, scope, intake(fixtureId));
  const receipt = (documentId: string) => ({ version: "dark-grn.v1", commandId: randomUUID(), idempotencyKey: randomUUID(),
    revisionId: order.revisionId, requirementId: order.line.requirementId, documentId, accepted: "6", rejected: "1", expectedRevision: 0 });
  return { context, scope, order, binding, port, intake, receive, receipt };
}

describe("M2-2 dark merchant intake port", () => {
  it.each(["", "production", "pilot_no_charge"])("refuses every entry point outside synthetic mode: %s", environment => {
    const f = setup(); const input = f.intake();
    vi.stubEnv("JOBGUARD_ENV", environment);
    expect(() => f.port.receive(f.context, f.scope, input)).toThrow("SYNTHETIC_MODE_REQUIRED");
    expect(() => f.port.document(f.context, f.scope, "unknown")).toThrow("SYNTHETIC_MODE_REQUIRED");
    expect(() => f.port.original(f.context, f.scope, "unknown")).toThrow("SYNTHETIC_MODE_REQUIRED");
    expect(() => f.port.captureReceipt(f.context, f.scope, {})).toThrow("SYNTHETIC_MODE_REQUIRED");
    expect(() => new FakeMerchantIntakePort(f.context, [], [])).toThrow("SYNTHETIC_MODE_REQUIRED");
  });
  it("rejects tenant IDs in scope, binding, intake and receipt bodies before mutation", () => {
    const f = setup(), tenantId = randomUUID();
    const delivery = f.receive("delivery"), receipt = f.receipt(delivery.documentId!);
    expect(() => new FakeMerchantIntakePort(f.context, [{ ...f.binding, tenantId }], []))
      .toThrow("INVALID_INTAKE");
    expect(() => f.port.receive(f.context, { ...f.scope, tenantId }, f.intake())).toThrow("INVALID_INTAKE");
    expect(() => f.port.document(f.context, { ...f.scope, tenantId }, delivery.documentId!)).toThrow("INVALID_INTAKE");
    expect(() => f.port.original(f.context, { ...f.scope, tenantId }, delivery.documentId!)).toThrow("INVALID_INTAKE");
    expect(() => f.port.captureReceipt(f.context, { ...f.scope, tenantId }, receipt)).toThrow("INVALID_INTAKE");
    expect(() => f.port.receive(f.context, f.scope, { ...f.intake(), tenantId })).toThrow("INVALID_INTAKE");
    expect(() => f.port.captureReceipt(f.context, f.scope, { ...receipt, tenantId })).toThrow("INVALID_INTAKE");
    expect(f.port.captureReceipt(f.context, f.scope, receipt).revision).toBe(1);
  });
  it("routes only one exact server-owned tenant/job/alias/sender binding", () => {
    const f = setup();
    const input = { ...f.intake(), channel: "inbound_alias", alias: f.binding.alias, sender: f.binding.sender };
    expect(f.port.receive(f.context, f.scope, input).status).toBe("verified");
    for (const change of [{ alias: "unknown@builder.invalid" }, { sender: "unknown@merchant.invalid" }, { alias: undefined }, { sender: undefined }]) {
      expect(f.port.receive(f.context, f.scope, { ...input, ...change, commandId: randomUUID(), idempotencyKey: randomUUID() }))
        .toEqual({ status: "held", documentId: null, reason: "routing_review" });
    }
    for (const [context, scope] of [[testTenantContext(randomUUID()), f.scope], [f.context, { jobId: randomUUID() }]] as const) {
      expect(f.port.receive(context, scope, { ...input, commandId: randomUUID(), idempotencyKey: randomUUID() }))
        .toEqual({ status: "held", documentId: null, reason: "routing_review" });
    }
    const ambiguous = new FakeMerchantIntakePort(f.context, [f.binding, f.binding], []);
    expect(ambiguous.receive(f.context, f.scope, input).status).toBe("held");
  });
  it("replays commands and keys exactly, rejects changed inputs and prevents forward/re-upload debt", () => {
    const f = setup(), input = f.intake();
    const first = f.port.receive(f.context, f.scope, input);
    expect(f.port.receive(f.context, f.scope, input)).toEqual(first);
    expect(() => f.port.receive(f.context, f.scope, { ...input, fixtureId: "changed" })).toThrow("IDEMPOTENCY_CONFLICT");
    expect(() => f.port.receive(f.context, f.scope, { ...input, commandId: randomUUID() })).toThrow("IDEMPOTENCY_CONFLICT");
    expect(() => f.port.receive(f.context, f.scope, { ...input, idempotencyKey: randomUUID() })).toThrow("IDEMPOTENCY_CONFLICT");
    expect(f.receive()).toMatchObject({ status: "duplicate", documentId: first.documentId });
    expect(f.port.receive(f.context, f.scope, { ...f.intake("forward"), channel: "inbound_alias", alias: f.binding.alias, sender: f.binding.sender }))
      .toMatchObject({ status: "duplicate", documentId: first.documentId });
    const changed = f.receive("changed");
    expect(changed.status).toBe("candidate");
    expect(f.port.document(f.context, f.scope, changed.documentId!)).toMatchObject({ duplicateOf: first.documentId, recognizedDebtPence: 0 });
    expect(f.receive("other-supplier").status).toBe("verified");
    expect(f.receive("new-date").status).toBe("verified");
    expect(f.receive("new-amount").status).toBe("verified");
    expect(f.receive("credit").status).toBe("verified");
  });
  it("does not expose or silently assign another tenant or job's invoice", () => {
    const f = setup(), original = f.receive();
    const otherTenant = testTenantContext(randomUUID()), otherJob = { ...f.scope, jobId: randomUUID() };
    for (const [context, scope] of [[otherTenant, f.scope], [f.context, otherJob]] as const) {
      expect(() => f.port.document(context, scope, original.documentId!)).toThrow("SOURCE_UNAVAILABLE");
      expect(() => f.port.original(context, scope, original.documentId!)).toThrow("SOURCE_UNAVAILABLE");
    }
    expect(f.port.receive(f.context, otherJob, f.intake())).toEqual({ status: "held", documentId: null, reason: "routing_review" });
    const independent = f.port.receive(otherTenant, f.scope, f.intake());
    expect(independent.status).toBe("verified");
    expect(independent.documentId).not.toBe(original.documentId);
  });
  it("partitions command replay identities by the verified tenant", () => {
    const f = setup(), input = f.intake(), other = testTenantContext(randomUUID());
    const first = f.port.receive(f.context, f.scope, input);
    const second = f.port.receive(other, f.scope, input);
    expect(second.status).toBe("verified");
    expect(second.documentId).not.toBe(first.documentId);
    expect(f.port.receive(f.context, f.scope, input)).toEqual(first);
    expect(f.port.receive(other, f.scope, input)).toEqual(second);
    expect(() => f.port.document(other, f.scope, first.documentId!)).toThrow("SOURCE_UNAVAILABLE");
    expect(() => f.port.document(f.context, f.scope, second.documentId!)).toThrow("SOURCE_UNAVAILABLE");
  });
  it.each(["oversized", "password", "unreadable", "partial", "malformed", "malicious"])("quarantines %s with no debt", fixture => {
    const f = setup(), result = f.receive(fixture);
    expect(result).toMatchObject({ status: "quarantined", reason: "attachment_review" });
    expect(f.port.document(f.context, f.scope, result.documentId!)).toMatchObject({ status: "quarantined", recognizedDebtPence: 0 });
    expect(() => f.port.captureReceipt(f.context, f.scope, f.receipt(result.documentId!))).toThrow("SOURCE_UNAVAILABLE");
  });
  it("caps actual UTF-8 bytes before processing, independently of the fixture label", () => {
    const delivery = supplierFixtures["materials-B-delivery"];
    const originalBytes = delivery.bytes;
    try {
      // A character count would miss the extra byte in the second case.
      for (const extra of [0, 1]) {
        Object.assign(delivery, { bytes: "é".repeat(MAX_MERCHANT_ATTACHMENT_BYTES / 2) + "x".repeat(extra) });
        const f = setup(), result = f.receive("delivery");
        expect(result.status).toBe(extra ? "quarantined" : "verified");
        expect(f.port.original(f.context, f.scope, result.documentId!).byteLength).toBe(MAX_MERCHANT_ATTACHMENT_BYTES + extra);
        if (extra) expect(() => f.port.captureReceipt(f.context, f.scope, f.receipt(result.documentId!))).toThrow("SOURCE_UNAVAILABLE");
      }
    } finally {
      Object.assign(delivery, { bytes: originalBytes });
    }
    const f = setup(), result = f.receive("oversized");
    expect(f.port.original(f.context, f.scope, result.documentId!).byteLength).toBeGreaterThan(MAX_MERCHANT_ATTACHMENT_BYTES);
    expect(result.status).toBe("quarantined");
  });
  it("hashes immutable original bytes and retains the same version and page lineage in both split documents", () => {
    const f = setup(), result = f.receive("bundle");
    const document = f.port.document(f.context, f.scope, result.documentId!), original = f.port.original(f.context, f.scope, result.documentId!);
    expect(original.contentHash).toBe(createHash("sha256").update(original.bytes).digest("hex"));
    expect(original.byteLength).toBe(Buffer.byteLength(original.bytes));
    expect(document.parts).toEqual([
      { sourcePages: [1, 2], objectVersionId: original.objectVersionId },
      { sourcePages: [3], objectVersionId: original.objectVersionId },
    ]);
    document.parts[0]!.sourcePages.push(99);
    expect(f.port.document(f.context, f.scope, result.documentId!).parts[0]!.sourcePages).toEqual([1, 2]);
    expect(f.receive("bundle")).toMatchObject({ status: "duplicate", documentId: result.documentId });
  });
  it("rejects arbitrary URLs, paths, bytes, unversioned commands, bill links and shadow fields without echoing values", () => {
    const f = setup();
    for (const extra of [{ remoteUrl: "https://secret.invalid/private" }, { bytes: "secret-person" },
      { finalAccountRevisionId: randomUUID() }, { shadowSignalId: randomUUID() }, { attachmentPath: "/private/secret" }]) {
      expect(() => f.port.receive(f.context, f.scope, { ...f.intake(), ...extra })).toThrow(/^INVALID_INTAKE$/u);
    }
    expect(() => f.port.receive(f.context, f.scope, { ...f.intake(), version: "v0" })).toThrow("INVALID_INTAKE");
    expect(() => f.port.receive(f.context, { ...f.scope, secret: "secret-person" }, f.intake())).toThrow(/^INVALID_INTAKE$/u);
  });
});

describe("M2-2 PO-bound partial GRN", () => {
  it("keeps ordered, delivered, accepted, rejected, missing and later delivery distinct with exact decimals", () => {
    const f = setup(), delivery = f.receive("delivery"), input = f.receipt(delivery.documentId!);
    const first = f.port.captureReceipt(f.context, f.scope, input);
    expect(first).toMatchObject({ ordered: "10", delivered: "7", accepted: "6", rejected: "1", missing: "4", laterDelivered: "0", revision: 1 });
    expect(f.port.captureReceipt(f.context, f.scope, input)).toEqual(first);
    const next = { ...input, commandId: randomUUID(), idempotencyKey: randomUUID(), expectedRevision: 1, accepted: "4", rejected: "0",
      documentId: f.receive("later-delivery").documentId! };
    expect(f.port.captureReceipt(f.context, f.scope, next)).toMatchObject({ ordered: "10", delivered: "11", accepted: "10", rejected: "1", missing: "0", laterDelivered: "4", revision: 2 });
    expect(() => f.port.captureReceipt(f.context, f.scope, { ...next, commandId: randomUUID(), idempotencyKey: randomUUID() })).toThrow("SOURCE_UNAVAILABLE");
  });
  it("allows partial receipts only within the delivery document's remaining quantity", () => {
    const f = setup(), input = f.receipt(f.receive("delivery").documentId!);
    const first = f.port.captureReceipt(f.context, f.scope, input);
    const next = { ...input, commandId: randomUUID(), idempotencyKey: randomUUID(), expectedRevision: 1,
      accepted: "3.000001", rejected: "0" };
    // The PO still has four unaccepted units, but the document has only three unreceipted units.
    expect(() => f.port.captureReceipt(f.context, f.scope, next)).toThrow("QUANTITY_LIMIT");
    expect(f.port.captureReceipt(f.context, f.scope, input)).toEqual(first);
    const fitting = { ...next, accepted: "3" };
    const second = f.port.captureReceipt(f.context, f.scope, fitting);
    expect(second).toMatchObject({ delivered: "10", accepted: "9", rejected: "1", missing: "1", revision: 2 });
    expect(f.port.captureReceipt(f.context, f.scope, fitting)).toEqual(second);
    expect(() => f.port.captureReceipt(f.context, f.scope, { ...next, commandId: randomUUID(), idempotencyKey: randomUUID(),
      expectedRevision: 2, accepted: "0.000001" })).toThrow("QUANTITY_LIMIT");
  });
  it("shares the delivery document budget across PO lines and revisions", () => {
    const f = setup();
    const otherOrder = { ...f.order, revisionId: randomUUID(), line: { ...f.order.line, requirementId: randomUUID() } };
    const port = new FakeMerchantIntakePort(f.context, [f.binding], [{ order: f.order, state: "open" }, { order: otherOrder, state: "open" }]);
    const input = f.receipt(port.receive(f.context, f.scope, f.intake("delivery")).documentId!);
    port.captureReceipt(f.context, f.scope, input);
    const other = { ...input, commandId: randomUUID(), idempotencyKey: randomUUID(), revisionId: otherOrder.revisionId,
      requirementId: otherOrder.line.requirementId, accepted: "4", rejected: "0" };
    expect(() => port.captureReceipt(f.context, f.scope, other)).toThrow("QUANTITY_LIMIT");
    expect(port.captureReceipt(f.context, f.scope, { ...other, accepted: "3" })).toMatchObject({ delivered: "3", revision: 1 });
  });
  it.each(["locked", "superseded", "cancelled"] as const)("rejects %s source orders", state => {
    const f = setup(state), delivery = f.receive("delivery");
    expect(() => f.port.captureReceipt(f.context, f.scope, f.receipt(delivery.documentId!))).toThrow("SOURCE_UNAVAILABLE");
  });
  it("rejects wrong tenant/job/line/revision, missing delivery and invoice references", () => {
    const f = setup(), delivery = f.receive("delivery"), input = f.receipt(delivery.documentId!);
    for (const [context, scope] of [[testTenantContext(randomUUID()), f.scope], [f.context, { jobId: randomUUID() }]] as const)
      expect(() => f.port.captureReceipt(context, scope, input)).toThrow("SOURCE_UNAVAILABLE");
    for (const change of [{ revisionId: randomUUID() }, { requirementId: randomUUID() }, { documentId: `synthetic-document:${"0".repeat(64)}` },
      { documentId: f.receive().documentId! }])
      expect(() => f.port.captureReceipt(f.context, f.scope, { ...input, ...change })).toThrow("SOURCE_UNAVAILABLE");
    expect(() => f.port.captureReceipt(f.context, f.scope, { ...input, reversalOf: randomUUID() })).toThrow("INVALID_INTAKE");
  });
  it.each(["-1", "0.0000001", "100000000000000", "NaN"])("rejects invalid quantity %s before mutation", accepted => {
    const f = setup(), input = f.receipt(f.receive("delivery").documentId!);
    expect(() => f.port.captureReceipt(f.context, f.scope, { ...input, accepted })).toThrow("INVALID_INTAKE");
    expect(f.port.captureReceipt(f.context, f.scope, input).revision).toBe(1);
  });
  it("rejects zero and over-order deliveries; supports exact millionths and conflicting replays", () => {
    const f = setup(), input = f.receipt(f.receive("delivery").documentId!);
    for (const change of [{ accepted: "0", rejected: "0" }, { accepted: "11" }, { accepted: "10", rejected: "1" }])
      expect(() => f.port.captureReceipt(f.context, f.scope, { ...input, ...change })).toThrow("QUANTITY_LIMIT");
    const tiny = { ...input, accepted: "0.000001", rejected: "0" };
    expect(f.port.captureReceipt(f.context, f.scope, tiny)).toMatchObject({ missing: "9.999999", delivered: "0.000001" });
    expect(() => f.port.captureReceipt(f.context, f.scope, { ...tiny, accepted: "1" })).toThrow("IDEMPOTENCY_CONFLICT");
  });
});
