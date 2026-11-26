import { describe, expect, it } from "vitest";
import { composeHandoverPack, handoverChoiceV1, noAmounts, type HandoverChoice, type HandoverSources } from "./v2-handover-pack.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const sources: HandoverSources = {
  quoteRevisionId: id(90),
  lines: [{ id: id(1), description: "Tile the kitchen splashback" }, { id: id(2), description: "Decorate the hall" }],
  variations: [{ variationId: id(3), revisionId: id(4), description: "splashback extended to the end of the worktop" }],
  photos: [{ id: id(5), sha256: "a".repeat(64), receivedAt: "2026-12-01T10:00:00Z" }],
  snags: [{ id: id(6), title: "Refit the hall door stop", owner: "Jordan", dueOn: "2026-12-04", state: "open", lastSequence: 0,
    agreedNote: "Visit agreed with Alex." }],
  contact: { tradingName: "Rowan Building (fictional)", email: "builder@rowan-building.invalid", phone: null },
};
const all: HandoverChoice = { sections: ["done", "changes", "photos", "certificates", "snags", "contacts"],
  lineIds: [id(1), id(2)], variationIds: [id(3)], photoIds: [id(5)], snagIds: [id(6)],
  certificates: [{ text: "Tile adhesive data sheet", status: "included" }, { text: "electrical certificate", status: "still_needed" }] };

describe("V2-G2 handover pack composer", () => {
  it("writes M3's text for every ticked section, in order", () => {
    const { content, refused, unknown, sources: refs } = composeHandoverPack(sources, all);
    expect(refused).toEqual([]); expect(unknown).toEqual([]);
    expect(content.sections.map(section => [section.title, section.lines])).toEqual([
      ["What was done", ["Tile the kitchen splashback", "Decorate the hall"]],
      ["Changes", ["Agreed change · splashback extended to the end of the worktop"]],
      ["Photos", ["Site photo 1 · 1 Dec"]],
      ["Manuals and certificates", ["Tile adhesive data sheet", "Still needed: electrical certificate. Your builder will supply it separately."]],
      ["Outstanding snags", ["Refit the hall door stop · Jordan · due 4 Dec. Visit agreed with Alex."]],
      ["Contacts", ["Rowan Building (fictional) · builder@rowan-building.invalid", "Aftercare: contact the builder about this job."]],
    ]);
    expect(content.sections[2]!.photos).toEqual([{ id: id(5), sha256: "a".repeat(64) }]);
    expect(refs).toEqual({ quoteRevisionId: id(90), lines: [id(1), id(2)], variations: [{ variationId: id(3), revisionId: id(4) }],
      photos: [{ id: id(5), sha256: "a".repeat(64) }], snags: [{ id: id(6), lastSequence: 0 }],
      contact: { tradingName: "Rowan Building (fictional)", email: "builder@rowan-building.invalid" } });
  });
  it("puts in only what is ticked, including no contacts", () => {
    const { content, sources: refs } = composeHandoverPack(sources, { ...all, sections: ["done"], lineIds: [id(2)] });
    expect(content.sections).toEqual([{ key: "done", title: "What was done", lines: ["Decorate the hall"] }]);
    expect([refs.variations, refs.photos, refs.snags, refs.contact]).toEqual([[], [], [], null]);
  });
  it("refuses amounts and empty ticked sections, and reports items that are not offered", () => {
    const { refused, unknown } = composeHandoverPack(sources, { ...all, sections: ["certificates", "changes"], variationIds: [id(77)],
      certificates: [{ text: "Spare tiles worth £40", status: "included" }] });
    expect(refused).toEqual([{ section: "changes", line: "Changes", reason: "empty" },
      { section: "certificates", line: "Spare tiles worth £40", reason: "amount" }]);
    expect(unknown).toEqual([id(77)]);
  });
  it("copies K3's no-amounts cases", () => {
    for (const bad of ["£12", "$5", "€3", "12 GBP", "USD 4", "12.50", "12,50", "40 pence", "3 pounds", "1 pound"]) expect(noAmounts(bad), bad).toBe(false);
    for (const good of ["Tile the splashback", "due 4 Dec", "2 coats", "Room 12", "07700 900042"]) expect(noAmounts(good), good).toBe(true);
  });
  it("has no money field in its input and accepts only the strict choice", () => {
    expect(Object.keys(sources).sort()).toEqual(["contact", "lines", "photos", "quoteRevisionId", "snags", "variations"]);
    const keys = (value: unknown): string[] => value && typeof value === "object"
      ? Object.entries(value).flatMap(([key, child]) => [key, ...keys(child)]) : [];
    expect(keys(sources).filter(key => /pence|rate|price|total|amount|delta|net|vat/iu.test(key))).toEqual([]);
    expect(handoverChoiceV1.safeParse({ ...all, amountPence: 1 }).success).toBe(false);
    expect(handoverChoiceV1.safeParse({ ...all, sections: ["done", "done"] }).success).toBe(false);
  });
});
