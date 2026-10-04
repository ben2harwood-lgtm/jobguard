import { z } from "zod";
import { MAX_MONEY_PENCE } from "./money.js";
import {
  compareExactPence, exactPence, exactPenceInputV1, MAX_ALLOCATION_LINES, MAX_EXACT_PENCE_INPUT_DIGITS, multiplyExactPence,
  parseExactPence, SharedMoneyError, sumExactPence, type ExactPence,
} from "./cumulative-fee.js";
const amount = z.number().int().nonnegative().max(MAX_MONEY_PENCE);
export const receiptAllocationV1 = z.object({
  version: z.literal("receipt-allocation.v1"), sourceRef: z.string().min(1).max(300),
  receiptGross: exactPenceInputV1, effectiveAt: z.string().datetime({ offset: true }), direction: z.enum(["receipt", "reversal"]),
  invoiceId: z.string().min(1).max(200),
  separateInvoiceId: z.string().min(1).max(200).nullable(),
  explicit: z.array(z.object({ lineId: z.string().min(1).max(200), gross: exactPenceInputV1 }).strict()).max(MAX_ALLOCATION_LINES).nullable(),
  lines: z.array(z.object({ id: z.string().min(1).max(200), invoiceId: z.string().min(1).max(200),
    existedAt: z.string().datetime({ offset: true }), outstandingGross: exactPenceInputV1,
    netPence: amount, grossPence: amount.refine(v => v > 0),
  }).strict().refine(v => v.netPence <= v.grossPence, "Net cannot exceed gross")).max(MAX_ALLOCATION_LINES),
}).strict();
export type ReceiptAllocationInput = z.infer<typeof receiptAllocationV1>;
export type ReceiptLineAllocation = Readonly<{
  lineId: string; rule: "explicit" | "separate_invoice" | "pro_rata"; sourceRef: string;
  gross: ExactPence; net: ExactPence;
}>;

type Instant = Readonly<{ seconds: bigint; fraction: string }>;
const INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(Z|[+-]\d{2}:?\d{2})$/u;
/**
 * Exact instant for any string the schema accepts: whole seconds since a fixed origin, with the timezone offset applied,
 * plus the decimal fraction as written (trailing zeros dropped). Date.parse would truncate to milliseconds.
 */
function parseInstant(value: string): Instant {
  const match = INSTANT.exec(value);
  if (!match) throw new SharedMoneyError("INVALID_ALLOCATION");
  const part = (index: number) => BigInt(match[index] ?? "0");
  const month = part(2);
  // Days from a civil date (proleptic Gregorian, March-based years). The extra 400 years keep every year positive and
  // leave the leap-year cycle unchanged; only differences between instants matter.
  const year = part(1) + 400n - (month <= 2n ? 1n : 0n);
  const era = year / 400n, yearOfEra = year - era * 400n;
  const dayOfYear = (153n * (month > 2n ? month - 3n : month + 9n) + 2n) / 5n + part(3) - 1n;
  const days = era * 146097n + yearOfEra * 365n + yearOfEra / 4n - yearOfEra / 100n + dayOfYear;
  const zone = match[8] ?? "Z";
  const offsetDigits = zone.slice(1).replace(":", "");
  const sign: bigint = zone.startsWith("-") ? -1n : 1n;
  const offset: bigint = zone === "Z" ? 0n : sign * (BigInt(offsetDigits.slice(0, 2)) * 3600n + BigInt(offsetDigits.slice(2)) * 60n);
  return { seconds: days * 86400n + part(4) * 3600n + part(5) * 60n + part(6) - offset, fraction: (match[7] ?? "").replace(/0+$/u, "") };
}
function compareInstants(a: Instant, b: Instant): -1 | 0 | 1 {
  if (a.seconds !== b.seconds) return a.seconds < b.seconds ? -1 : 1;
  const width = Math.max(a.fraction.length, b.fraction.length);
  const left = a.fraction.padEnd(width, "0"), right = b.fraction.padEnd(width, "0");
  return left === right ? 0 : left < right ? -1 : 1;
}

/** For reversals, supply the original settlement's remaining line balances and ratios. */
export function allocateReceiptToLines(raw: unknown): readonly ReceiptLineAllocation[] {
  const parsed = receiptAllocationV1.safeParse(raw);
  if (!parsed.success) throw new SharedMoneyError("INVALID_ALLOCATION");
  const input = parsed.data;
  const fail = (): never => { throw new SharedMoneyError("INVALID_ALLOCATION"); };
  // Allocation inputs are short (schema-bounded), so reducing them is cheap and keeps every output in canonical form.
  const read = (raw: unknown): ExactPence => { const value = parseExactPence(raw, exactPenceInputV1); return exactPence(value.numerator, value.denominator); };
  // A sum of inputs is bounded like an input, so per-line work stays bounded and every output fits the fee kernel.
  const total = (values: readonly ExactPence[]): ExactPence => {
    try { return sumExactPence(values, MAX_EXACT_PENCE_INPUT_DIGITS); } catch { return fail(); }
  };
  const receipt = read(input.receiptGross);
  if (receipt.numerator < 0n || new Set(input.lines.map(l => l.id)).size !== input.lines.length) fail();
  const all = input.lines.map(line => ({ ...line, outstanding: read(line.outstandingGross) }));
  const effectiveAt = parseInstant(input.effectiveAt);
  if (all.some(line => line.outstanding.numerator < 0n)) fail();
  const eligible = all.filter(line => line.invoiceId === input.invoiceId &&
    compareInstants(parseInstant(line.existedAt), effectiveAt) <= 0 && line.outstanding.numerator > 0n);
  const rule = input.explicit !== null ? "explicit" : input.separateInvoiceId !== null ? "separate_invoice" : "pro_rata";
  if (input.separateInvoiceId !== null && input.separateInvoiceId !== input.invoiceId) fail();
  const output: ReceiptLineAllocation[] = [];
  const append = (line: typeof eligible[number], gross: ExactPence) => {
    if (gross.numerator < 0n || compareExactPence(gross, line.outstanding) > 0) fail();
    const signed = input.direction === "reversal" ? exactPence(-gross.numerator, gross.denominator) : gross;
    output.push(Object.freeze({ lineId: line.id, rule, sourceRef: input.sourceRef, gross: signed,
      net: multiplyExactPence(signed, exactPence(BigInt(line.netPence), BigInt(line.grossPence))) }));
  };
  if (input.explicit !== null) {
    if (new Set(input.explicit.map(a => a.lineId)).size !== input.explicit.length) fail();
    const byId = new Map(eligible.map(line => [line.id, line] as const));
    const shares = input.explicit.map(allocation => ({ line: byId.get(allocation.lineId), gross: read(allocation.gross) }));
    if (compareExactPence(total(shares.map(share => share.gross)), receipt) !== 0) fail();
    for (const share of shares) { if (!share.line) fail(); append(share.line!, share.gross); }
  } else {
    const outstanding = total(eligible.map(line => line.outstanding));
    if (compareExactPence(receipt, outstanding) > 0) fail();
    if (receipt.numerator !== 0n) {
      const proportion = exactPence(outstanding.denominator, outstanding.numerator);
      for (const line of eligible) append(line, multiplyExactPence(receipt, multiplyExactPence(line.outstanding, proportion)));
    }
  }
  return Object.freeze(output);
}
