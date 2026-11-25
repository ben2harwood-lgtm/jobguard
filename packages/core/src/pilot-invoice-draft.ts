import { z } from "zod";
import { addMoney, money } from "./money.js";
import { candidateM1TaxPolicy, CANDIDATE_M1_TAX_POLICY_VERSION } from "./tax.js";

export const PILOT_DRAFT_WARNING = "Draft — This is not a VAT invoice";
/** Statements by the builder, never inferred classifications or verified tax facts. */
export const pilotDraftStatements = {
  vatRegistered: "I am VAT registered and have checked the number below.",
  privateHomeowner: "The customer and paying party are a private homeowner, not a business, landlord or developer.",
  existingHome: "This is work on an existing home: no new build, conversion or home empty for two years or more.",
  standardRated: "Every line and approved extra is standard-rated at 20%; no reduced, zero, mixed or unknown tax treatment.",
  noReliefs: "No disabled adaptations, mobility aids for people aged 60 or over, grant-funded work or first gas/electricity connections.",
  noEnergySaving: "No energy-saving installations of any kind, including insulation, solar panels, heat pumps, batteries, heating controls, draught-proofing or wood-fuelled boilers. These examples are not a complete list.",
  noEarlierPayments: "No deposit, stage payment or earlier part-payment has been taken or invoiced.",
  noRetention: "No retention, CIS deductions or reverse charge.",
  ordinaryGbp: "GBP only; no debit note, credit note or cash discount.",
  reviewed: "I have reviewed this exact saved account, including every extra, and the current customer and builder details.",
} as const;
const confirmations = Object.fromEntries(Object.keys(pilotDraftStatements).map(key => [key, z.literal(true)])) as {
  [K in keyof typeof pilotDraftStatements]: z.ZodLiteral<true>;
};
export const pilotDraftChecklistV1 = z.strictObject({ ...confirmations,
  vatNumber: z.string().trim().transform(value => value.replace(/\s/gu, "").toUpperCase())
    .pipe(z.string().regex(/^(?:GB)?(?:\d{9}|\d{12})$/u)),
});
export const pilotDraftRequestV1 = z.strictObject({
  version: z.literal("pilot-invoice-draft.v1"),
  binding: z.string().regex(/^[a-f0-9]{64}$/u),
  checklist: pilotDraftChecklistV1,
  format: z.enum(["preview", "html", "csv"]),
});
export type PilotDraftLine = { description: string; netPence: number; quantity: string | null; unit: string | null; unitRatePence: number | null };
export type PilotInvoiceDraft = {
  version: "pilot-invoice-draft.v1"; warning: typeof PILOT_DRAFT_WARNING; jobId: string;
  binding: string; accountRevision: number; sourceHash: string; previewedAt: string;
  builder: { name: string; address: string[] }; customer: { name: string; address: string[] };
  site: string[]; vatNumber: string; lines: PilotDraftLine[];
  netPence: number; candidateVatPence: number; grossPence: number; taxPolicyVersion: string;
};
export function pilotDraftTotals(lines: readonly PilotDraftLine[]) {
  let net = money(0);
  for (const line of lines) {
    if (line.netPence < 0) throw new Error("REVIEW_INCOMPLETE");
    net = addMoney(net, money(line.netPence));
  }
  const tax = candidateM1TaxPolicy.calculateGroup(net, "standard_rate_20");
  return { netPence: net.pence, candidateVatPence: tax.pence, grossPence: addMoney(net, tax).pence,
    taxPolicyVersion: CANDIDATE_M1_TAX_POLICY_VERSION };
}
const decimal = (pence: number) => `${Math.trunc(pence / 100)}.${String(pence % 100).padStart(2, "0")}`;
const missing = "Missing — builder must complete outside JobGuard";
export const PILOT_DRAFT_COMPLETION = "Builder must complete/review the official invoice number, actual issue/sending date, tax point and missing details outside JobGuard. Preview time is not an issue or delivery date. Credit notes need separate review outside this flow. CSV is an export; no MTD compatibility is claimed.";
/** One row model keeps printable and CSV exports aligned, including warnings and missing facts. */
export function pilotDraftRows(draft: PilotInvoiceDraft): string[][] {
  return [[draft.warning], ["Builder", draft.builder.name, ...(draft.builder.address.length ? draft.builder.address : [missing])],
    ["Builder-stated VAT number (format checked only)", draft.vatNumber],
    ["Customer", draft.customer.name, ...(draft.customer.address.length ? draft.customer.address : [missing])],
    ["Work site (not a confirmed billing address)", ...draft.site],
    ["Saved account revision", String(draft.accountRevision)], ["Source hash", draft.sourceHash],
    ["Preview generated", draft.previewedAt], ["Official invoice number", missing],
    ["Actual issue/sending date", missing], ["Tax point", missing],
    ["Description / extent", "Quantity", "Unit", "Unit price GBP", "Net GBP", "Candidate VAT rate"],
    ...draft.lines.map(line => [line.description, line.quantity ?? missing, line.unit ?? missing,
      line.unitRatePence === null ? missing : decimal(line.unitRatePence), decimal(line.netPence), "20%"]),
    ["Net GBP", decimal(draft.netPence)], ["Candidate VAT at 20% GBP", decimal(draft.candidateVatPence)],
    ["Candidate gross GBP", decimal(draft.grossPence)],
    ["Proposed tax policy (not professional approval)", draft.taxPolicyVersion], [PILOT_DRAFT_COMPLETION]];
}
export function pilotDraftCsv(draft: PilotInvoiceDraft): string {
  return pilotDraftRows(draft).map(row => row.map(value => `"${(/^[\s]*[=+@-]/u.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`).join(",")).join("\r\n");
}
export function pilotDraftHtml(draft: PilotInvoiceDraft): string {
  const escape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Invoice draft</title><style>body{font:16px system-ui;max-width:70rem;margin:1rem}table{width:100%;table-layout:fixed;border-collapse:collapse}td{padding:.5rem;overflow-wrap:anywhere;border-bottom:1px solid #aaa}@media print{body{margin:0}}</style><h1>${escape(draft.warning)}</h1><table>${pilotDraftRows(draft).map(row => `<tr>${row.map(cell => `<td>${escape(cell)}</td>`).join("")}</tr>`).join("")}</table></html>`;
}
