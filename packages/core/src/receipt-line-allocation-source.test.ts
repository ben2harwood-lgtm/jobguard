import { describe, expect, it } from "vitest";
import { MAX_EXACT_PENCE_DIGITS } from "./cumulative-fee.js";
import { MAX_MONEY_PENCE } from "./money.js";
import {
  receiptLineAllocationSourceV1 as source, receiptLineAllocationCommandV1 as command,
  receiptLineAllocationViewV1 as viewSchema, receiptLineAllocationCommandResultV1 as result,
  deriveReceiptLineAllocationStatus as status, receiptLineAllocationQueryV1 as query,
  receiptLineAllocationSnapshotV1 as snapshot, receiptLineAllocationSelectorV1 as selector,
  parseReceiptLineAllocationCommand,
} from "./receipt-line-allocation-source.js";
const id = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const hash = "a".repeat(64);
const at = "2026-10-23T12:00:00.123456789Z";
const fraction = (numerator = "40000", denominator = "1") => ({ numerator, denominator });
const row = () => ({
  version: "receipt-line-allocation-source.v1", tenantId: id, jobId: id,
  allocationRevisionId: id, lineAllocationId: id, sourceHash: hash, direction: "receipt",
  paymentId: id, movementId: id, movementHash: hash, invoiceId: id,
  invoiceBinding: { invoiceId: id, revisionId: id, lockId: id, checkId: id, invoiceKind: "final" },
  lineId: id, scopeItemId: id, commercialRevisionId: id, rule: "pro_rata", sourceRef: "saved-source",
  receiptEffectiveAt: at, lineExistedAt: at, gross: fraction("48000"), net: fraction(),
  originalLineNetPence: 80000, originalLineGrossPence: 96000, approvalRef: "saved-approval",
  reversesLineAllocationId: null,
  evidence: [{ evidenceId: id, objectVersionId: "immutable-version", sha256: hash, serverReceivedAt: at }],
});
const review = () => ({ version: "receipt-line-allocation-review.v1", reviewId: id, operation: "receipt", paymentId: id,
  invoiceId: id, expectedSourceRevision: 1, sourceHash: hash, approvalHash: hash, createdAt: at, expiresAt: at,
  state: "ready", proposedLines: [{ lineId: id, rule: "pro_rata", sourceRef: "source", gross: fraction("48000"), net: fraction(), reversesLineAllocationId: null }] });
const view = () => ({ version: "receipt-line-allocation-view.v1", environment: "synthetic_demo", realExternalActions: 0,
  jobId: id, revision: 1, sourceHash: hash, status: "saved_distribution", holds: [], receipts: [], rows: [row()], review: null, commandResult: null });
const base = { version: "receipt-line-allocation-command.v1", commandId: id, expectedSourceRevision: 1 };
const commands = [
  { ...base, action: "review", paymentId: id }, { ...base, action: "approve", reviewId: id, approvalHash: hash },
  { ...base, action: "review_reverse", allocationRevisionId: id, reversalSource: { kind: "credit_note", sourceId: id }, grossPence: 1 },
  { ...base, action: "reverse", reviewId: id, approvalHash: hash },
];
describe("M48-C0 factual contracts", () => {
  it("M48-C0-A1 preserves F4/F5/F7 and signed exact reversals, including server precision", () => {
    for (const [n, d] of [["2000000", "43"], ["40000", "1"], ["80000", "1"]]) {
      const input = { ...row(), net: fraction(n, d), gross: fraction(String(BigInt(n!) * 6n / 5n), d) };
      expect(JSON.parse(JSON.stringify(source.parse(input)))).toEqual(input);
      const reversed = { ...input, lineAllocationId: other, direction: "reversal", reversesLineAllocationId: id,
        net: fraction(`-${n}`, d), gross: fraction(`-${BigInt(n!) * 6n / 5n}`, d) };
      expect(JSON.parse(JSON.stringify(source.parse(reversed)))).toEqual(reversed);
    }
  });
  it("M48-C0-A2 rejects malformed, over-limit and noncanonical exact money", () => {
    for (const bad of [fraction("1", "0"), fraction("1", "-1"), fraction("01"), fraction("1.1"), fraction("+1"), fraction("-0"), fraction("1", "01"), fraction("1".repeat(MAX_EXACT_PENCE_DIGITS + 1)), fraction(String(MAX_MONEY_PENCE + 1))]) {
      expect(source.safeParse({ ...row(), net: bad }).success).toBe(false);
    }
    for (const pence of [Number.MAX_SAFE_INTEGER + 1, MAX_MONEY_PENCE + 1, -1, 0.1])
      expect(source.safeParse({ ...row(), originalLineNetPence: pence }).success).toBe(false);
  });
  it("M48-C0-A2 rejects forged bindings, signs, ratios and missing source authority", () => {
    const invalid = [ { version: "old" }, { sourceHash: "bad" }, { movementHash: null }, { approvalRef: "" },
      { invoiceBinding: { ...row().invoiceBinding, invoiceId: other } }, { net: fraction("-1") },
      { direction: "reversal", reversesLineAllocationId: other }, { reversesLineAllocationId: other },
      { direction: "reversal", gross: fraction("-48000"), net: fraction("-40000"), reversesLineAllocationId: id },
      { net: fraction("40001") }, { originalLineNetPence: 96001 }, { evidence: [] } ];
    for (const patch of invalid) expect(source.safeParse({ ...row(), ...patch }).success).toBe(false);
    for (const key of Object.keys(row())) { const input: Record<string, unknown> = row(); delete input[key]; expect(source.safeParse(input).success).toBe(false); }
    expect(source.safeParse({ ...row(), evidence: [{ ...row().evidence[0], objectVersionId: "" }] }).success).toBe(false);
  });
  it.each(["receipt", "reversal"])("r1 rejects ratio-consistent over-allocation for %s", direction => {
    const sign = direction === "reversal" ? "-" : "";
    const input = { ...row(), direction, lineAllocationId: other,
      reversesLineAllocationId: direction === "reversal" ? id : null };
    expect(source.safeParse({ ...input, gross: fraction(`${sign}96000`), net: fraction(`${sign}80000`) }).success).toBe(true);
    // Both allocations retain the original 5/6 net/gross ratio.
    for (const [gross, net] of [[fraction(`${sign}96006`), fraction(`${sign}80005`)],
      [fraction(`${sign}96001`), fraction(`${sign}480005`, "6")]]) {
      expect(source.safeParse({ ...input, gross, net }).success).toBe(false);
    }
  });
  it("r1 rejects original net above gross with a consistent allocation ratio", () => {
    const input = { ...row(), gross: fraction("96000"), net: fraction("96000"), originalLineNetPence: 96000 };
    expect(source.safeParse(input).success).toBe(true);
    expect(source.safeParse({ ...input, net: fraction("96001"), originalLineNetPence: 96001 }).success).toBe(false);
  });
  it.each(["receipt", "reversal"])("r1 rejects zero-gross %s rows", direction => {
    const input = { ...row(), direction, lineAllocationId: other,
      reversesLineAllocationId: direction === "reversal" ? id : null };
    expect(source.safeParse({ ...input, gross: fraction(direction === "reversal" ? "-48000" : "48000"),
      net: fraction(direction === "reversal" ? "-40000" : "40000") }).success).toBe(true);
    expect(source.safeParse({ ...input, gross: fraction("0"), net: fraction("0") }).success).toBe(false);
  });
  it.each([
    { operation: "receipt", gross: "-48000", net: "-40000", link: null, reason: "negative receipt" },
    { operation: "receipt", gross: "48000", net: "40000", link: id, reason: "linked receipt" },
    { operation: "reversal", gross: "48000", net: "40000", link: id, reason: "positive reversal" },
    { operation: "reversal", gross: "-48000", net: "-40000", link: null, reason: "unlinked reversal" },
  ])("r1 rejects review proposal sign/link mismatch: $reason", ({ operation, gross, net, link }) => {
    const proposal = review().proposedLines[0]!;
    const input = { ...view(), status: "review_ready", review: { ...review(), operation,
      proposedLines: [{ ...proposal, gross: fraction(operation === "reversal" ? "-48000" : "48000"),
        net: fraction(operation === "reversal" ? "-40000" : "40000"), reversesLineAllocationId: operation === "reversal" ? id : null }] } };
    expect(viewSchema.safeParse(input).success).toBe(true);
    expect(viewSchema.safeParse({ ...input, review: { ...input.review,
      proposedLines: [{ ...proposal, gross: fraction(gross), net: fraction(net), reversesLineAllocationId: link }] } }).success).toBe(false);
  });
  it("r1 rejects unknown review keys", () => {
    const input = { ...view(), status: "review_ready", review: review() };
    expect(viewSchema.safeParse(input).success).toBe(true);
    expect(viewSchema.safeParse({ ...input, review: { ...input.review, qualified: true } }).success).toBe(false);
  });
  it("M48-C0-A3 accepts only identity selections and rejects forged authority in every command variant", () => {
    for (const input of commands) {
      expect(command.parse(input)).toEqual(input);
      for (const key of ["tenantId", "actor", "rule", "tax", "ratios", "settlement", "eligibility", "qualified", "sourceTimestamp", "expiresAt", "unknown", "gross", "net"])
        expect(command.safeParse({ ...input, [key]: true }).success).toBe(false);
    }
    expect(command.safeParse({ ...commands[2], reversalSource: { kind: "credit_note", sourceId: id, tenantId: id } }).success).toBe(false);
    for (const grossPence of [0, -1, 1.5, MAX_MONEY_PENCE + 1]) expect(command.safeParse({ ...commands[2], grossPence }).success).toBe(false);
    for (const expectedSourceRevision of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) expect(command.safeParse({ ...commands[0], expectedSourceRevision }).success).toBe(false);
  });
  it("M48-C0-A4 has no fee, posting, offset, cap, credit or predicate conclusion", () => {
    for (const key of ["fee", "posting", "subscriptionOffset", "cap", "credit", "qualified", "eligibilityRevisionId", "attribution", "holds", "productionEnabled"])
      expect(source.safeParse({ ...row(), [key]: true }).success).toBe(false);
    expect(source.safeParse({ ...row(), invoiceBinding: { ...row().invoiceBinding, fee: 1 } }).success).toBe(false);
    expect(source.safeParse({ ...row(), evidence: [{ ...row().evidence[0], verified: true }] }).success).toBe(false);
  });
  it("pairs immutable command outcomes with actions and saved IDs", () => {
    const outcomes = ["review_saved", "distribution_saved", "reversal_review_saved", "reversal_saved"];
    commands.forEach((c, index) => {
      const input = { version: "receipt-line-allocation-command-result.v1", environment: "synthetic_demo", realExternalActions: 0,
        commandId: id, jobId: id, replayed: false, sourceRevision: 1, sourceHash: hash,
        action: c.action, outcome: outcomes[index], reviewId: id, allocationRevisionId: index % 2 ? id : null };
      expect(result.parse(input)).toEqual(input);
      expect(result.parse({ ...input, replayed: true })).toEqual({ ...input, replayed: true });
      expect(result.safeParse({ ...input, outcome: outcomes[(index + 1) % 4] }).success).toBe(false);
      expect(result.safeParse({ ...input, allocationRevisionId: index % 2 ? null : id }).success).toBe(false);
    });
  });
  it("derives and validates hold > stale review > ready review > saved > empty status", () => {
    expect(status(view())).toBe("saved_distribution");
    expect(status({ ...view(), rows: [] })).toBe("no_distribution");
    expect(status({ ...view(), review: review() })).toBe("review_ready");
    for (const state of ["stale", "expired", "revoked"] as const) expect(status({ ...view(), review: { ...review(), state } })).toBe("review_stale");
    expect(status({ ...view(), review: { ...review(), state: "consumed" } })).toBe("saved_distribution");
    for (const hold of ["APPROVAL_EXPIRED", "APPROVAL_REVOKED"]) expect(status({ ...view(), holds: [hold] })).toBe("review_stale");
    expect(status({ ...view(), holds: ["PENDING_MOVEMENT"], review: review() })).toBe("source_held");
    expect(viewSchema.parse(view())).toEqual(view());
    expect(viewSchema.safeParse({ ...view(), holds: ["SOURCE_CHANGED"] }).success).toBe(false);
  });
  it("separates unsaved proposals, enforces movement nulls and complete 10000-line bound", () => {
    const ready = { ...view(), status: "review_ready", review: review() };
    expect(viewSchema.safeParse(ready).success).toBe(true);
    expect(viewSchema.safeParse({ ...ready, review: { ...review(), proposedLines: [{ ...review().proposedLines[0], approvalRef: "forged" }] } }).success).toBe(false);
    const receipt = { paymentId: id, invoiceId: id, grossPence: 1, movementId: null, movementHash: null, receiptEffectiveAt: null, state: "unmatched" };
    expect(viewSchema.safeParse({ ...view(), receipts: [receipt] }).success).toBe(true);
    expect(viewSchema.safeParse({ ...view(), receipts: [{ ...receipt, movementId: id }] }).success).toBe(false);
    expect(viewSchema.safeParse({ ...view(), receipts: [{ ...receipt, state: "settled" }] }).success).toBe(false);
    expect(viewSchema.safeParse({ ...view(), rows: Array.from({ length: 10001 }, row) }).success).toBe(false);
    const lines = Array.from({ length: 10000 }, () => review().proposedLines[0]);
    expect(viewSchema.safeParse({ ...ready, review: { ...review(), proposedLines: lines } }).success).toBe(true);
    expect(viewSchema.safeParse({ ...ready, review: { ...review(), proposedLines: [...lines, lines[0]] } }).success).toBe(false);
  });
  it("validates strict query, selector, snapshot and typed command errors", () => {
    expect(query.parse({ version: "receipt-line-allocation-query.v1", commandId: id }).commandId).toBe(id);
    expect(query.safeParse({ version: "receipt-line-allocation-query.v1", tenantId: id }).success).toBe(false);
    expect(selector.parse({ jobId: id, invoiceId: id, paymentId: id }).jobId).toBe(id);
    expect(selector.safeParse({ jobId: id, actor: id }).success).toBe(false);
    expect(snapshot.parse({ revision: 1, sourceHash: hash, rows: [row()], holds: [] }).rows).toHaveLength(1);
    expect(snapshot.safeParse({ revision: 1, sourceHash: hash, rows: [], holds: [], qualified: true }).success).toBe(false);
    expect(() => parseReceiptLineAllocationCommand({ ...commands[0], tenantId: id })).toThrow("INVALID_RECEIPT_LINE_COMMAND");
    expect(parseReceiptLineAllocationCommand(commands[0])).toEqual(commands[0]);
  });
  it("rejects cross-job projections and stale ready-review source bindings", () => {
    expect(viewSchema.safeParse({ ...view(), rows: [{ ...row(), jobId: other }] }).success).toBe(false);
    for (const patch of [{ sourceHash: "b".repeat(64) }, { expectedSourceRevision: 2 }]) {
      expect(viewSchema.safeParse({ ...view(), status: "review_ready", review: { ...review(), ...patch } }).success).toBe(false);
    }
    for (const holds of [["UNMATCHED_RECEIPT"], ["DUPLICATE_MOVEMENT"], ["REVERSED_MOVEMENT"], ["INVALIDATED_EVIDENCE"],
      ["MISSING_INVOICE_BINDING"], ["INCOMPLETE_COMPOSITION"], ["SOURCE_CHANGED"], ["UNSUPPORTED_SOURCE"]]) {
      expect(status({ ...view(), holds, review: { ...review(), state: "expired" } })).toBe("source_held");
      expect(viewSchema.safeParse({ ...view(), holds, status: "source_held" }).success).toBe(true);
    }
  });

});
