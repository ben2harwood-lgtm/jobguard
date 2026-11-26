import { describe, expect, it } from "vitest";
import { diaryLinesForWeek, diaryRefusal, fridayContentFromPlan, londonDay } from "../src/v2-friday-update.js";
import { diaryShareCommandV1 } from "../src/v2-diary-share-repository.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const entry = (n: number, text: string, at: string) => ({ id: id(n), text, evidence: { serverReceivedAt: at } });
const marked = (...ns: number[]) => ns.map(n => ({ diaryEntryId: id(n), shared: true }));

describe("V2-DV1 diary lines for the Friday update", () => {
  it("uses the London week in GMT: Sunday 23:30 is the week before, Monday 00:10 is in", () => {
    const entries = [entry(1, "Old week", "2026-11-22T23:30:00Z"), entry(2, "Monday early", "2026-11-23T00:10:00Z"),
      entry(3, "Sunday late", "2026-11-29T23:30:00Z"), entry(4, "Next week", "2026-11-30T00:10:00Z")];
    expect(diaryLinesForWeek("2026-11-23", entries, marked(1, 2, 3, 4)).lines).toEqual(["Monday early", "Sunday late"]);
  });
  it("uses the London week in BST, not the UTC date", () => {
    // Sunday 21 June 23:30 BST is 22:30Z; Monday 22 June 00:10 BST is still Sunday 23:10Z.
    const entries = [entry(1, "Old week", "2026-06-21T22:30:00Z"), entry(2, "Monday early", "2026-06-21T23:10:00Z"),
      entry(3, "Sunday late", "2026-06-28T22:30:00Z"), entry(4, "Next week", "2026-06-28T23:10:00Z")];
    expect(londonDay("2026-06-21T23:10:00Z")).toBe("2026-06-22");
    expect(diaryLinesForWeek("2026-06-22", entries, marked(1, 2, 3, 4)).lines).toEqual(["Monday early", "Sunday late"]);
  });
  it("refuses amounts and long text with a reason, oldest first", () => {
    const entries = [entry(2, "Extra socket quoted at 85.00", "2026-11-25T11:00:00Z"),
      entry(1, "Tiles delivered and stacked in the hall", "2026-11-25T10:00:00Z"), entry(3, "x".repeat(401), "2026-11-25T12:00:00Z")];
    expect(diaryLinesForWeek("2026-11-23", entries, marked(1, 2, 3))).toEqual({ lines: ["Tiles delivered and stacked in the hall"],
      refused: [{ entryId: id(2), reason: "amount" }, { entryId: id(3), reason: "too_long" }] });
    expect(["£20", "20 pounds", "GBP 4", "  "].map(diaryRefusal)).toEqual(["amount", "amount", "amount", "empty"]);
  });
  it("never offers an unmarked or un-marked-again note", () => {
    const entries = [entry(1, "Marked", "2026-11-25T10:00:00Z"), entry(2, "Never marked", "2026-11-25T10:00:00Z"),
      entry(3, "Unmarked again", "2026-11-25T10:00:00Z")];
    expect(diaryLinesForWeek("2026-11-23", entries, [...marked(1), { diaryEntryId: id(3), shared: false }]).lines).toEqual(["Marked"]);
  });
  it("puts plan lines first and caps This week at 30 lines", () => {
    const tasks = Array.from({ length: 29 }, (_, n) => ({ title: `Task ${n}`, scheduledDate: "2026-11-24" }));
    const content = fridayContentFromPlan("2026-11-23", tasks, ["Diary one", "Diary two"]);
    expect(content.thisWeek).toHaveLength(30);
    expect(content.thisWeek.slice(-2)).toEqual(["Task 28", "Diary one"]);
    expect(fridayContentFromPlan("2026-11-23", [], ["Paid £5", " Kept "]).thisWeek).toEqual(["Kept"]);
  });
  it("accepts only the versioned share command", () => {
    const body = { version: "v2-diary-share-command.v1", commandId: id(9), diaryEntryId: id(1), shared: true };
    expect(diaryShareCommandV1.parse(body)).toEqual(body);
    expect(diaryShareCommandV1.safeParse({ ...body, text: "x" }).success).toBe(false);
    expect(diaryShareCommandV1.safeParse({ ...body, shared: "yes" }).success).toBe(false);
  });
});
