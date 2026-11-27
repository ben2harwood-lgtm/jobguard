import { z } from "zod";
import { MAX_MONEY_PENCE, moneyFromBigInt } from "./money.js";
import { divideRounded } from "./rational.js";
import { formatRecoveryMessagePounds } from "./recovery-message.js";

// Money is the shared { pence, currency } shape (AGENTS.md 5.5), signed for omissions, credits and overspend.
const signedMoney = z.object({ pence: z.number().int().safe().min(-MAX_MONEY_PENCE).max(MAX_MONEY_PENCE), currency: z.literal("GBP") }).strict();
// Only the percentage is a decimal string.
const percentText = z.string().regex(/^-?(?:0|[1-9]\d*)\.\d{2}$/u);
export const v2JobProfitV1 = z.object({
  version: z.literal("v2-job-profit.v1"), currency: z.literal("GBP"), taxBasis: z.literal("ex-VAT"),
  quoted: signedMoney.nullable(), approvedExtras: signedMoney, jobTotal: signedMoney.nullable(),
  recordedCosts: signedMoney, leftInBudget: signedMoney.nullable(), spentPercent: percentText.nullable(),
  notice: z.literal("Costs recorded so far only."), summary: z.string(),
}).strict();
export type V2JobProfit = z.infer<typeof v2JobProfitV1>;

function fixed(value: bigint): string {
  const sign = value < 0n ? "-" : "", absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
}
const asMoney = (value: bigint) => ({ pence: moneyFromBigInt(value).pence as number, currency: "GBP" as const });
function pounds(value: bigint): string {
  const checked = moneyFromBigInt(value).pence;
  return `${checked < 0 ? "-" : ""}£${formatRecoveryMessagePounds(Math.abs(checked))}`;
}

/** Stored net pence only. No estimates, findings, forecast or tax recalculation. */
export function v2JobProfit(quotedPence: string | null, extrasPence: string, costsPence: string): V2JobProfit {
  const checked = (value: string) => BigInt(moneyFromBigInt(BigInt(value)).pence);
  const quoted = quotedPence === null ? null : checked(quotedPence);
  const extras = checked(extrasPence), costs = checked(costsPence);
  const total = quoted === null ? null : checked((quoted + extras).toString());
  const priced = quoted !== null && quoted > 0n && total !== null && total > 0n;
  const left = priced ? checked((total - costs).toString()) : null;
  const percent = priced ? fixed(divideRounded(costs * 10_000n, total, "half_even")) : null;
  return v2JobProfitV1.parse({ version: "v2-job-profit.v1", currency: "GBP", taxBasis: "ex-VAT",
    quoted: quoted === null ? null : asMoney(quoted), approvedExtras: asMoney(extras),
    jobTotal: total === null ? null : asMoney(total), recordedCosts: asMoney(costs),
    leftInBudget: left === null ? null : asMoney(left), spentPercent: percent,
    notice: "Costs recorded so far only.",
    summary: priced
      ? `Quoted ${pounds(quoted)}, approved extras ${pounds(extras)}, job total ${pounds(total)}, recorded costs so far ${pounds(costs)} (${percent}% spent so far), ${pounds(left!)} left in the budget. All figures ex-VAT.`
      : `No accepted price yet. Recorded costs so far ${pounds(costs)} (ex-VAT).`,
  });
}
