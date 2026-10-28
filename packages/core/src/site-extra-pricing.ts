import { z } from "zod";
import { enterpriseExtraV1, enterpriseRevisionV1 } from "./enterprise-domain/contracts.js";
import { sha256 } from "./evidence-pack.js";
import { parseQuantity } from "./quantity.js";
import { sorQuantityV1 } from "./sor-pricing.js";

/**
 * ENT-3c: the order check and the server-priced site extra, pure parts only.
 * No money is calculated here: the one price is computed by the database function app.sor_line_net_pence
 * and no answer of this module carries a money value. Quantities are canonical decimal text compared as scaled bigint.
 */
const uuid = z.guid({ error: "Invalid uuid" });
const reviewedText = (maximum: number) => z.string().min(1).max(maximum).refine(value => /\S/u.test(value));
const codeText = z.string().trim().min(1).max(80);
const quantityScale = 6;
const quantityScaleFactor = 10n ** BigInt(quantityScale);

/** Merged ENT-4a's vocabulary, imported and never retyped. */
export const sorPriceSourceValues = enterpriseRevisionV1.shape.priceSource.options;
export const sorStoredCoverageValues = enterpriseExtraV1.shape.orderAtOrigin.shape.coverage.options.filter(value => value !== "fully_instructed");

export const sorSiteExtraErrorCodes = ["UNAUTHENTICATED", "MODE_FORBIDDEN", "ORIGIN_FORBIDDEN", "TRACK_FORBIDDEN", "EXTRA_FORBIDDEN", "INVALID_COMMAND", "INVALID_QUANTITY", "NOT_FOUND", "JOB_NOT_LIVE", "IDEMPOTENCY_CONFLICT", "SOR_ITEM_NOT_FOUND", "ORDER_LINE_NOT_FOUND", "ORDER_LINE_AMBIGUOUS", "ALREADY_ON_ORDER", "EXTRA_NOT_POSITIVE", "MONEY_OUT_OF_RANGE", "SITE_PRICING_UNAVAILABLE"] as const;
export type SorSiteExtraErrorCode = typeof sorSiteExtraErrorCodes[number];
export class SorSiteExtraError extends Error {
  constructor(readonly code: SorSiteExtraErrorCode) { super(code); this.name = "SorSiteExtraError"; }
}
export function sorSiteExtraHttpStatus(code: SorSiteExtraErrorCode): number {
  const status: Record<SorSiteExtraErrorCode, number> = {
    UNAUTHENTICATED: 401, MODE_FORBIDDEN: 403, ORIGIN_FORBIDDEN: 403, TRACK_FORBIDDEN: 403, EXTRA_FORBIDDEN: 403, INVALID_COMMAND: 400, INVALID_QUANTITY: 400, NOT_FOUND: 404,
    JOB_NOT_LIVE: 409, IDEMPOTENCY_CONFLICT: 409, SOR_ITEM_NOT_FOUND: 422, ORDER_LINE_NOT_FOUND: 422, ORDER_LINE_AMBIGUOUS: 422, ALREADY_ON_ORDER: 422, EXTRA_NOT_POSITIVE: 422,
    MONEY_OUT_OF_RANGE: 422, SITE_PRICING_UNAVAILABLE: 503,
  };
  return status[code];
}
export const sorSiteExtraFailureV1 = z.object({ version: z.literal("sor-site-extra-error.v1"), code: z.enum(sorSiteExtraErrorCodes) }).strict();

/** A quantity is a bounded canonical decimal text (merged sorQuantityV1) greater than zero. */
function scaledQuantity(text: string): bigint {
  const parsed = parseQuantity(text);
  return parsed.scaled * (quantityScaleFactor / parsed.scale);
}
// A failed pattern is not fatal inside zod refinements, so the scaled value is read only for text that already passed it.
const positiveQuantityV1 = sorQuantityV1.refine(value => sorQuantityV1.safeParse(value).success && scaledQuantity(value) > 0n);
function canonicalQuantity(scaled: bigint): string {
  const whole = scaled / quantityScaleFactor, fraction = (scaled % quantityScaleFactor).toString().padStart(quantityScale, "0").replace(/0+$/u, "");
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}
/** The canonical text of a valid quantity (no trailing zeros), as the database keeps it; INVALID_QUANTITY for anything else. */
export function canonicalSorQuantity(value: unknown): string { return canonicalQuantity(scaledQuantity(requireQuantity(value))); }
function requireQuantity(value: unknown): string {
  const parsed = positiveQuantityV1.safeParse(value);
  if (!parsed.success) throw new SorSiteExtraError("INVALID_QUANTITY");
  return parsed.data;
}

// ---- The command body and the repository input. The job comes from the route path, never from the body. ----
export const logSorSiteExtraV1 = z.object({
  version: z.literal("log-sor-site-extra.v1"), commandId: uuid, sorCode: codeText, quantity: positiveQuantityV1, orderLineScopeItemId: uuid.optional(), note: reviewedText(5000),
}).strict();
export type LogSorSiteExtra = z.infer<typeof logSorSiteExtraV1>;
const logSorHeadV1 = logSorSiteExtraV1.extend({ quantity: z.unknown().optional() });
/** Valid apart from its quantity is INVALID_QUANTITY; every other invalid body is INVALID_COMMAND. */
export function parseLogSorSiteExtra(raw: unknown): LogSorSiteExtra {
  const head = logSorHeadV1.safeParse(raw);
  if (!head.success) throw new SorSiteExtraError("INVALID_COMMAND");
  return { ...head.data, quantity: requireQuantity(head.data.quantity) };
}
const sorSiteExtraInputHeadV1 = z.object({ commandId: uuid, jobId: uuid, sorCode: codeText, quantity: z.unknown().optional(), orderLineScopeItemId: uuid.optional(), note: reviewedText(5000) }).strict();
export type SorSiteExtraInput = { commandId: string; jobId: string; sorCode: string; quantity: string; orderLineScopeItemId?: string; note: string };
export function parseSorSiteExtraInput(raw: unknown): SorSiteExtraInput {
  const head = sorSiteExtraInputHeadV1.safeParse(raw);
  if (!head.success) throw new SorSiteExtraError("INVALID_COMMAND");
  const { quantity, orderLineScopeItemId, ...rest } = head.data;
  return { ...rest, quantity: requireQuantity(quantity), ...(orderLineScopeItemId ? { orderLineScopeItemId } : {}) };
}

// ---- The two reads. Search text is required (Q10 struck the recent list); the order-check query names a code and a total quantity. ----
const sorItemsQueryHeadV1 = z.object({ q: z.string().trim().min(1).max(80) }).strict();
export function parseSorItemsQuery(raw: unknown): { q: string } {
  const parsed = sorItemsQueryHeadV1.safeParse(raw);
  if (!parsed.success) throw new SorSiteExtraError("INVALID_COMMAND");
  return parsed.data;
}
const orderCheckQueryHeadV1 = z.object({ sorCode: codeText, quantity: z.unknown().optional(), orderLine: uuid.optional() }).strict();
export function parseOrderCheckQuery(raw: unknown): { sorCode: string; quantity: string; orderLine?: string } {
  const head = orderCheckQueryHeadV1.safeParse(raw);
  if (!head.success) throw new SorSiteExtraError("INVALID_COMMAND");
  return { sorCode: head.data.sorCode, quantity: requireQuantity(head.data.quantity), ...(head.data.orderLine ? { orderLine: head.data.orderLine } : {}) };
}

// ---- The order check (order-check.v1), over the lines of one revision. ----
export type OrderLineFact = Readonly<{ scopeItemId: string; sorCode: string; quantity: string; position: number }>;
export type OrderCheckResult =
  | { outcome: "new"; extraQuantity: string }
  | { outcome: "more_than_ordered"; orderLineScopeItemId: string; instructedQuantity: string; extraQuantity: string }
  | { outcome: "already_on_order"; orderLineScopeItemId: string; instructedQuantity: string };
export function orderCheckV1(input: Readonly<{ sorCode: string; quantity: string; orderLineScopeItemId?: string; lines: readonly OrderLineFact[] }>): OrderCheckResult {
  const claimedText = requireQuantity(input.quantity), claimed = scaledQuantity(claimedText);
  const sameCode = input.lines.filter(line => line.sorCode === input.sorCode);
  let compared: OrderLineFact | undefined;
  if (input.orderLineScopeItemId) {
    compared = input.lines.find(line => line.scopeItemId.toLowerCase() === input.orderLineScopeItemId!.toLowerCase());
    if (!compared || compared.sorCode !== input.sorCode) throw new SorSiteExtraError("ORDER_LINE_NOT_FOUND");
  } else if (sameCode.length > 1) throw new SorSiteExtraError("ORDER_LINE_AMBIGUOUS");
  else compared = sameCode[0];
  if (!compared) return { outcome: "new", extraQuantity: canonicalQuantity(claimed) };
  const instructed = scaledQuantity(compared.quantity), instructedText = canonicalQuantity(instructed);
  if (claimed <= instructed) return { outcome: "already_on_order", orderLineScopeItemId: compared.scopeItemId, instructedQuantity: instructedText };
  return { outcome: "more_than_ordered", orderLineScopeItemId: compared.scopeItemId, instructedQuantity: instructedText, extraQuantity: canonicalQuantity(claimed - instructed) };
}

// ---- Results. No money key in any of them. ----
const resultHead = { environment: z.literal("synthetic_demo"), realExternalActions: z.literal(0) } as const;
const quantityText = sorQuantityV1;
const orderCheckBodyV1 = z.object({
  outcome: z.enum(["new", "more_than_ordered", "already_on_order"]), sorCode: codeText, unit: z.string().min(1).max(40), claimedQuantity: quantityText, instructedQuantity: quantityText.nullable(),
  extraQuantity: quantityText.optional(), orderLineScopeItemId: uuid.nullable(),
}).strict().superRefine((value, context) => {
  if ((value.outcome === "already_on_order") === (value.extraQuantity !== undefined)) context.addIssue({ code: "custom", path: ["extraQuantity"], message: "extra quantity exists exactly when there is an extra" });
});
export const sorSiteExtraLoggedV1 = z.object({
  version: z.literal("sor-site-extra-logged.v1"), ...resultHead, jobId: uuid, extraId: uuid, state: z.literal("logged"),
  orderCheck: z.object({ outcome: z.enum(["new", "more_than_ordered"]), sorCode: codeText, unit: z.string().min(1).max(40), claimedQuantity: quantityText, instructedQuantity: quantityText.nullable(), extraQuantity: quantityText, orderLineScopeItemId: uuid.nullable() }).strict(),
  priceSource: enterpriseRevisionV1.shape.priceSource,
}).strict();
export type SorSiteExtraLogged = z.infer<typeof sorSiteExtraLoggedV1>;
export const siteOrderCheckV1 = z.object({ version: z.literal("site-order-check.v1"), ...resultHead, jobId: uuid, orderCheck: orderCheckBodyV1 }).strict();
export type SiteOrderCheck = z.infer<typeof siteOrderCheckV1>;
export const siteSorItemsV1 = z.object({
  version: z.literal("site-sor-items.v1"), ...resultHead, jobId: uuid, sorVersionId: uuid,
  items: z.array(z.object({ code: codeText, description: z.string().min(1).max(500), unit: z.string().min(1).max(40) }).strict()).max(50), truncated: z.boolean(),
}).strict();
export type SiteSorItems = z.infer<typeof siteSorItemsV1>;

// ---- The TypeScript mirror of the hash in migration item 4 (framing as merged extraOriginHashV1). ----
export const extraSorRevisionHashFields = ["tenantId", "jobId", "variationId", "revision", "originHash", "workOrderId", "workOrderRevisionId", "sorVersionId", "sorCode", "unit", "ratePence", "adjustmentNumerator", "adjustmentDenominator", "coverage", "excessOfScopeItemId", "instructedQuantity", "claimedQuantity", "quantity", "netPence"] as const;
export type ExtraSorRevisionHashInput = { [K in typeof extraSorRevisionHashFields[number]]: string | null };
/** UTF-8 byte-length framing: NULL = N; text = S<byteLength>:<value>; integers and uuids as PostgreSQL prints them. */
export function extraSorRevisionHashV1(input: ExtraSorRevisionHashInput): string {
  const encode = (value: string | null) => value === null ? "N;" : `S${new TextEncoder().encode(value).length}:${value};`;
  return sha256(`extra-sor-revision-hash.v1\n${extraSorRevisionHashFields.map(field => encode(input[field])).join("")}`);
}
