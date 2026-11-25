// V2-E7: the words on an E2 request row for its reminder and "unconfirmed" flag.
export type ReminderRow = { kind: "reminder" | "unconfirmed"; reason: "no_reply" | "link_expired" | null; recordedAt: string };

const londonTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric",
  month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

export function reminderLabel(row: ReminderRow) {
  if (row.kind === "reminder") return `Reminder sent ${londonTime.format(new Date(row.recordedAt))}`;
  return row.reason === "link_expired" ? "Unconfirmed: the reply link expired" : "Unconfirmed: no reply by the day before";
}
