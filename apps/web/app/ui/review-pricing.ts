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

/** The rows a combine may take: two or more, every one still proposed or accepted. A dismissed, split-away or
 * merged-away row is refused, so no row's money is counted twice (for example a split parent and its parts). */
export function mergeableRows<T extends { id: string; disposition: string }>(lines: readonly T[], selectedIds: readonly string[]): T[] | null {
  const chosen = lines.filter(line => selectedIds.includes(line.id));
  return chosen.length >= 2 && chosen.every(countsTowardTotal) ? chosen : null;
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
  const room = (line as L & { room?: string; description?: string }).room;
  // A one-price room row says what the rows came to beside the room price, never "Combined from N rows · £sum".
  if (parents.length > 1 && parents.every(parent => parent.disposition === "merged") && room !== undefined
    && (line as L & { description?: string }).description === onePriceDescription(room) && line.unitPricePence !== null)
    return onePriceNote(combinedPrice(parents), line.unitPricePence);
  if (parents.length > 1 && parents.every(parent => parent.disposition === "merged")) return combineLabel(parents.length, combinedPrice(parents));
  return null;
}

// V2-SQ-D: rooms on the review. Only `room` and `category` are stored; room order is derived from row order.
export const WHOLE_JOB = "Whole job";
type RoomRow = Priced & { id: string; scopeItemId: string; room: string; description: string; parentScopeItemIds: string[] };

/** Rooms in the order they were first spoken (row order), with "Whole job" last; extra rooms (session only) after. */
export function roomsOf(lines: readonly Pick<RoomRow, "room">[], extra: readonly string[] = []): string[] {
  const seen: string[] = [];
  for (const name of [...lines.map(line => line.room), ...extra]) if (name !== WHOLE_JOB && !seen.includes(name)) seen.push(name);
  return lines.some(line => line.room === WHOLE_JOB) || extra.includes(WHOLE_JOB) ? [...seen, WHOLE_JOB] : seen;
}

/** A room's subtotal with the quote's own line rule; the job total is the sum of these to the penny. */
export function roomTotal(lines: readonly (Priced & Pick<RoomRow, "room">)[], room: string) {
  return runningTotal(lines.filter(line => line.room === room));
}

export function roomTotalLabel(total: ReturnType<typeof runningTotal>): string {
  if (!total.counted) return "No rows yet";
  return total.complete ? pounds(total.pence) : `${pounds(total.pence)} · incomplete: ${total.unpriced} ${total.unpriced === 1 ? "row needs" : "rows need"} a price`;
}

/** A room name as the review contract stores it: trimmed, 1 to 100 characters. */
export function roomName(text: string): string | null {
  const name = text.trim();
  return name.length >= 1 && name.length <= 100 ? name : null;
}

/** Moving a row changes only its room. */
export function moveToRoom<L extends Pick<RoomRow, "id" | "room">>(lines: readonly L[], id: string, room: string): L[] {
  return lines.map(line => line.id === id ? { ...line, room } : line);
}

/** Renaming a room, or merging it into another, moves every row in it and keeps their order. */
export function renameRoom<L extends Pick<RoomRow, "room">>(lines: readonly L[], from: string, to: string): L[] {
  return lines.map(line => line.room === from ? { ...line, room: to } : line);
}

export const onePriceDescription = (room: string) => `${room}: all work as described`.slice(0, 500);

/**
 * "One price for the room". One counted row: its price is set in place, as one item, so the room comes to the
 * typed figure. Two or more: the existing combine, then the typed figure, so there is one row and one price.
 * The combined row records every row it absorbed as its parents (a merge).
 */
export function onePriceForRoom<L extends RoomRow & { origin: "proposal" | "human"; category: string; unit: string | null;
  dismissalReason: string | null; sourceExcerpt: string | null }>(lines: readonly L[], room: string, pence: number, newId: () => string): L[] {
  const absorbed = lines.filter(line => line.room === room && countsTowardTotal(line));
  if (!absorbed.length) return [...lines];
  if (absorbed.length === 1) return lines.map(line => line.id === absorbed[0]!.id
    ? { ...line, quantity: "1", unit: "item", unitPricePence: pence, disposition: "accepted" } : line);
  const first = absorbed[0]!;
  const child = { ...first, id: newId(), scopeItemId: newId(), origin: "human" as const, description: onePriceDescription(room), room,
    quantity: "1", unit: "item", unitPricePence: pence, disposition: "accepted", dismissalReason: null,
    parentScopeItemIds: absorbed.map(line => line.scopeItemId), sourceExcerpt: null } as L;
  return lines.map(line => absorbed.includes(line) ? { ...line, disposition: "merged" } : line).concat(child);
}

/** The note on a one-price room row: what the rows came to, beside the room price, never a second total. */
export function onePriceNote(itemised: ReturnType<typeof combinedPrice>, pence: number): string {
  return itemised.unitPricePence === null ? `Itemised incomplete · room price ${pounds(pence)}` : `Itemised came to ${pounds(itemised.unitPricePence)} · room price ${pounds(pence)}`;
}
