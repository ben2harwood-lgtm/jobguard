import { describe, expect, it } from "vitest";
import { isHireTaskLinked, toggleHireTask } from "./v2-hire-links";

const old = { quoteRevisionId: "rev-1", scopeItemId: "scope-a", templateTaskKey: "tile" };
const current = { ...old, quoteRevisionId: "rev-2" };
const other = { quoteRevisionId: "rev-2", scopeItemId: "scope-b", templateTaskKey: "paint" };

describe("V2-K8 hire task links across quote revisions", () => {
  it("shows a task linked on an older revision as linked on the current plan", () => {
    expect(isHireTaskLinked([old], current)).toBe(true);
    expect(isHireTaskLinked([old], other)).toBe(false);
  });
  it("unticking removes the older revision's link, so it stops driving reminders", () => {
    expect(toggleHireTask([old, other], current, false)).toEqual([other]);
  });
  it("ticking replaces the older link with the current task instead of adding a second", () => {
    expect(toggleHireTask([old], current, true)).toEqual([current]);
    expect(toggleHireTask([], current, true)).toEqual([current]);
  });
});
