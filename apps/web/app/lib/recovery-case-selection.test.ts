import { describe, expect, it } from "vitest";
import { selectedCaseAfterResponse } from "./recovery-case-selection";

const ids = { mine: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", older: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", theirs: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" };
const list = (...order: string[]) => order.map(id => ({ id }));

// The rule the workbench used before repair 11: select the last case that was not listed before the command. Kept here only to show why it was wrong.
const lastUnseen = (before: ReadonlySet<string>, next: readonly { id: string }[]) => next.filter(x => !before.has(x.id)).at(-1)?.id;

describe("which case the workbench selects after a command (M4-1-S-R repair 11, Sol P2-5)", () => {
  it("shows the old rule picking another browser's later case when that case is already in the refreshed list", () => {
    // This browser knew only the older case, opened `mine`; another browser opened `theirs` just afterwards, before this response's list was read.
    expect(lastUnseen(new Set([ids.older]), list(ids.older, ids.mine, ids.theirs))).toBe(ids.theirs);
  });
  it("selects exactly the case the command affected, whatever else the refreshed list holds", () => {
    expect(selectedCaseAfterResponse({ previous: ids.older, cases: list(ids.older, ids.mine, ids.theirs), affectedCaseId: ids.mine, selectAffected: true })).toBe(ids.mine);
    expect(selectedCaseAfterResponse({ previous: undefined, cases: list(ids.theirs, ids.mine), affectedCaseId: ids.mine, selectAffected: true })).toBe(ids.mine);
  });
  it("keeps the case the user chose when a command only updates it (the older case never jumps to a newer one)", () => {
    expect(selectedCaseAfterResponse({ previous: ids.older, cases: list(ids.older, ids.mine), affectedCaseId: ids.older, selectAffected: false })).toBe(ids.older);
    expect(selectedCaseAfterResponse({ previous: ids.older, cases: list(ids.older, ids.mine), selectAffected: false })).toBe(ids.older);
  });
  it("falls back to the newest listed case only when there is nothing valid to keep", () => {
    expect(selectedCaseAfterResponse({ previous: undefined, cases: list(ids.older, ids.mine), selectAffected: false })).toBe(ids.mine);
    expect(selectedCaseAfterResponse({ previous: ids.theirs, cases: list(ids.older, ids.mine), selectAffected: false })).toBe(ids.mine);
    expect(selectedCaseAfterResponse({ previous: undefined, cases: [], selectAffected: false })).toBeUndefined();
  });
  it("never selects an affected id that is not in the list it was given", () => {
    expect(selectedCaseAfterResponse({ previous: ids.older, cases: list(ids.older), affectedCaseId: ids.mine, selectAffected: true })).toBe(ids.older);
  });
});
