import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { renderBillingExport, renderQuotePdf, quotePdfText, snapshotQuote } from "@jobguard/core";
import { extractCaptureFixture } from "../capture.js";
import { parseCaptureFixture } from "../capture-fixture-parser.js";

const cases = JSON.parse(readFileSync(new URL("./corpus/RT-07-injection.v1.json", import.meta.url), "utf8")) as { id: string; transcript: string }[];
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("RT-07 zero-spend capture boundary", () => {
  it("all attack strings remain source data through the real fixture gateway, with trusted source identity and no network action", async () => {
    const network = vi.fn(() => { throw new Error("Unexpected external action"); });
    vi.stubGlobal("fetch", network);
    try {
      for (const item of cases) {
        const before = item.transcript;
        const output = await extractCaptureFixture(id(1), before, item.id);
        expect(output, item.id).toEqual(parseCaptureFixture(id(1), before));
        expect(item.transcript).toBe(before);
        const visit = (value: unknown): void => {
          if (!value || typeof value !== "object") return;
          const record = value as Record<string, unknown>;
          if (record.kind === "extracted") expect(record.span).toMatchObject({ sourceId: id(1), sourceVersion: 1 });
          for (const child of Object.values(record)) visit(child);
        };
        visit(output);
        expect(Object.keys(output).sort()).toEqual(["lines", "materials", "questions", "title"]);
      }
      expect(network).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
});

const document = (description: string) => snapshotQuote({
  schemaVersion: "quote-document.v1", documentVersion: 1, reference: "RT-07 practice", quoteRevisionId: id(2), currency: "GBP",
  issuer: { name: "Fictional Practice Builder", address: ["1 Fictional Road"], email: "builder@example.test" },
  customer: { name: "Fictional Practice Customer", address: ["2 Fictional Road"], email: "customer@example.test" },
  lines: [{ scopeItemId: id(3), description, quantity: "1", unit: "item", netPence: 15000 }],
  exclusions: [], qualifications: [], subtotalPence: 15000, discountPence: 0, netPence: 15000, taxPence: 0, totalPence: 15000,
});
const exportFor = (description: string) => renderBillingExport({
  version: "billing-export.v1", clientContractId: id(2), lines: [{
    jobId: id(3), extraId: id(4), scopeItemId: id(5), revisionId: id(6), revisionHash: "a".repeat(64),
    approvalBindingId: id(7), approvalSnapshotHash: "b".repeat(64), description, quantity: "1", unit: "item",
    priceProvenance: "server_sor", approvedNet: { pence: 15000, currency: "GBP" },
  }],
});
const csvCell = (value: string) => `"${value.replace(/"/gu, '""')}"`;

describe("RT-07 document and spreadsheet boundaries", () => {
  it.each(["<img src=x onerror=alert(1)>", "<script>alert(1)</script>", "</textarea><script>alert(1)</script>", "&lt;script&gt;", "&lt;script&gt;alert(1)&lt;/script&gt;"])("keeps %s as literal immutable quote/PDF text", payload => {
    const description = `Fit panel labelled ${payload}`;
    const snapshot = document(description);
    expect(snapshot.lines[0]!.description).toBe(description);
    expect(JSON.parse(JSON.stringify(snapshot)).lines[0].description).toBe(description);
    expect(Object.isFrozen(snapshot.lines[0])).toBe(true);
    expect(quotePdfText(snapshot).join("\n")).toContain(description);
    const pdf = new TextDecoder().decode(renderQuotePdf(snapshot));
    expect(pdf).toContain(payload.replace(/[\\()]/gu, char => `\\${char}`));
    expect(pdf).not.toMatch(/\/(?:JavaScript|JS|OpenAction|AA)\b/u);
  });
  it.each(["=", "+", "-", "@"])('exports leading "%s" as inert CSV while preserving JSON source', prefix => {
    const description = `${prefix}SUM(1,2)`;
    const artifact = exportFor(description);
    expect(artifact.csv).toContain(csvCell(`'${description}`));
    expect(JSON.parse(artifact.json).lines[0].description).toBe(description);
  });
  it.each(["\t=", "\t+", "\t-", "\t@"])('preserves tab-prefixed "%s" in a valid export (F008 setup guard)', prefix => {
    const description = `${prefix}SUM(1,2)`;
    const artifact = exportFor(description);
    expect(JSON.parse(artifact.json).lines[0].description).toBe(description);
    expect(artifact.csv.length).toBeGreaterThan(0);
  });
  it.each(["\t=", "\t+", "\t-", "\t@"])('RT-07-F008: exports leading tab plus "%s" as inert CSV', prefix => {
    const description = `${prefix}SUM(1,2)`;
    const artifact = exportFor(description);
    expect(artifact.csv).toContain(csvCell(`'${description}`));
    // Byte-level protection; not proof that a spreadsheet was opened or a formula executed.
  });
});
