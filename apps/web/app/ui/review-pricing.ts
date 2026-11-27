import { calculateNetLine, MAX_MONEY_PENCE, money, parsePoundsToPence, parseQuantity } from "@jobguard/core";

// V2-SQ2: review-row prices and the running total, in integer pence. The quote
// editor stays the place a rate is confirmed; these are draft figures only.
type Priced = { quantity: string | null; unitPricePence: number | null; disposition: string };

/** Quantity × unit price, rounded once with the quote's own line rule; null when either is unknown. */
export function lineTotalPence(line: Pick<Priced, "quantity" | "unitPricePence">): number | null {
  if (line.unitPricePence === null || line.quantity === null) return null;
  try {
    const quantity = parseQuantity(line.quantity);
    if (quantity.scaled <= 0n) return null;
    return calculateNetLine(quantity, money(line.unitPricePence)).pence;
  } catch { return null; }
}

/** A combined row keeps the known sum, or stays blank when any chosen row has no line total. */
export function combinedPrice(lines: readonly Pick<Priced, "quantity" | "unitPricePence">[]): { unitPricePence: number | null; unpriced: number } {
  const totals = lines.map(lineTotalPence);
  const unpriced = totals.filter(total => total === null).length;
  const sum = totals.reduce<number>((all, total) => all + (total ?? 0), 0);
  return { unitPricePence: unpriced || sum > MAX_MONEY_PENCE ? null : sum, unpriced };
}

/** Rows that still count: not dismissed, and not replaced by a split or a combine. */
export function countsTowardTotal(line: Pick<Priced, "disposition">): boolean {
  return line.disposition === "accepted" || line.disposition === "proposed";
}

export function runningTotal(lines: readonly Priced[]) {
  const counted = lines.filter(countsTowardTotal), totals = counted.map(lineTotalPence);
  const unpriced = totals.filter(total => total === null).length;
  return { pence: totals.reduce<number>((all, total) => all + (total ?? 0), 0), counted: counted.length, unpriced, complete: counted.length > 0 && unpriced === 0 };
}

export function pounds(pence: number): string {
  const whole = Math.floor(pence / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/gu, ",");
  return `£${whole}.${String(pence % 100).padStart(2, "0")}`;
}

/** The typed price box: blank is "no price", anything else must be a plain pounds amount. */
export function priceFromText(text: string): { pence: number | null; error: string | null } {
  const typed = text.trim().replace(/^£/u, "");
  if (!typed) return { pence: null, error: null };
  // Commas only as thousands groups ("1,250.50"); "12,50" is refused, never read as £1,250.
  if (typed.includes(",") && !/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/u.test(typed)) return { pence: null, error: "Use commas only between thousands, for example 1,250.50." };
  const value = typed.replaceAll(",", "");
  try { return { pence: parsePoundsToPence(value), error: null }; }
  catch (error) { return { pence: null, error: (error as Error).message }; }
}

export function totalLabel(total: ReturnType<typeof runningTotal>): string {
  if (total.complete) return `Total so far ${pounds(total.pence)} · complete`;
  return `Total so far ${pounds(total.pence)} · incomplete: ${total.unpriced} ${total.unpriced === 1 ? "row needs" : "rows need"} a price`;
}

export function combineLabel(count: number, price: ReturnType<typeof combinedPrice>): string {
  return price.unitPricePence === null
    ? price.unpriced ? `Combined from ${count} rows · ${price.unpriced} had no price, so this needs a price` : `Combined from ${count} rows · the sum is too large, so this needs a price`
    : `Combined from ${count} rows · ${pounds(price.unitPricePence)}`;
}

export function splitBeforeLabel(parentTotal: number | null): string {
  return parentTotal === null ? "Before the split: this row had no price" : `Before the split: ${pounds(parentTotal)} for the whole row`;
}

const wholeJobQuestion = /^You said “(.+)”\. Add a price to each line, or put it on one line\.$/u;
/** The parser keeps a whole-job figure as a question; it is shown beside the total and never spread. */
export function wholeJobWords(questions: readonly { question: string }[]): string | null {
  for (const { question } of questions) { const match = wholeJobQuestion.exec(question); if (match) return match[1]!; }
  return null;
}
export function wholeJobLabel(words: string, total: ReturnType<typeof runningTotal>): [string, string] {
  return [`You said “${words}”. It isn't added to any row.`, `Rows add up to ${pounds(total.pence)}${total.complete ? "" : " so far"}`];
}

/** The note on a row made by Split or Combine, worked out from its saved parents so it survives a reload. */
export function originNote<L extends Priced & { scopeItemId: string; parentScopeItemIds: string[] }>(line: L, lines: readonly L[]): string | null {
  if (!line.parentScopeItemIds.length) return null;
  const parents = lines.filter(other => line.parentScopeItemIds.includes(other.scopeItemId));
  if (parents.length === 1 && parents[0]!.disposition === "split") return splitBeforeLabel(lineTotalPence(parents[0]!));
  if (parents.length > 1 && parents.every(parent => parent.disposition === "merged")) return combineLabel(parents.length, combinedPrice(parents));
  return null;
}
