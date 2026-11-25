import { describe, expect, it } from "vitest";
import { calendarFeedCommandV1, calendarFeedSnapshot, calendarFeedTokenHash, calendarFeedTokenPattern, icsFold, icsText,
  newCalendarFeedToken, renderCalendarFeed, type CalendarFeedSnapshot } from "../src/v2-calendar-feed.js";

const id = "44444444-4444-4444-8444-444444444444";
const other = "55555555-5555-4555-8555-555555555555";

/** A strict RFC 5545 reader for the test: unfold, then split each content line into name, params and value. */
function parseIcs(text: string) {
  expect(text.endsWith("\r\n")).toBe(true);
  expect(text.replace(/\r\n/gu, "")).not.toMatch(/[\r\n]/u);
  for (const physical of text.slice(0, -2).split("\r\n")) expect(Buffer.byteLength(physical)).toBeLessThanOrEqual(75);
  const lines = text.slice(0, -2).replace(/\r\n[ \t]/gu, "").split("\r\n");
  const stack: { name: string; props: { name: string; params: string; value: string }[] }[] = [];
  const done: typeof stack = [];
  for (const line of lines) {
    const match = /^([A-Z][A-Z0-9-]*)((?:;[A-Z-]+=[^:;]*)*):(.*)$/u.exec(line);
    expect(match, line).not.toBeNull();
    const [, name, params, value] = match!;
    if (name === "BEGIN") stack.push({ name: value!, props: [] });
    else if (name === "END") { const top = stack.pop(); expect(top?.name).toBe(value); done.push(top!); }
    else stack.at(-1)!.props.push({ name: name!, params: params!, value: value! });
  }
  expect(stack).toHaveLength(0);
  return { calendar: done.find(item => item.name === "VCALENDAR")!, events: done.filter(item => item.name === "VEVENT") };
}
const unescape = (value: string) => value.replace(/\\([\\;,nN])/gu, (_, c: string) => c.toLowerCase() === "n" ? "\n" : c);
const task = (overrides: Partial<CalendarFeedSnapshot["tasks"][number]> = {}) => ({ quoteRevisionId: id, scopeItemId: id,
  templateTaskKey: "tile-fix", title: "Fix tiles", trade: "Tiling", date: "2026-12-31", durationMinutes: 90,
  assignee: "Fictional Tess Tile", ...overrides });

describe("V2-K2A calendar feed", () => {
  it("renders valid all-day events with a stable UID and no injected properties", () => {
    const hostile = "Grout\r\nDTSTART:20990101T000000Z\nSUMMARY:pwned; a, b \\ c";
    const snapshot: CalendarFeedSnapshot = { version: "calendar-feed-snapshot.v1", address: "42 Make-Believe Mews, Sampleford, ZY1 0AA",
      tasks: [task({ title: hostile, assignee: hostile }), task({ scopeItemId: other, title: "Paint hall ".repeat(20) + "é€😀", assignee: null })] };
    const text = renderCalendarFeed(snapshot, "20261125T200000Z");
    const { calendar, events } = parseIcs(text);
    expect(calendar.props.find(prop => prop.name === "VERSION")?.value).toBe("2.0");
    expect(calendar.props.some(prop => prop.name === "PRODID")).toBe(true);
    expect(events).toHaveLength(2);
    for (const event of events) {
      const names = event.props.map(prop => prop.name);
      expect(names.filter(name => name === "DTSTART")).toHaveLength(1);
      expect(names.filter(name => name === "SUMMARY")).toHaveLength(1);
      expect(event.props.find(prop => prop.name === "DTSTART")).toMatchObject({ params: ";VALUE=DATE", value: "20261231" });
      expect(event.props.find(prop => prop.name === "DTEND")).toMatchObject({ params: ";VALUE=DATE", value: "20270101" });
      expect(event.props.find(prop => prop.name === "DTSTAMP")?.value).toBe("20261125T200000Z");
    }
    const [first, second] = events;
    expect(unescape(first!.props.find(prop => prop.name === "SUMMARY")!.value)).toBe(`${hostile.replace("\r\n", "\n")} (Tiling)`);
    expect(first!.props.find(prop => prop.name === "UID")!.value).toBe(`${id}.${id}.tile-fix@calendar.jobguard-v2.invalid`);
    expect(unescape(first!.props.find(prop => prop.name === "LOCATION")!.value)).toBe(snapshot.address);
    expect(unescape(second!.props.find(prop => prop.name === "SUMMARY")!.value)).toContain("é€😀");
    expect(unescape(second!.props.find(prop => prop.name === "DESCRIPTION")!.value)).toContain("Assignee: Not set");
    expect(renderCalendarFeed(snapshot, "later")).toBe(renderCalendarFeed(snapshot, "nonsense"));
    expect(text).not.toMatch(/£|\d+\.\d{2}\b/u);
  });

  it("an empty plan is still a valid calendar, and no address means no LOCATION", () => {
    const { events } = parseIcs(renderCalendarFeed({ version: "calendar-feed-snapshot.v1", address: null, tasks: [] }, "20261125T200000Z"));
    expect(events).toHaveLength(0);
    const one = parseIcs(renderCalendarFeed({ version: "calendar-feed-snapshot.v1", address: null, tasks: [task()] }, "20261125T200000Z"));
    expect(one.events[0]!.props.some(prop => prop.name === "LOCATION")).toBe(false);
  });

  it("escapes and folds by RFC 5545", () => {
    expect(icsText("a\\b;c,d\ne\r\nf\rg\u0007")).toBe("a\\\\b\\;c\\,d\\ne\\nf\\ng");
    const folded = icsFold(`SUMMARY:${"€".repeat(40)}`);
    expect(folded.split("\r\n ").join("")).toBe(`SUMMARY:${"€".repeat(40)}`);
    for (const line of folded.split("\r\n")) expect(Buffer.byteLength(line)).toBeLessThanOrEqual(75);
  });

  it("copies dated tasks only, with text as written and nothing else", () => {
    const snapshot = calendarFeedSnapshot({ quoteRevisionId: id, tasks: [
      { key: "a", scopeItemId: id, title: "Dated", trade: "Tiling", durationMinutes: 60, scheduledDate: "2026-12-01", assignee: "Tess" },
      { key: "b", scopeItemId: id, title: "Undated", trade: "Tiling", durationMinutes: 60, scheduledDate: null, assignee: "Tess" },
      { key: "c", scopeItemId: id, title: "No date field", trade: "Decorating", durationMinutes: 60 },
    ] }, null);
    expect(snapshot.tasks).toEqual([{ quoteRevisionId: id, scopeItemId: id, templateTaskKey: "a", title: "Dated",
      trade: "Tiling", date: "2026-12-01", durationMinutes: 60, assignee: "Tess" }]);
  });

  it("makes 256-bit URL-safe tokens and refuses commands that do not fit their action", () => {
    const token = newCalendarFeedToken();
    expect(token).toMatch(calendarFeedTokenPattern);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
    expect(newCalendarFeedToken()).not.toBe(token);
    expect(calendarFeedTokenHash(token)).toMatch(/^[a-f0-9]{64}$/u);
    const base = { version: "calendar-feed-command.v1", commandId: id, feedId: other };
    expect(calendarFeedCommandV1.safeParse({ ...base, action: "create", expectedVersion: 0 }).success).toBe(true);
    expect(calendarFeedCommandV1.safeParse({ ...base, action: "create", expectedVersion: 1 }).success).toBe(false);
    expect(calendarFeedCommandV1.safeParse({ ...base, action: "refresh", expectedVersion: 0 }).success).toBe(false);
    expect(calendarFeedCommandV1.safeParse({ ...base, action: "revoke", expectedVersion: 2, token }).success).toBe(false);
  });
});
