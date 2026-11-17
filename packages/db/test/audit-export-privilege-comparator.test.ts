import { describe, expect, it } from "vitest";
import { compare, type Subject } from "./audit-export-privilege-comparator.js";

const grant = "grant fixture_reader SELECT";
const option = `${grant} WITH GRANT OPTION`;
const table = (overrides: Partial<Subject> = {}): Subject => ({
  kind: "table", oid: "101", name: "app.comparator_fixture", facts: ["owner fixture_owner"],
  columns: ["first", "second"], columnGrants: [], policies: {}, ...overrides,
});
const column = (fact: string, name = "first") => ({ column: name, fact });

describe("audit-export permission comparison against earlier effective coverage", () => {
  // privilegeFacts expands WITH GRANT OPTION into both the base and grantable facts.
  it.each([
    { name: "table right reduced to a column", facts: [grant], columnGrants: [], now: [column(grant)] },
    { name: "table right retained alongside a redundant column", facts: [grant], columnGrants: [], now: [column(grant)], retain: true },
    { name: "grantable table right reduced to a plain column", facts: [grant, option], columnGrants: [], now: [column(grant)] },
    { name: "grantable table right reduced to a grantable column", facts: [grant, option], columnGrants: [], now: [column(grant), column(option)] },
    { name: "same column right retained", facts: [], columnGrants: [column(grant)], now: [column(grant)] },
    { name: "grantable column reduced to plain on that column", facts: [], columnGrants: [column(grant), column(option)], now: [column(grant)] },
  ])("does not alarm for $name", ({ facts, columnGrants, now, ...rest }) => {
    const before = table({ facts, columnGrants });
    expect(compare([before], [table({ facts: "retain" in rest ? facts : [], columnGrants: now })])).toEqual([]);
  });

  it.each([
    { name: "previously absent column right", facts: [], columns: [], added: column(grant) },
    { name: "different grantee despite old table coverage", facts: [grant], columns: [], added: column("grant fixture_writer SELECT") },
    { name: "different privilege despite old table coverage", facts: [grant], columns: [], added: column("grant fixture_reader UPDATE") },
    { name: "column grant-option escalation over a plain table right", facts: [grant], columns: [], added: column(option) },
    { name: "column grant-option escalation over the same plain column", facts: [], columns: [column(grant)], added: column(option) },
    { name: "different column despite an earlier grantable column", facts: [], columns: [column(grant), column(option)], added: column(grant, "second") },
  ])("alarms for $name", ({ facts, columns, added }) => {
    const before = table({ facts, columnGrants: columns });
    const now = table({ facts, columnGrants: [...columns, added] });
    expect(compare([before], [now])).toEqual([`table ${now.name}: + column ${added.column} ${added.fact}`]);
  });

  it.each([
    { name: "previously absent table right", facts: [], old: [], added: grant },
    { name: "column to table expansion", facts: [], old: [column(grant)], added: grant },
    { name: "new table grantee", facts: [grant], old: [], added: "grant fixture_writer SELECT" },
    { name: "new table privilege", facts: [grant], old: [], added: "grant fixture_reader UPDATE" },
    { name: "table grant-option escalation", facts: [grant], old: [], added: option },
  ])("alarms for $name", ({ facts, old, added }) => {
    const before = table({ facts, columnGrants: old });
    const now = table({ facts: [...before.facts, added], columnGrants: old });
    expect(compare([before], [now])).toEqual([`table ${now.name}: + ${added}`]);
  });

  it("does not borrow coverage from another table", () => {
    const before = table();
    const unrelated = table({ oid: "202", name: "app.other_fixture", facts: [grant, option] });
    expect(compare([before, unrelated], [table({ columnGrants: [column(grant)] }), unrelated]))
      .toEqual([`table ${before.name}: + column first ${grant}`]);
  });
});
