import { z } from "zod";
import { MAX_MONEY_PENCE, receiptQuantityMicros } from "@jobguard/core";

export class MerchantExtractionError extends Error {
  constructor(readonly code: "INVALID_SOURCE" | "SYNTHETIC_MODE_REQUIRED") {
    super(code); this.name = "MerchantExtractionError";
  }
}
function requireSynthetic() {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new MerchantExtractionError("SYNTHETIC_MODE_REQUIRED");
}
function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new MerchantExtractionError("INVALID_SOURCE");
  return result.data;
}
const regionV1 = z.object({ id: z.string().min(1).max(128), text: z.string().max(50_000),
  x: z.number().min(0).max(1), y: z.number().min(0).max(1),
  width: z.number().positive().max(1), height: z.number().positive().max(1),
}).strict().refine(r => r.x + r.width <= 1 && r.y + r.height <= 1);
const regionsV1 = z.array(regionV1).max(200).refine(regions => new Set(regions.map(r => r.id)).size === regions.length);
const pageNumber = z.number().int().min(1).max(10_000);
export const merchantExtractionSourceV1 = z.object({ version: z.literal("merchant-extraction-source.v1"),
  objectVersionId: z.string().min(1).max(256), contentHash: z.string().regex(/^[a-f0-9]{64}$/u),
  expectedSourcePages: z.array(pageNumber).min(1).max(100).refine(pages => new Set(pages).size === pages.length),
  pages: z.array(z.object({ sourcePage: pageNumber, kind: z.enum(["digital_text", "image_only"]),
    regions: regionsV1,
  }).strict().refine(page => page.kind !== "image_only" || page.regions.length === 0)).max(100),
}).strict().refine(source => source.pages.reduce((sum, page) => sum + page.regions.reduce((n, r) => n + r.text.length, 0), 0) <= 100_000);
type Region = z.infer<typeof regionV1>;
type Source = z.infer<typeof merchantExtractionSourceV1>;
export type MerchantCitation = {
  objectVersionId: string; contentHash: string; sourcePage: number; regionId: string;
  start: number; end: number; region: { x: number; y: number; width: number; height: number };
};
export type MerchantExtractedField = { value: string | number | null; raw: string; citation: MerchantCitation;
  provenance: "digital_text" | "fake_ocr"; confidence: "unassessed" };
const headerNames = ["merchant", "document", "invoice", "date", "currency", "discount", "credit", "net", "vat", "total"] as const;
type Header = typeof headerNames[number];
const lineNames = ["description", "quantity", "unit", "unitPrice", "net", "vat", "total"] as const;
type Line = Record<typeof lineNames[number], MerchantExtractedField | null>;
export type MerchantExtractionProposal = {
  version: "merchant-extraction-proposal.v1"; parserVersion: "synthetic-merchant-text.v1";
  status: "proposal_requires_confirmation"; issues: string[];
  fields: Record<Header, MerchantExtractedField | null>; lines: Line[];
};

/** Server-owned recorded OCR output only. No SDK, URL, filesystem or live route.
 * Keys bind each fixture to the original immutable object version and source page.
 */
export class FakeMerchantOcrAdapter {
  private readonly fixtures: Record<string, Record<string, Region[]>>;
  constructor(fixtures: unknown) {
    requireSynthetic();
    this.fixtures = parse(z.record(z.string(), z.record(z.string(), regionsV1)), fixtures);
  }
  read(objectVersionId: string, sourcePage: number): Region[] | null {
    requireSynthetic();
    return structuredClone(this.fixtures[objectVersionId]?.[sourcePage] ?? null);
  }
}

function amount(raw: string): number | null {
  if (!/^(?:0|[1-9]\d{0,10})\.\d{2}$/u.test(raw)) return null;
  const [whole, fraction] = raw.split(".");
  const pence = BigInt(whole!) * 100n + BigInt(fraction!);
  return pence <= BigInt(MAX_MONEY_PENCE) ? Number(pence) : null;
}
function validDate(raw: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(raw)) return false;
  const date = new Date(`${raw}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === raw;
}
function value(field: MerchantExtractedField | null): bigint | null {
  return typeof field?.value === "number" ? BigInt(field.value) : null;
}
function sum(lines: Line[], key: "net" | "vat"): bigint | null {
  let total = 0n;
  for (const line of lines) {
    const n = value(line[key]);
    if (n === null) return null;
    total += n;
  }
  return total;
}
function reconcile(proposal: MerchantExtractionProposal, issue: (code: string) => void) {
  const { fields, lines } = proposal;
  if (!lines.length) issue("missing_lines");
  const seen = new Set<string>();
  for (const line of lines) {
    const identity = JSON.stringify(lineNames.map(name => {
      const field = line[name];
      if (name === "quantity" && typeof field?.value === "string") return receiptQuantityMicros(field.value).toString();
      return typeof field?.value === "number" ? field.value : field?.raw.trim().toLowerCase().replace(/\s+/gu, " ");
    }));
    if (seen.has(identity)) issue("duplicate_line");
    seen.add(identity);
    const net = value(line.net), tax = value(line.vat), total = value(line.total), rate = value(line.unitPrice);
    if (typeof line.quantity?.value === "string" && net !== null && rate !== null
      && receiptQuantityMicros(line.quantity.value) * rate !== net * 1_000_000n) issue("line_net_mismatch");
    if (net !== null && tax !== null && total !== null && net + tax !== total) issue("line_total_mismatch");
  }
  const net = value(fields.net), tax = value(fields.vat), total = value(fields.total);
  const discount = value(fields.discount), credit = value(fields.credit);
  const lineNet = sum(lines, "net"), lineTax = sum(lines, "vat");
  if (lineNet !== null && net !== null && discount !== null && credit !== null && lineNet - discount - credit !== net) issue("net_mismatch");
  if (lineTax !== null && tax !== null && lineTax !== tax) issue("vat_mismatch");
  if (net !== null && tax !== null && total !== null && net + tax !== total) issue("total_mismatch");
}

/** DARK text-layer contract, not a PDF decoder or a live extraction route.
 * The caller supplies the verified intake manifest and text regions from its
 * immutable original. Explicit synthetic rows are inert data (see contract).
 * Every result needs human confirmation; this function stores no business facts.
 */
export async function extractMerchantDocument(raw: unknown, ocr?: FakeMerchantOcrAdapter): Promise<MerchantExtractionProposal> {
  requireSynthetic();
  const source = parse(merchantExtractionSourceV1, raw);
  const proposal: MerchantExtractionProposal = { version: "merchant-extraction-proposal.v1",
    parserVersion: "synthetic-merchant-text.v1", status: "proposal_requires_confirmation", issues: [],
    fields: Object.fromEntries(headerNames.map(name => [name, null])) as MerchantExtractionProposal["fields"], lines: [] };
  const issue = (code: string) => { if (!proposal.issues.includes(code)) proposal.issues.push(code); };
  const pages = source.pages.map(page => page.sourcePage);
  if (new Set(pages).size !== pages.length || pages.length !== source.expectedSourcePages.length
    || source.expectedSourcePages.some(page => !pages.includes(page))) issue("page_manifest_mismatch");
  const headers = new Map<Header, MerchantExtractedField[]>();
  let textBudget = 100_000;
  for (const page of source.pages) {
    const provenance = page.kind === "digital_text" ? "digital_text" : "fake_ocr";
    const regions = page.kind === "digital_text" ? page.regions : ocr?.read(source.objectVersionId, page.sourcePage);
    if (!regions) { issue("ocr_unavailable"); continue; }
    if (!regions.some(region => region.text.trim())) issue("unreadable_page");
    for (const region of regions) {
      textBudget -= region.text.length;
      if (textBudget < 0) throw new MerchantExtractionError("INVALID_SOURCE");
      const field = (rawValue: string, start: number): MerchantExtractedField => ({
        raw: rawValue, value: rawValue, provenance, confidence: "unassessed",
        citation: citation(source, page.sourcePage, region, start, start + rawValue.length),
      });
      let offset = 0;
      for (const row of region.text.split("\n")) {
        const colon = row.indexOf(":");
        const key = row.slice(0, colon).trim().toLowerCase();
        const content = row.slice(colon + 1);
        const start = offset + colon + 1;
        offset += row.length + 1;
        if (!row.trim()) continue;
        if (colon < 0) { issue("unrecognized_row"); continue; }
        if (key === "line") {
          const cells = content.split("|");
          if (cells.length !== lineNames.length) issue("invalid_line_structure");
          let cellOffset = start;
          const line = Object.fromEntries(lineNames.map((name, i) => {
            const cell = cells[i] ?? "", trimmed = cell.trim();
            const extracted = trimmed ? field(trimmed, cellOffset + cell.indexOf(trimmed)) : null;
            cellOffset += cell.length + 1;
            if (!extracted) issue(`missing_line_${name}`);
            else validateLineField(name, extracted, issue);
            return [name, extracted];
          })) as Line;
          proposal.lines.push(line);
        } else if (headerNames.includes(key as Header)) {
          const name = key as Header, trimmed = content.trim();
          const extracted = field(trimmed, start + content.indexOf(trimmed));
          headers.set(name, [...(headers.get(name) ?? []), extracted]);
        } else issue("unrecognized_row");
      }
    }
  }
  for (const name of headerNames) {
    const found = headers.get(name) ?? [];
    if (found.length !== 1 || !found[0]!.raw) { issue(`${found.length > 1 ? "ambiguous" : "missing"}_${name}`); continue; }
    const field = found[0]!;
    if (["discount", "credit", "net", "vat", "total"].includes(name)) {
      field.value = amount(field.raw);
      if (field.value === null) issue("invalid_amount");
    }
    if (name === "currency" && field.raw !== "GBP") issue("unsupported_currency");
    if (name === "document" && !["invoice", "credit"].includes(field.raw)) issue("invalid_document_type");
    if (name === "date" && !validDate(field.raw)) { field.value = null; issue("invalid_date"); }
    proposal.fields[name] = field;
  }
  reconcile(proposal, issue);
  return proposal;
}

function validateLineField(name: typeof lineNames[number], field: MerchantExtractedField, issue: (code: string) => void) {
  if (name === "quantity") {
    try {
      if (!/^(?:0|[1-9]\d{0,13})(?:\.\d{1,6})?$/u.test(field.raw) || receiptQuantityMicros(field.raw) === 0n) throw new Error();
    } catch { field.value = null; issue("invalid_quantity"); }
  } else if (!["description", "unit"].includes(name)) {
    field.value = amount(field.raw);
    if (field.value === null) issue("invalid_amount");
  }
}
function citation(source: Source, sourcePage: number, region: Region, start: number, end: number): MerchantCitation {
  return { objectVersionId: source.objectVersionId, contentHash: source.contentHash, sourcePage,
    regionId: region.id, start, end, region: { x: region.x, y: region.y, width: region.width, height: region.height } };
}
