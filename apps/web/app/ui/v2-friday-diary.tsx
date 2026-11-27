import React from "react";

/** V2-DV1 wording for the "From your diary this week" card. Pure: tested with renderToStaticMarkup. */
export type FridayDiaryRow = { id: string; text: string; receivedAt: string; shared: boolean; refused: "amount" | "too_long" | "empty" | null };
export const diaryCardTitle = "From your diary this week";
export const diaryShareToggle = "Customer can see this";
export const diaryCardNote = "Marked notes are added when you prepare the update. You can still edit or remove them before sending.";
export const diaryEmpty = "No diary notes this week.";
export function diaryRefusalLabel(reason: FridayDiaryRow["refused"]) {
  return reason === "amount" ? "Has an amount: leave amounts out of the customer update"
    : reason === "too_long" ? "Too long for one line" : reason === "empty" ? "Empty note" : null;
}
const time = new Intl.DateTimeFormat("en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
export function diaryTime(instant: string) { return time.format(new Date(instant)); }

export function FridayDiaryList({ entries, busy, onToggle }: { entries: readonly FridayDiaryRow[]; busy: boolean;
  onToggle: (entry: FridayDiaryRow, shared: boolean) => void }) {
  return <div className="form">
    <p>{diaryCardNote}</p>
    {entries.length ? <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>{entries.map(entry => {
      const refusal = diaryRefusalLabel(entry.refused);
      return <li key={entry.id} data-testid="diary-note" style={{ overflowWrap: "anywhere", marginBottom: 12 }}>
        <p><time dateTime={entry.receivedAt}>{diaryTime(entry.receivedAt)}</time> · {entry.text}</p>
        <label style={{ minHeight: 44, display: "flex", alignItems: "center", gap: 8 }}>
          <input type="checkbox" checked={entry.shared} disabled={busy} onChange={event => onToggle(entry, event.target.checked)}/>
          {diaryShareToggle}
        </label>
        {refusal && <p role="note">{refusal}</p>}
      </li>;
    })}</ul> : <p>{diaryEmpty}</p>}
  </div>;
}
