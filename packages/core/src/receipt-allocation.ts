import { z } from "zod";
import { MAX_MONEY_PENCE } from "./money.js";
import { addExactPence, compareExactPence, exactPence, exactPenceV1, multiplyExactPence, parseExactPence, SharedMoneyError, type ExactPence } from "./cumulative-fee.js";
const amount = z.number().int().nonnegative().max(MAX_MONEY_PENCE);
export const receiptAllocationV1 = z.object({
  version: z.literal("receipt-allocation.v1"), sourceRef: z.string().min(1).max(300),
  receiptGross: exactPenceV1, effectiveAt: z.string().datetime({ offset: true }), direction: z.enum(["receipt", "reversal"]),
  invoiceId: z.string().min(1).max(200),
  separateInvoiceId: z.string().min(1).max(200).nullable(),
  explicit: z.array(z.object({ lineId: z.string().min(1).max(200), gross: exactPenceV1 }).strict()).max(10000).nullable(),
  lines: z.array(z.object({ id: z.string().min(1).max(200), invoiceId: z.string().min(1).max(200),
    existedAt: z.string().datetime({ offset: true }), outstandingGross: exactPenceV1,
    netPence: amount, grossPence: amount.refine(v => v > 0),
  }).strict().refine(v => v.netPence <= v.grossPence, "Net cannot exceed gross")).max(10000),
}).strict();
export type ReceiptAllocationInput = z.infer<typeof receiptAllocationV1>;
export type ReceiptLineAllocation = Readonly<{
  lineId: string; rule: "explicit" | "separate_invoice" | "pro_rata"; sourceRef: string;
  gross: ExactPence; net: ExactPence;
}>;

/** For reversals, supply the original settlement's remaining line balances and ratios. */
export function allocateReceiptToLines(raw: unknown): readonly ReceiptLineAllocation[] {
  const parsed = receiptAllocationV1.safeParse(raw);
  if (!parsed.success) throw new SharedMoneyError("INVALID_ALLOCATION");
  const input = parsed.data, receipt = parseExactPence(input.receiptGross);
  const fail = (): never => { throw new SharedMoneyError("INVALID_ALLOCATION"); };
  if (receipt.numerator < 0n || new Set(input.lines.map(l => l.id)).size !== input.lines.length) fail();
  const all = input.lines.map(line => ({ ...line, outstanding: parseExactPence(line.outstandingGross) }));
  if (all.some(line => line.outstanding.numerator < 0n)) fail();
  const eligible = all.filter(line => line.invoiceId === input.invoiceId &&
    Date.parse(line.existedAt) <= Date.parse(input.effectiveAt) && line.outstanding.numerator > 0n);
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
    let total = exactPence(0n);
    for (const allocation of input.explicit) {
      const line = eligible.find(l => l.id === allocation.lineId); if (!line) fail();
      const gross = parseExactPence(allocation.gross); total = addExactPence(total, gross); append(line!, gross);
    }
    if (compareExactPence(total, receipt) !== 0) fail();
  } else {
    const total = eligible.reduce((sum, line) => addExactPence(sum, line.outstanding), exactPence(0n));
    if (compareExactPence(receipt, total) > 0) fail();
    if (receipt.numerator !== 0n) {
      for (const line of eligible) append(line, multiplyExactPence(receipt,
        multiplyExactPence(line.outstanding, exactPence(total.denominator, total.numerator))));
    }
  }
  return Object.freeze(output);
}
