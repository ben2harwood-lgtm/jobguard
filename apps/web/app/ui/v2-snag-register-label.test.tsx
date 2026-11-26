import React from "react";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { agreedLine, checkedTag, checkerOption, fixedTag, personName, samePerson, snagDue, snagOwnerLine, snagPeople,
  snagProblemText } from "./v2-snag-register-label";

const jordan = { kind: "crew" as const, crewId: "j", name: "Jordan", trade: "joiner" };
const sam = { kind: "crew" as const, crewId: "s", name: "Sam", trade: "decorator" };

describe("V2-G1 snag register wording", () => {
  it("renders the mock's card lines", () => {
    const snag = { owner: { name: "Jordan" }, assigneeLabel: "Old label", dueOn: "2026-12-04",
      events: [{ sequence: 1, kind: "fixed" as const }, { sequence: 2, kind: "checked" as const }], people: { 1: jordan, 2: sam } };
    const { fixer, checker } = snagPeople(snag);
    expect(renderToStaticMarkup(<p>{snagOwnerLine(snag)} | {fixedTag(fixer)} | {checkedTag(checker)}</p>))
      .toBe("<p>Owner: Jordan · due 4 Dec | Fixed: Jordan | Checked: Sam · second person</p>");
    expect(checkerOption("Jordan", true)).toBe("Jordan · fixed this snag");
    expect(checkerOption("Sam", false)).toBe("Sam · second person");
    expect(agreedLine("visit agreed with Alex")).toBe("Agreed to leave open at handover: visit agreed with Alex");
  });
  it("falls back to main's label, no owner, no date and unrecorded people", () => {
    expect(snagOwnerLine({ owner: null, assigneeLabel: "Dave (sparky)", dueOn: null })).toBe("Owner: Dave (sparky)");
    expect(snagOwnerLine({ owner: null, assigneeLabel: null, dueOn: null })).toBe("Owner: not set");
    expect(snagDue(null)).toBeNull();
    const { fixer, checker } = snagPeople({ events: [{ sequence: 1, kind: "fixed" }], people: {} });
    expect([fixedTag(fixer), checkedTag(checker)]).toEqual(["Fixed: person not recorded", "Checked: No"]);
    expect(personName({ kind: "builder" })).toBe("The builder");
  });
  it("a reopen clears the fixed and checked people", () => {
    const { fixer, checker } = snagPeople({ events: [{ sequence: 1, kind: "fixed" }, { sequence: 2, kind: "checked" }, { sequence: 3, kind: "reopened" }],
      people: { 1: jordan, 2: sam } });
    expect([fixer, checker]).toEqual([null, null]);
  });
  it("compares people as the database does", () => {
    expect(samePerson(jordan, { ...jordan })).toBe(true);
    expect(samePerson(jordan, sam)).toBe(false);
    expect(samePerson({ kind: "builder" }, { kind: "builder" })).toBe(true);
    expect(samePerson({ kind: "unknown" }, { kind: "unknown" })).toBe(false);
    expect(samePerson(null, jordan)).toBe(false);
    expect(snagProblemText("V2_SNAG_CHECKER_IS_FIXER")).toBe("Choose someone other than the person who fixed it.");
    expect(snagProblemText(undefined)).toBe("Not saved. Try again.");
  });
});
