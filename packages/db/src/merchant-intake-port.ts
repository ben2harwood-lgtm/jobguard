import { createHash } from "node:crypto";
import { z } from "zod";
import { formatReceiptQuantity, receiptQuantityMicros, supplierFixtures, MAX_MONEY_PENCE } from "@jobguard/core";
import { merchantOrderV1, requireSyntheticOrders, type MerchantOrder } from "./purchase-order-action.js";

export class MerchantIntakeError extends Error {
  constructor(readonly code: "INVALID_INTAKE" | "IDEMPOTENCY_CONFLICT" | "SOURCE_UNAVAILABLE" | "QUANTITY_LIMIT") {
    super(code); this.name = "MerchantIntakeError";
  }
}
function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new MerchantIntakeError("INVALID_INTAKE");
  return result.data;
}
const id = z.guid();
const fixtureAddress = z.string().regex(/^[a-z0-9-]+@[a-z0-9-]+\.invalid$/u);
const bindingV1 = z.object({ tenantId: id, jobId: id, alias: fixtureAddress, sender: fixtureAddress }).strict();
const scopeV1 = z.object({ tenantId: id, jobId: id }).strict();
export const MAX_MERCHANT_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const fixtureIds = ["invoice", "forward", "changed", "other-supplier", "bundle", "delivery", "later-delivery", "credit", "new-date", "new-amount", "oversized", "password", "unreadable", "partial", "malformed", "malicious"] as const;
const intakeV1 = z.object({ version: z.literal("dark-merchant-intake.v1"), commandId: id,
  idempotencyKey: id, channel: z.enum(["upload", "inbound_alias"]), alias: fixtureAddress.optional(),
  sender: fixtureAddress.optional(), fixtureId: z.enum(fixtureIds),
}).strict();
const quantity = z.string().refine(value => {
  try { receiptQuantityMicros(value); return true; } catch { return false; }
});
const receiptV1 = z.object({ version: z.literal("dark-grn.v1"), commandId: id, idempotencyKey: id,
  revisionId: id, requirementId: id, documentId: z.string().regex(/^synthetic-document:[a-f0-9]{64}$/u),
  accepted: quantity, rejected: quantity, expectedRevision: z.number().int().nonnegative(),
}).strict();
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const invoice = { supplier: "fixture:merchant-a", number: "INV-MB-001", date: "2030-01-01", amountPence: 25000 };
function fixture(name: typeof fixtureIds[number]) {
  const metadata = { ...invoice, number: name === "later-delivery" ? "DEL-MB-002" : invoice.number, supplier: name === "other-supplier" ? "fixture:merchant-b" : invoice.supplier,
    date: name === "new-date" ? "2030-02-01" : invoice.date, amountPence: name === "new-amount" ? 25002 : invoice.amountPence };
  const deliveryQuantity = name === "delivery" ? "10" : name === "later-delivery" ? "4" : null;
  const bytes = name === "oversized" ? "x".repeat(MAX_MERCHANT_ATTACHMENT_BYTES + 1)
    : name === "later-delivery" ? "%PDF-1.4\nSynthetic later delivery: 4 each\n%%EOF"
    : name === "delivery" ? supplierFixtures["materials-B-delivery"].bytes
    : `FICTIONAL ${name === "forward" ? "invoice" : name} document ${JSON.stringify(metadata)}`;
  const quarantine = ["password", "unreadable", "partial", "malformed", "malicious"].includes(name);
  return { bytes, metadata, quarantine, deliveryQuantity, type: deliveryQuantity !== null ? "delivery" as const : name === "credit" ? "credit" as const : "invoice" as const,
    pages: name === "bundle" ? 3 : 1 };
}
type Scope = z.infer<typeof scopeV1>;
type Document = { id: string; scope: Scope; type: "delivery" | "invoice" | "credit"; deliveryQuantity: string | null; original: {
  objectKey: string; objectVersionId: string; contentHash: string; byteLength: number;
}; parts: { sourcePages: number[]; objectVersionId: string }[]; identity: string;
  status: "verified" | "quarantined" | "candidate"; duplicateOf: string | null; recognizedDebtPence: 0 };
type Receipt = { revision: number; ordered: string; delivered: string; accepted: string; rejected: string;
  missing: string; laterDelivered: string; revisionId: string; requirementId: string; documentId: string };

/** In-process synthetic adapter contract ONLY. No HTTP registration, durable business writes,
 * mailbox, PDF parser, storage SDK, URL fetch, outbound actions or live enable switch.
 * Constructor seeds are server-owned test fixtures, never request-provided mappings or orders.
 */
export class FakeMerchantIntakePort {
  private readonly bindings: z.infer<typeof bindingV1>[];
  private readonly orders: { order: MerchantOrder; state: "open" | "locked" | "superseded" | "cancelled" }[];
  private readonly documents = new Map<string, Document>();
  private readonly originals = new Map<string, string>();
  private readonly receipts = new Map<string, Receipt>();
  private readonly documentDelivered = new Map<string, bigint>();
  private readonly commands = new Map<string, { fingerprint: string; result: unknown }>();
  constructor(bindings: unknown[], orders: { order: MerchantOrder; state: "open" | "locked" | "superseded" | "cancelled" }[]) {
    requireSyntheticOrders();
    this.bindings = bindings.map(value => parse(bindingV1, value));
    this.orders = orders.map(value => ({ order: parse(merchantOrderV1, value.order), state: value.state }));
  }
  private scope(raw: unknown) { requireSyntheticOrders(); return parse(scopeV1, raw); }
  private command<T>(scope: Scope, kind: string, input: { commandId: string; idempotencyKey: string }, work: () => T): T {
    const fingerprint = hash(JSON.stringify({ scope, kind, input }));
    const keys = [`${scope.tenantId}:command:${input.commandId}`, `${scope.tenantId}:key:${input.idempotencyKey}`];
    const prior = keys.map(key => this.commands.get(key));
    if (prior.some(value => value && value.fingerprint !== fingerprint)) throw new MerchantIntakeError("IDEMPOTENCY_CONFLICT");
    const existing = prior.find(value => value);
    if (existing) return structuredClone(existing.result) as T;
    const result = work();
    for (const key of keys) this.commands.set(key, { fingerprint, result: structuredClone(result) });
    return structuredClone(result);
  }
  receive(rawScope: unknown, raw: unknown) {
    const scope = this.scope(rawScope), input = parse(intakeV1, raw);
    return this.command(scope, "intake", input, () => {
      if (input.channel === "inbound_alias") {
        const matches = this.bindings.filter(binding => binding.alias === input.alias);
        if (matches.length !== 1 || matches[0]!.sender !== input.sender || matches[0]!.tenantId !== scope.tenantId
          || matches[0]!.jobId !== scope.jobId) return { status: "held" as const, documentId: null, reason: "routing_review" };
      } else if (input.alias || input.sender) throw new MerchantIntakeError("INVALID_INTAKE");
      const source = fixture(input.fixtureId);
      // Enforce the byte budget before interpreting any attachment metadata.
      const byteLength = Buffer.byteLength(source.bytes);
      const oversized = byteLength > MAX_MERCHANT_ATTACHMENT_BYTES;
      const quarantine = oversized || source.quarantine;
      const contentHash = hash(source.bytes);
      // Metadata is a fixed synthetic source proposal, never a debt or client assertion.
      if (!quarantine) parse(z.number().int().nonnegative().max(MAX_MONEY_PENCE), source.metadata.amountPence);
      const identity = quarantine ? contentHash : hash(JSON.stringify([source.metadata, source.type]));
      const local = [...this.documents.values()].filter(doc => doc.scope.tenantId === scope.tenantId && doc.scope.jobId === scope.jobId);
      const exact = local.find(doc => doc.original.contentHash === contentHash);
      if (exact) return { status: "duplicate" as const, documentId: exact.id, reason: null };
      const candidate = local.find(doc => doc.identity === identity);
      // Same invoice under another job stays unassigned; never return that job's IDs.
      const wrongJob = [...this.documents.values()].some(doc => doc.scope.tenantId === scope.tenantId
        && doc.scope.jobId !== scope.jobId && (doc.identity === identity || doc.original.contentHash === contentHash));
      if (wrongJob) return { status: "held" as const, documentId: null, reason: "routing_review" };
      const documentId = `synthetic-document:${hash(JSON.stringify([scope, contentHash]))}`;
      const version = `synthetic-version:${hash(JSON.stringify([scope, contentHash, "original"]))}`;
      const status = quarantine ? "quarantined" : candidate ? "candidate" : "verified";
      const parts = input.fixtureId === "bundle" ? [[1, 2], [3]] : [Array.from({ length: source.pages }, (_, i) => i + 1)];
      this.documents.set(documentId, { id: documentId, scope, type: source.type, deliveryQuantity: source.deliveryQuantity,
        original: { objectKey: `synthetic/${scope.tenantId}/${scope.jobId}/${contentHash}`, objectVersionId: version,
          contentHash, byteLength },
        parts: parts.map(sourcePages => ({ sourcePages, objectVersionId: version })), identity,
        status, duplicateOf: candidate?.id ?? null, recognizedDebtPence: 0 });
      this.originals.set(version, source.bytes);
      return { status, documentId, reason: quarantine ? "attachment_review" : null };
    });
  }
  document(rawScope: unknown, documentId: string) {
    const scope = this.scope(rawScope), doc = this.documents.get(documentId);
    if (!doc || doc.scope.tenantId !== scope.tenantId || doc.scope.jobId !== scope.jobId)
      throw new MerchantIntakeError("SOURCE_UNAVAILABLE");
    return structuredClone(doc);
  }
  original(rawScope: unknown, documentId: string) {
    const doc = this.document(rawScope, documentId);
    return { ...doc.original, bytes: this.originals.get(doc.original.objectVersionId)! };
  }
  captureReceipt(rawScope: unknown, raw: unknown) {
    const scope = this.scope(rawScope), input = parse(receiptV1, raw);
    return this.command(scope, "receipt", input, () => {
      const source = this.orders.find(({ order }) => order.tenantId === scope.tenantId && order.jobId === scope.jobId
        && order.revisionId === input.revisionId && order.line.requirementId === input.requirementId);
      const doc = this.document(scope, input.documentId);
      if (!source || source.state !== "open" || doc.status !== "verified" || doc.type !== "delivery" || doc.deliveryQuantity === null)
        throw new MerchantIntakeError("SOURCE_UNAVAILABLE");
      const key = `${scope.tenantId}:${scope.jobId}:${input.revisionId}:${input.requirementId}`;
      const prior = this.receipts.get(key);
      if ((prior?.revision ?? 0) !== input.expectedRevision) throw new MerchantIntakeError("SOURCE_UNAVAILABLE");
      const accepted = receiptQuantityMicros(input.accepted), rejected = receiptQuantityMicros(input.rejected);
      const ordered = receiptQuantityMicros(source.order.line.quantity);
      const documentDelivered = (this.documentDelivered.get(doc.id) ?? 0n) + accepted + rejected;
      if (documentDelivered > receiptQuantityMicros(doc.deliveryQuantity)) throw new MerchantIntakeError("QUANTITY_LIMIT");
      const cumulativeAccepted = accepted + receiptQuantityMicros(prior?.accepted ?? "0");
      const cumulativeRejected = rejected + receiptQuantityMicros(prior?.rejected ?? "0");
      if (accepted + rejected === 0n || accepted + rejected > ordered - receiptQuantityMicros(prior?.accepted ?? "0")
        || cumulativeAccepted > ordered) throw new MerchantIntakeError("QUANTITY_LIMIT");
      const receipt: Receipt = { revision: input.expectedRevision + 1, ordered: formatReceiptQuantity(ordered),
        delivered: formatReceiptQuantity(cumulativeAccepted + cumulativeRejected), accepted: formatReceiptQuantity(cumulativeAccepted),
        rejected: formatReceiptQuantity(cumulativeRejected), missing: formatReceiptQuantity(ordered - cumulativeAccepted),
        laterDelivered: formatReceiptQuantity((prior ? accepted : 0n) + receiptQuantityMicros(prior?.laterDelivered ?? "0")),
        revisionId: input.revisionId, requirementId: input.requirementId, documentId: input.documentId };
      this.receipts.set(key, receipt);
      this.documentDelivered.set(doc.id, documentDelivered);
      return receipt;
    });
  }
}
