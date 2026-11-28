import { describe, expect, it } from "vitest";
import { csvCell, restoreCsvCell } from "./csv-cell.js";

describe("spreadsheet text boundary", () => {
  for (const whitespace of ["", "\t", " ", "\r", " \t\r  "]) {
    it.each(["=", "+", "-", "@"])('neutralises %s after ' + JSON.stringify(whitespace), starter => {
      const source = `${whitespace}${starter}SUM(1,2) "label"\nnext line`;
      expect(csvCell(source)).toBe(`"'${source.replaceAll('"', '""')}"`);
      expect(restoreCsvCell(`'${source}`)).toBe(source);
    });
  }
  it("keeps negative numeric columns numeric, but protects numeric-looking text", () => {
    expect(csvCell(-150)).toBe('"-150"');
    expect(csvCell(-1.25)).toBe('"-1.25"');
    expect(csvCell("-150")).toBe('"\'-150"');
    expect(csvCell(0)).toBe('"0"');
  });
  it.each(["plain", "room = 1", "'", "'=SUM(1,2)", "''", "\tlabel", "\rlabel"])("round trips %s", source => {
    const cell = csvCell(source);
    expect(restoreCsvCell(cell.slice(1, -1).replaceAll('""', '"'))).toBe(source);
  });
});
