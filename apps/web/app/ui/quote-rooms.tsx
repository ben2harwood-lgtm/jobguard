// V2-SQ-E: the quote laid out by room. Pure helpers shared by the quote editor, its preview and the customer's quote page.
import { evaluateDraftQuote, M1_QUOTE_POLICY, roomTotals, type QuoteDocument, type QuoteLine, type QuoteSection } from "@jobguard/core";

export type RoomMode = QuoteSection["mode"];
export const OTHER_WORK = "Other work";
const roomLabel = (name: string | undefined) => (name ?? "").trim().slice(0, 100).trim() || OTHER_WORK;

/** Rooms in first-seen order, with every line (included or not) shown under its room. */
export function roomGroups(lines: readonly QuoteLine[], roomOf: Readonly<Record<string, string>>): { name: string; lines: QuoteLine[] }[] {
  const groups = new Map<string, QuoteLine[]>();
  for (const line of lines) {
    const name = roomLabel(roomOf[line.scopeItemId]);
    groups.set(name, [...(groups.get(name) ?? []), line]);
  }
  return [...groups].map(([name, rows]) => ({ name, lines: rows }));
}

/** The layout saved with the draft revision: included lines only, rooms in first-seen order. None when no line has a room. */
export function quoteSectionsFor(lines: readonly QuoteLine[], roomOf: Readonly<Record<string, string>>, modes: Readonly<Record<string, RoomMode>>): QuoteSection[] | undefined {
  const included = lines.filter(line => line.included);
  if (!included.some(line => roomOf[line.scopeItemId]?.trim())) return undefined;
  return roomGroups(included, roomOf).map(group => ({ name: group.name, mode: modes[group.name] ?? "itemised", scopeItemIds: group.lines.map(line => line.scopeItemId) }));
}

/** Rooms and modes read back from a saved revision. */
export function savedLayout(sections: readonly QuoteSection[] | undefined): { roomOf: Record<string, string>; modes: Record<string, RoomMode> } {
  const roomOf: Record<string, string> = {}, modes: Record<string, RoomMode> = {};
  for (const section of sections ?? []) {
    modes[section.name] = section.mode;
    for (const id of section.scopeItemIds) roomOf[id] = section.name;
  }
  return { roomOf, modes };
}

/** The editor's live room figure: the sum of the room's included line nets, as the saved quote will compute it. */
export function editorRoomTotal(lines: readonly QuoteLine[]): number {
  return evaluateDraftQuote({ currency: "GBP", taxPolicyVersion: M1_QUOTE_POLICY.taxPolicyVersion, lines: lines.filter(line => line.included) }).totals.net.pence;
}

/** The quote's lines as the customer sees them. Without rooms this is the same list as before. */
export function QuoteLinesByRoom({ document, gbp }: { document: Readonly<QuoteDocument>; gbp: (pence: number) => string }) {
  const d = document;
  if (!d.sections) return <ul>{d.lines.map(line=><li key={line.scopeItemId}>{line.description}: {line.quantity} {line.unit} — {gbp(line.netPence)}</li>)}</ul>;
  return <>{roomTotals(d).map(room => <section key={room.name} className="quote-room" aria-label={room.name} data-testid="quote-room">
    <h3>{room.name}</h3>
    <ul>{room.lines.map(line => <li key={line.scopeItemId}>{room.mode === "itemised" ? `${line.description}: ${line.quantity} ${line.unit} — ${gbp(line.netPence)}` : `${line.description}: ${line.quantity} ${line.unit}`}</li>)}</ul>
    {room.mode === "room_total" && <p data-testid="quote-room-total">Room total {gbp(room.totalPence)}</p>}
  </section>)}</>;
}
