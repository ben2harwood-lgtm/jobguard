// V2-G2 (Q56): the handover pack composer. Pure: descriptions and version references in, the exact
// customer text out. The input type carries no money field, and every line passes the no-amounts rule.
import { z } from "zod";

export const HANDOVER_SECTIONS = [
  { key: "done", title: "What was done" },
  { key: "changes", title: "Changes" },
  { key: "photos", title: "Photos" },
  { key: "certificates", title: "Manuals and certificates" },
  { key: "snags", title: "Outstanding snags" },
  { key: "contacts", title: "Contacts" },
] as const;
export type HandoverSectionKey = (typeof HANDOVER_SECTIONS)[number]["key"];

/** K3's customer-text rule, copied: no currency signs or codes, no 0.00-style figures, no pence or pounds. */
export function noAmounts(line: string) {
  return !/[£$€]|\b(?:GBP|USD|EUR)\b|\d+[.,]\d{2}\b|\b\d+\s*(?:pence|pounds?)\b/iu.test(line);
}

/** Everything the builder can choose from. Descriptions and references only: there is no money field. */
export type HandoverSources = {
  quoteRevisionId: string | null;
  lines: { id: string; description: string }[];
  variations: { variationId: string; revisionId: string; description: string }[];
  photos: { id: string; sha256: string; receivedAt: string }[];
  snags: { id: string; title: string; owner: string | null; dueOn: string | null; state: "open" | "fixed"; lastSequence: number;
    agreedNote: string | null }[];
  contact: { tradingName: string; email: string | null; phone: string | null } | null;
};

const uuid = z.guid({ error: "Invalid uuid" });
const ids = z.array(uuid).max(200).refine(rows => new Set(rows).size === rows.length);
export const handoverChoiceV1 = z.strictObject({
  sections: z.array(z.enum(HANDOVER_SECTIONS.map(section => section.key) as [HandoverSectionKey, ...HandoverSectionKey[]]))
    .max(6).refine(rows => new Set(rows).size === rows.length),
  lineIds: ids, variationIds: ids, photoIds: ids, snagIds: ids,
  certificates: z.array(z.strictObject({ text: z.string().trim().min(1).max(200), status: z.enum(["included", "still_needed"]) })).max(30),
});
export type HandoverChoice = z.infer<typeof handoverChoiceV1>;

export type HandoverSection = { key: HandoverSectionKey; title: string; lines: string[]; photos?: { id: string; sha256: string }[] };
export type HandoverContent = { schema: "handover-content.v1"; sections: HandoverSection[] };
export type HandoverRefusal = { section: HandoverSectionKey; line: string; reason: "amount" | "empty" };
export type HandoverSourceRefs = {
  quoteRevisionId: string | null; lines: string[]; variations: { variationId: string; revisionId: string }[];
  photos: { id: string; sha256: string }[]; snags: { id: string; lastSequence: number }[];
  contact: { tradingName: string; email: string | null } | null;
};

const day = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const shortDate = (iso: string) => day.format(new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso));

/** The customer's text for each ticked section, in M3's order. `unknown` lists chosen ids that are not offered. */
export function composeHandoverPack(sources: HandoverSources, choice: HandoverChoice) {
  const picked = <T>(rows: readonly T[], chosen: readonly string[], key: (row: T) => string) =>
    rows.filter(row => chosen.includes(key(row)));
  const unknown = [
    ...choice.lineIds.filter(id => !sources.lines.some(row => row.id === id)),
    ...choice.variationIds.filter(id => !sources.variations.some(row => row.variationId === id)),
    ...choice.photoIds.filter(id => !sources.photos.some(row => row.id === id)),
    ...choice.snagIds.filter(id => !sources.snags.some(row => row.id === id)),
  ];
  const lines = picked(sources.lines, choice.lineIds, row => row.id);
  const variations = picked(sources.variations, choice.variationIds, row => row.variationId);
  const photos = picked(sources.photos, choice.photoIds, row => row.id);
  const snags = picked(sources.snags, choice.snagIds, row => row.id);
  const text: Record<HandoverSectionKey, string[]> = {
    done: lines.map(row => row.description),
    changes: variations.map(row => `Agreed change · ${row.description}`),
    photos: photos.map((row, index) => `Site photo ${index + 1} · ${shortDate(row.receivedAt)}`),
    certificates: choice.certificates.map(row => row.status === "included" ? row.text
      : `Still needed: ${row.text}. Your builder will supply it separately.`),
    snags: snags.map(row => [row.title, row.owner, row.dueOn ? `due ${shortDate(row.dueOn)}` : null].filter(Boolean).join(" · ")
      + "." + (row.agreedNote ? ` ${row.agreedNote}` : "")),
    contacts: sources.contact ? [[sources.contact.tradingName, sources.contact.email, sources.contact.phone].filter(Boolean).join(" · "),
      "Aftercare: contact the builder about this job."] : ["Aftercare: contact the builder about this job."],
  };
  const refused: HandoverRefusal[] = [];
  const sections: HandoverSection[] = [];
  for (const { key, title } of HANDOVER_SECTIONS) {
    if (!choice.sections.includes(key)) continue;
    if (!text[key].length) refused.push({ section: key, line: title, reason: "empty" });
    for (const line of text[key]) if (!noAmounts(line)) refused.push({ section: key, line, reason: "amount" });
    sections.push({ key, title, lines: text[key], ...(key === "photos" && { photos: photos.map(row => ({ id: row.id, sha256: row.sha256 })) }) });
  }
  const content: HandoverContent = { schema: "handover-content.v1", sections };
  const refs: HandoverSourceRefs = {
    quoteRevisionId: choice.sections.includes("done") ? sources.quoteRevisionId : null,
    lines: choice.sections.includes("done") ? lines.map(row => row.id) : [],
    variations: choice.sections.includes("changes") ? variations.map(row => ({ variationId: row.variationId, revisionId: row.revisionId })) : [],
    photos: choice.sections.includes("photos") ? photos.map(row => ({ id: row.id, sha256: row.sha256 })) : [],
    snags: choice.sections.includes("snags") ? snags.map(row => ({ id: row.id, lastSequence: row.lastSequence })) : [],
    contact: choice.sections.includes("contacts") && sources.contact ? { tradingName: sources.contact.tradingName, email: sources.contact.email } : null,
  };
  return { content, refused, unknown, sources: refs };
}
