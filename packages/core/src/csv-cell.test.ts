import { describe, expect, it } from "vitest";
import { billingCsvCell, csvCell, restoreCsvCell } from "./csv-cell.js";

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

// Faithful evaluation of 0727_billing_export_delivery_once.sql's SQL expression:
// '"' || replace(CASE WHEN left(v,1)=ANY(ARRAY['=','+','-','@',chr(39),chr(9),chr(13)])
// THEN chr(39)||v ELSE v END, '"', '""') || '"'. No trimming occurs.
describe("DB-checked billing CSV parity", () => {
  it.each(["=SUM(1)", " =SUM(1)", "\t=SUM(1)", "\r=SUM(1)", "-5", "'x", "Paint walls", 'Paint "walls"',
    "+SUM(1)", "@SUM(1)", " +SUM(1)", " -SUM(1)", " @SUM(1)"])('matches the existing SQL expression for %j', value => {
    const sqlLeft = Array.from(value).slice(0, 1).join("");
    const sqlCase = ["=", "+", "-", "@", String.fromCharCode(39), String.fromCharCode(9), String.fromCharCode(13)].includes(sqlLeft)
      ? String.fromCharCode(39) + value : value;
    const sqlResult = '"' + sqlCase.split('"').join('""') + '"';
    expect(billingCsvCell(value)).toBe(sqlResult);
  });
  it("preserves the explicit difference for space-prefixed formulas", () => {
    expect(billingCsvCell(" =SUM(1)")).toBe('" =SUM(1)"');
    expect(csvCell(" =SUM(1)")).toBe('"\' =SUM(1)"');
  });
});
