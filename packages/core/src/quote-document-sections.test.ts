import { describe, expect, it } from "vitest";
import { quoteDocumentV1, quotePdfText, renderQuotePdf, roomTotals } from "./quote-document.js";
import { sha256 } from "./evidence-pack.js";
import { attachCancellationKit } from "./cancellation-kit.js";

// V2-SQ-E: the quote laid out by room. A document without sections must stay byte-identical.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const base = (count = 2) => ({ schemaVersion: "quote-document.v1" as const, documentVersion: 2, reference: "Q-0002", quoteRevisionId: id(1), currency: "GBP" as const,
 issuer: { name: "A Builder Ltd", address: ["1 Trade Road", "London"], email: "builder@example.test" },
 customer: { name: "Synthetic Customer", address: ["14 King Street", "London"], email: "customer@example.test" },
 lines: Array.from({ length: count }, (_, i) => ({ scopeItemId: id(i + 10), description: `Line ${i + 1} ${"long description ".repeat(12)}`, quantity: "1", unit: "item", netPence: 10000 })),
 exclusions: ["Appliances supplied by customer"], qualifications: ["Subject to clear site access"], subtotalPence: count * 10000, discountPence: 0, netPence: count * 10000, taxPence: count * 2000, totalPence: count * 12000 });
// The same fixture as cancellation-kit.test.ts, copied so this file does not re-run that suite.
const cancellationQuoteFixture = () => ({ schemaVersion: "quote-document.v1" as const, documentVersion: 1, reference: "Q-PRACTICE", quoteRevisionId: "10000000-0000-4000-8000-000000000001", currency: "GBP" as const,
 issuer: { name: "Fictional Builder", address: ["Fictional site"], email: "builder@example.invalid" },
 customer: { name: "Fictional Customer", address: ["Fictional site"], email: "customer@example.invalid" },
 lines: [{ scopeItemId: "10000000-0000-4000-8000-000000000001", description: "Fictional work", quantity: "1", unit: "item", netPence: 1000 }],
 exclusions: [], qualifications: [], subtotalPence: 1000, discountPence: 0, netPence: 1000, taxPence: 200, totalPence: 1200 });
// Hashes taken from the base (SQ-D @ 5f040a8a3) before this change.
const KIT_HASH = "bf89f2258e0b20b488c6d512cc0d7f8c0e1573169f7293be57aa99ee4e530a60", MULTIPAGE_HASH = "3c9ad2140e13d27001096d4c7cfc315f8d915db30bbb1d1e27bf971bc3016313";
const pdfHash = (raw: unknown) => sha256(new TextDecoder().decode(renderQuotePdf(quoteDocumentV1.parse(raw))));
const three = () => {
 const lines = [["Strip out bathroom", 50000], ["Tile bathroom walls", 80000], ["Fit kitchen worktop", 45000], ["Paint hallway", 30000], ["Fit hallway skirting", 12000]].map(([description, netPence], i) => ({ scopeItemId: id(i + 20), description: String(description), quantity: "1", unit: "job", netPence: Number(netPence) }));
 const subtotal = lines.reduce((sum, line) => sum + line.netPence, 0);
 return { ...base(), lines, subtotalPence: subtotal, netPence: subtotal, taxPence: subtotal / 5, totalPence: subtotal * 1.2,
  sections: [{ name: "Bathroom", mode: "room_total" as const, scopeItemIds: [id(20), id(21)] }, { name: "Kitchen", mode: "itemised" as const, scopeItemIds: [id(22)] }, { name: "Hallway", mode: "itemised" as const, scopeItemIds: [id(23), id(24)] }] };
};

describe("V2-SQ-E quote laid out by room", () => {
 it("keeps documents without sections byte-identical (pinned hashes, including the cancellation kit)", () => {
  expect(pdfHash(cancellationQuoteFixture())).toBe("ed88cfc92e647dd532fbfc9bd450b22238ff972d69ef3947b5a2933a062a52c4");
  expect(pdfHash(attachCancellationKit(cancellationQuoteFixture(), "synthetic_demo"))).toBe(KIT_HASH);
  expect(pdfHash(base(60))).toBe(MULTIPAGE_HASH);
  expect(quoteDocumentV1.parse(base())).not.toHaveProperty("sections");
 });
 it("prints room headings, itemised prices, and one figure for a room-total room", () => {
  const text = quotePdfText(three());
  expect(text.filter(row => row.startsWith("ROOM: "))).toEqual(["ROOM: Bathroom", "ROOM: Kitchen", "ROOM: Hallway"]);
  expect(text).toContain("1. Strip out bathroom | 1 job");
  expect(text).toContain("2. Tile bathroom walls | 1 job");
  expect(text.some(row => row.includes("Strip out bathroom") && row.includes("GBP"))).toBe(false);
  expect(text).toContain("Room total GBP 1300.00");
  expect(text).toContain("3. Fit kitchen worktop | 1 job | GBP 450.00");
  expect(text.indexOf("ROOM: Hallway")).toBeLessThan(text.indexOf("EXCLUSIONS"));
  expect(text.slice(-5)).toEqual(["Subtotal GBP 2170.00", "Discount GBP 0.00", "Net GBP 2170.00", "VAT GBP 434.00", "TOTAL GBP 2604.00"]);
 });
 it("covers the layout in the PDF hash", () => {
  const doc = three(), changed = { ...doc, sections: doc.sections.map(s => s.name === "Bathroom" ? { ...s, mode: "itemised" as const } : s) };
  expect(pdfHash(doc)).not.toBe(pdfHash(changed));
  expect(pdfHash(doc)).toBe(pdfHash(three()));
 });
 it("refuses a line in no room, in two rooms, a line the quote does not include, an empty room and duplicate or untrimmed names", () => {
  const doc = three(), bad = (sections: unknown) => quoteDocumentV1.safeParse({ ...doc, sections }).success;
  expect(bad(doc.sections)).toBe(true);
  expect(bad(doc.sections.slice(1))).toBe(false);
  expect(bad([...doc.sections, { name: "Landing", mode: "itemised", scopeItemIds: [id(20)] }])).toBe(false);
  expect(bad([...doc.sections, { name: "Garden", mode: "itemised", scopeItemIds: [id(99)] }])).toBe(false);
  expect(bad([...doc.sections, { name: "Garden", mode: "itemised", scopeItemIds: [] }])).toBe(false);
  expect(bad([...doc.sections.slice(0, 2), { ...doc.sections[2], name: "Kitchen" }])).toBe(false);
  expect(bad([...doc.sections.slice(0, 2), { ...doc.sections[2], name: " Hallway" }])).toBe(false);
  expect(bad([...doc.sections.slice(0, 2), { ...doc.sections[2], name: "" }])).toBe(false);
  expect(bad([])).toBe(false);
 });
 it("sums the room figures to the subtotal for random line sets", () => {
  let seed = 7; const next = () => (seed = (seed * 1103515245 + 12345) % 2147483648);
  for (let run = 0; run < 200; run++) {
   const count = 1 + next() % 12, rooms = 1 + next() % Math.min(count, 4);
   const lines = Array.from({ length: count }, (_, i) => ({ scopeItemId: id(100 + i), description: `Item ${i}`, quantity: "1", unit: "item", netPence: next() % 500000 }));
   const subtotal = lines.reduce((sum, line) => sum + line.netPence, 0);
   const sections = Array.from({ length: rooms }, (_, r) => ({ name: `Room ${r}`, mode: next() % 2 ? "itemised" as const : "room_total" as const, scopeItemIds: lines.filter((_, i) => i % rooms === r).map(line => line.scopeItemId) }));
   const doc = quoteDocumentV1.parse({ ...base(), lines, sections, subtotalPence: subtotal, netPence: subtotal, taxPence: 0, totalPence: subtotal });
   expect(roomTotals(doc).reduce((sum, room) => sum + room.totalPence, 0)).toBe(doc.subtotalPence);
  }
 });
 it("returns no rooms for a document without sections", () => expect(roomTotals(quoteDocumentV1.parse(base()))).toEqual([]));
});
