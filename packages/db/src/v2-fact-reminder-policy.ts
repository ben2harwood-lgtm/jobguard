// V2-E7 timing rule for one E2 reply request. Pure: the repository passes the
// stored rows and the run's clock. All times are instants in milliseconds.

const DAY = 86_400_000;
const HOUR = 3_600_000;
const london = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", hourCycle: "h23",
  year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

function parseDate(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date);
  if (!match) throw new Error("REMINDER_DATE_INVALID");
  const at = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (new Date(at).toISOString().slice(0, 10) !== date) throw new Error("REMINDER_DATE_INVALID");
  return at;
}

// The instant of 08:00 Europe/London on a calendar date. London is UTC or UTC+1,
// and clocks change at 01:00 UTC, so 08:00 local is never skipped or repeated.
export function londonEight(date: string) {
  const guess = parseDate(date) + 8 * HOUR;
  const parts = Object.fromEntries(london.formatToParts(new Date(guess)).map(part => [part.type, part.value]));
  const wall = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  return guess - (wall - guess);
}

export function daysBefore(date: string, days: number) {
  return new Date(parseDate(date) - days * DAY).toISOString().slice(0, 10);
}

export type ReminderInput = {
  neededBy: string;
  requestedAt: number;
  expiresAt: number;
  // A link or pasted reply exists for the request's fact at the request's fact version.
  replied: boolean;
  cancelled: boolean;
  // E2's app.v2_fact_reply_current: same fact version, no newer request, recipient unchanged.
  current: boolean;
  factOpen: boolean;
  has: { reminder: boolean; unconfirmed: boolean };
};

export type ReminderPlan = { remind: false | { dueAt: number };
  unconfirmed: null | { reason: "no_reply" | "link_expired"; dueAt: number } };

// At most one reminder, inside its window, and one "unconfirmed" flag from 08:00
// London the day before the needed-by date. A reply, a cancel or a changed
// question stops both. A run that first happens after the reminder window sends
// no reminder: it is too late, and the flag takes over.
export function reminderPlan(input: ReminderInput, now: number): ReminderPlan {
  const none: ReminderPlan = { remind: false, unconfirmed: null };
  if (input.replied || input.cancelled || !input.current || !input.factOpen) return none;
  const flagAt = londonEight(daysBefore(input.neededBy, 1));
  // Proposed default from the Q46 packet, not from rev 1.3: for Ben to confirm (AGENTS §1).
  const remindAt = Math.max(londonEight(daysBefore(input.neededBy, 2)), input.requestedAt + 24 * HOUR);
  const expired = input.expiresAt <= now;
  return {
    remind: !input.has.reminder && !expired && now >= remindAt && now < flagAt ? { dueAt: remindAt } : false,
    unconfirmed: !input.has.unconfirmed && now >= flagAt ? { reason: expired ? "link_expired" : "no_reply", dueAt: flagAt } : null,
  };
}
