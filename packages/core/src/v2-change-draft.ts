// V2-F3 (Q55): one new quantity on an accepted quote line drafts the price, extra time and materials together.
// Pure. The price is a proposal for the existing variation path; time and materials are never money.
import { money } from "./money.js";
import { calculateNetLine, parseQuantity, type Quantity } from "./quantity.js";

export class ChangeDraftError extends Error {
  constructor(readonly code: "CHANGE_DRAFT_NO_CHANGE" | "CHANGE_DRAFT_LINE_UNPRICED" | "CHANGE_DRAFT_INVALID_QUANTITY") { super(code); }
}

export type ChangeDraftLine = { quantity: string | null; unit: string | null; unitRatePence: number | null };
export type ChangeDraftTask = { taskKey: string; durationMinutes: number; materialNeeds: readonly string[] };
export type ChangeDraft = {
  delta: string;
  direction: "addition" | "omission";
  priceProposal: { quantity: string; unit: string; unitRatePence: number };
  previewPence: number;
  tasks: { taskKey: string; proposedMinutes: number; materialNeeds: string[] }[];
};

const SCALE = 1_000_000n;
export const MAX_PROPOSED_MINUTES = 10_080;

function scaled(quantity: Quantity) { return quantity.scaled * (SCALE / quantity.scale); }

/** Canonical decimal (no trailing zeros) of a value held at six decimal places. */
function decimal(value: bigint) {
  const whole = value / SCALE, fraction = (value % SCALE).toString().padStart(6, "0").replace(/0+$/u, "");
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}

function quantity(input: string) {
  try { return parseQuantity(input); } catch { throw new ChangeDraftError("CHANGE_DRAFT_INVALID_QUANTITY"); }
}

/** Extra minutes for one task: duration × delta ÷ accepted, rounded up to 15. An omission drafts none. */
export function proposedMinutes(durationMinutes: number, delta: bigint, accepted: bigint, direction: "addition" | "omission") {
  if (direction === "omission") return 0;
  const numerator = BigInt(durationMinutes) * delta, denominator = accepted * 15n;
  const blocks = (numerator + denominator - 1n) / denominator;
  return Math.min(Number(blocks * 15n), MAX_PROPOSED_MINUTES);
}

export function draftChange(input: { line: ChangeDraftLine; newQuantity: string; unitRatePence?: number; tasks: readonly ChangeDraftTask[] }): ChangeDraft {
  const { line } = input;
  const rate = input.unitRatePence ?? line.unitRatePence;
  if (line.quantity === null || line.unit === null || rate === null || rate === undefined) throw new ChangeDraftError("CHANGE_DRAFT_LINE_UNPRICED");
  const accepted = scaled(quantity(line.quantity));
  if (accepted <= 0n) throw new ChangeDraftError("CHANGE_DRAFT_LINE_UNPRICED");
  const next = scaled(quantity(input.newQuantity));
  if (next === accepted) throw new ChangeDraftError("CHANGE_DRAFT_NO_CHANGE");
  const direction = next > accepted ? "addition" : "omission";
  const delta = next > accepted ? next - accepted : accepted - next;
  const deltaText = decimal(delta);
  const unsigned = calculateNetLine(parseQuantity(deltaText), money(rate)).pence;
  return {
    delta: deltaText, direction,
    priceProposal: { quantity: deltaText, unit: line.unit, unitRatePence: rate },
    previewPence: direction === "omission" ? -unsigned : unsigned,
    tasks: input.tasks.map(task => ({ taskKey: task.taskKey, proposedMinutes: proposedMinutes(task.durationMinutes, delta, accepted, direction),
      materialNeeds: direction === "omission" ? [] : [...task.materialNeeds] })),
  };
}
