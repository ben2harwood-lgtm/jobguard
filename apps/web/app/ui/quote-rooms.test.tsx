import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { quoteDocumentV1, type QuoteLine } from "@jobguard/core";
import { editorRoomTotal, OTHER_WORK, QuoteLinesByRoom, quoteSectionsFor, roomGroups, savedLayout } from "./quote-rooms";

// V2-SQ-E: the quote laid out by room, as the editor saves it and the customer reads it.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const line = (n: number, description: string, pence: number, included = true): QuoteLine => ({ id: id(n + 500), scopeItemId: id(n), scopeRevisionId: id(n), description, origin: "captured", included, exclusionReason: included ? null : "Customer excluded", quantity: "1", unit: "job", unitRatePence: pence, discountPercent: "0", taxTreatment: "standard_rate_20", rateProvenance: "entered", category: null, region: null });
const lines = [line(1, "Strip out bathroom", 50000), line(2, "Fit kitchen worktop", 45000), line(3, "Tile bathroom walls", 80000), line(4, "Replace shelves", 9000, false), line(5, "Paint hallway", 30000)];
const roomOf = { [id(1)]: "Bathroom", [id(2)]: "Kitchen", [id(3)]: "Bathroom", [id(4)]: "Kitchen", [id(5)]: "Hallway" };
const gbp = (pence: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(pence / 100);
const doc = (sections?: unknown) => quoteDocumentV1.parse({ schemaVersion: "quote-document.v1", documentVersion: 1, reference: "Q-1", quoteRevisionId: id(99), currency: "GBP",
 issuer: { name: "Fictional Builder", address: ["Fictional site"], email: "builder@example.invalid" }, customer: { name: "Fictional Customer", address: ["Fictional site"], email: "customer@example.invalid" },
 lines: lines.filter(l => l.included).map(l => ({ scopeItemId: l.scopeItemId, description: l.description, quantity: "1", unit: "job", netPence: l.unitRatePence! })),
 exclusions: ["Replace shelves: Customer excluded"], qualifications: [], subtotalPence: 205000, discountPence: 0, netPence: 205000, taxPence: 41000, totalPence: 246000, ...(sections ? { sections } : {}) });

describe("V2-SQ-E quote rooms", () => {
 beforeAll(() => { vi.stubGlobal("React", React); });
 it("saves included lines by room in first-seen order, with each room's chosen display", () => {
  expect(quoteSectionsFor(lines, roomOf, { Bathroom: "room_total" })).toEqual([
   { name: "Bathroom", mode: "room_total", scopeItemIds: [id(1), id(3)] },
   { name: "Kitchen", mode: "itemised", scopeItemIds: [id(2)] },
   { name: "Hallway", mode: "itemised", scopeItemIds: [id(5)] }]);
 });
 it("saves no layout when no line has a room, and puts a roomless line under Other work", () => {
  expect(quoteSectionsFor(lines, {}, {})).toBeUndefined();
  expect(quoteSectionsFor(lines, { [id(1)]: "Bathroom" }, {})?.map(s => s.name)).toEqual(["Bathroom", OTHER_WORK]);
 });
 it("shows excluded lines under their room in the editor but never in the saved layout", () => {
  expect(roomGroups(lines, roomOf).find(g => g.name === "Kitchen")?.lines.map(l => l.description)).toEqual(["Fit kitchen worktop", "Replace shelves"]);
  expect(quoteSectionsFor(lines, roomOf, {})!.flatMap(s => s.scopeItemIds)).not.toContain(id(4));
  expect(editorRoomTotal(roomGroups(lines, roomOf).find(g => g.name === "Kitchen")!.lines)).toBe(45000);
 });
 it("reads rooms and modes back from a saved revision", () => {
  const saved = quoteSectionsFor(lines, roomOf, { Bathroom: "room_total" });
  expect(savedLayout(saved)).toEqual({ roomOf: { [id(1)]: "Bathroom", [id(3)]: "Bathroom", [id(2)]: "Kitchen", [id(5)]: "Hallway" }, modes: { Bathroom: "room_total", Kitchen: "itemised", Hallway: "itemised" } });
  expect(quoteSectionsFor(lines, savedLayout(saved).roomOf, savedLayout(saved).modes)).toEqual(saved);
 });
 it("keeps the customer's list unchanged without rooms", () => {
  expect(renderToStaticMarkup(<QuoteLinesByRoom document={doc()} gbp={gbp}/>)).toBe(renderToStaticMarkup(<ul>{doc().lines.map(line=><li key={line.scopeItemId}>{line.description}: {line.quantity} {line.unit} — {gbp(line.netPence)}</li>)}</ul>));
 });
 it("shows each room, with one figure and no line prices for a room-total room", () => {
  const html = renderToStaticMarkup(<QuoteLinesByRoom document={doc(quoteSectionsFor(lines, roomOf, { Bathroom: "room_total" }))} gbp={gbp}/>);
  expect([...html.matchAll(/<h3>([^<]+)<\/h3>/gu)].map(m => m[1])).toEqual(["Bathroom", "Kitchen", "Hallway"]);
  expect(html).toContain("<li>Strip out bathroom: 1 job</li><li>Tile bathroom walls: 1 job</li>");
  expect(html).toContain("Room total £1,300.00");
  expect(html).toContain("<li>Fit kitchen worktop: 1 job — £450.00</li>");
  expect(html).not.toContain("Replace shelves");
 });
});
