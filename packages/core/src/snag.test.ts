import { describe, expect, it } from "vitest";
import { SnagError, allowedSnagEvents, buildSnagListV1, deriveSnagState, isSnagOverdue, parseSnag, snagCommandV1, snagEventCommandV1, snagPhotoCommandV1, ukCalendarDate, type SnagRow } from "./snag.js";

const id = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const add = { version: "snag.v1", action: "add", commandId: id(1), snagId: id(2), title: "  Fictional loose socket faceplate  " };

describe("QW-4 snag state", () => {
  it("is open with no events, and follows the latest event by sequence", () => {
    expect(deriveSnagState([])).toBe("open");
    expect(deriveSnagState([{ sequence: 1, kind: "fixed" }])).toBe("fixed");
    expect(deriveSnagState([{ sequence: 2, kind: "checked" }, { sequence: 1, kind: "fixed" }])).toBe("checked");
    expect(deriveSnagState([{ sequence: 1, kind: "fixed" }, { sequence: 2, kind: "checked" }, { sequence: 3, kind: "reopened" }])).toBe("open");
    expect(deriveSnagState([{ sequence: 1, kind: "fixed" }, { sequence: 2, kind: "reopened" }, { sequence: 3, kind: "fixed" }])).toBe("fixed");
  });
  it("allows only fixed when open, checked or reopened when fixed, and reopened when checked", () => {
    expect(allowedSnagEvents("open")).toEqual(["fixed"]);
    expect(allowedSnagEvents("fixed")).toEqual(["checked", "reopened"]);
    expect(allowedSnagEvents("checked")).toEqual(["reopened"]);
  });
});

describe("QW-4 overdue uses the UK calendar date", () => {
  it("rolls the date at UK midnight, in winter and in summer time", () => {
    expect(ukCalendarDate(new Date("2026-01-15T23:59:59Z"))).toBe("2026-01-15");
    expect(ukCalendarDate(new Date("2026-01-16T00:00:00Z"))).toBe("2026-01-16");
    // British Summer Time: 23:00Z is already the next day in the UK.
    expect(ukCalendarDate(new Date("2026-07-15T22:59:59Z"))).toBe("2026-07-15");
    expect(ukCalendarDate(new Date("2026-07-15T23:00:00Z"))).toBe("2026-07-16");
    expect(() => ukCalendarDate(new Date(Number.NaN))).toThrow(SnagError);
  });
  it("is overdue only while open and only after the due date", () => {
    const now = new Date("2026-07-15T23:30:00Z"); // 16 July in the UK
    expect(isSnagOverdue("2026-07-15", "open", now)).toBe(true);
    expect(isSnagOverdue("2026-07-16", "open", now)).toBe(false);
    expect(isSnagOverdue(null, "open", now)).toBe(false);
    expect(isSnagOverdue("2026-07-01", "fixed", now)).toBe(false);
    expect(isSnagOverdue("2026-07-01", "checked", now)).toBe(false);
    expect(isSnagOverdue("2026-07-15", "open", new Date("2026-07-15T22:00:00Z"))).toBe(false);
  });
});

describe("QW-4 command validation", () => {
  it("trims details and fills omitted optional fields with null", () => {
    expect(parseSnag(snagCommandV1, { ...add, location: " Fictional kitchen ", dueOn: "2026-12-01" })).toEqual({
      version: "snag.v1", action: "add", commandId: id(1), snagId: id(2), title: "Fictional loose socket faceplate",
      location: "Fictional kitchen", assigneeLabel: null, dueOn: "2026-12-01" });
    expect(parseSnag(snagCommandV1, { ...add, action: "revise", expectedRevision: 1, assigneeLabel: "Dave (sparky)" }).assigneeLabel).toBe("Dave (sparky)");
  });
  it.each([
    ["an empty title", { ...add, title: "   " }],
    ["a title over 200 characters", { ...add, title: "x".repeat(201) }],
    ["a location over 120 characters", { ...add, location: "x".repeat(121) }],
    ["an assignee over 120 characters", { ...add, assigneeLabel: "x".repeat(121) }],
    ["a control character", { ...add, title: "Fictional\u0007snag" }],
    ["an impossible date", { ...add, dueOn: "2026-02-30" }],
    ["a date with a time", { ...add, dueOn: "2026-02-01T00:00:00Z" }],
    ["an unknown field", { ...add, membershipId: id(3) }],
    ["a non-uuid command id", { ...add, commandId: "1" }],
    ["a revise without its expected revision", { ...add, action: "revise" }],
    ["a wrong version", { ...add, version: "snag.v2" }],
  ])("refuses %s", (_name, raw) => {
    expect(() => parseSnag(snagCommandV1, raw)).toThrow(new SnagError("INVALID_SNAG_INPUT"));
  });
  it("accepts 200 characters exactly, counting characters rather than UTF-16 units", () => {
    expect(parseSnag(snagCommandV1, { ...add, title: "x".repeat(200) }).title).toHaveLength(200);
    expect(parseSnag(snagCommandV1, { ...add, title: "🔧".repeat(200) }).title).toBe("🔧".repeat(200));
  });
  it("takes only the three events and the two photo steps", () => {
    for (const action of ["mark_fixed", "mark_checked", "reopen"]) expect(parseSnag(snagEventCommandV1, { version: "snag-event.v1", commandId: id(1), action }).action).toBe(action);
    expect(() => parseSnag(snagEventCommandV1, { version: "snag-event.v1", commandId: id(1), action: "close" })).toThrow(SnagError);
    expect(() => parseSnag(snagEventCommandV1, { version: "snag-event.v1", commandId: id(1), action: "mark_checked", actorMembershipId: id(2) })).toThrow(SnagError);
    expect(parseSnag(snagPhotoCommandV1, { version: "snag-photo.v1", action: "begin", commandId: id(1), fixture: "completion-photo" }).action).toBe("begin");
    expect(parseSnag(snagPhotoCommandV1, { version: "snag-photo.v1", action: "finalize", commandId: id(1), uploadId: id(2), objectVersionId: "v" }).action).toBe("finalize");
    expect(() => parseSnag(snagPhotoCommandV1, { version: "snag-photo.v1", action: "begin", commandId: id(1), fixture: "real-camera" })).toThrow(SnagError);
  });
});

describe("QW-4 read model", () => {
  const row = (n: number, extra: Partial<SnagRow> = {}): SnagRow => ({ id: id(n), revision: 1, title: `Fictional snag ${n}`, location: null, assigneeLabel: null,
    dueOn: null, createdAt: `2026-07-0${n}T10:00:00.000Z`, createdByMembershipId: id(9), events: [], photos: [], ...extra });
  it("orders by creation, derives each state and counts open, fixed, checked and overdue", () => {
    const list = buildSnagListV1(id(100), new Date("2026-07-10T12:00:00Z"), [
      row(3, { events: [{ sequence: 2, kind: "checked", actorMembershipId: id(8), recordedAt: "x" }, { sequence: 1, kind: "fixed", actorMembershipId: id(9), recordedAt: "x" }] }),
      row(1, { dueOn: "2026-07-09", photos: [{ evidenceId: id(5), position: 2, sha256: "b".repeat(64), receivedAt: "x", withdrawn: false }, { evidenceId: id(4), position: 1, sha256: "a".repeat(64), receivedAt: "x", withdrawn: false }] }),
      row(2, { dueOn: "2026-07-09", events: [{ sequence: 1, kind: "fixed", actorMembershipId: id(9), recordedAt: "x" }] }),
    ]);
    expect(list.snags.map(s => [s.id, s.state, s.overdue])).toEqual([[id(1), "open", true], [id(2), "fixed", false], [id(3), "checked", false]]);
    expect(list.snags[0]!.photos.map(p => p.position)).toEqual([1, 2]);
    expect(list.snags[2]!.events.map(e => e.kind)).toEqual(["fixed", "checked"]);
    expect(list.snags[1]!.nextActions).toEqual(["checked", "reopened"]);
    expect(list.counts).toEqual({ open: 1, fixed: 1, checked: 1, overdue: 1 });
    expect(list).toMatchObject({ version: "snag-list.v1", environment: "synthetic_demo", jobId: id(100), asOf: "2026-07-10", realExternalActions: 0 });
  });
});
