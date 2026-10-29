import { z } from "zod";
import { MAX_MONEY_PENCE, moneyFromBigInt } from "./money.js";
import { sha256 } from "./evidence-pack.js";

const uuid = z.string().uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const pence = z.number().int().min(0).max(MAX_MONEY_PENCE);
const ref = z.object({ tenantId: uuid, id: uuid, hash }).strict();
const period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u);
const provenance = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("subscription"), statement: ref, period, policyVersion: z.literal("subscription_pricing_policy_v4") }).strict(),
  z.object({ kind: z.literal("success_fee"), statement: ref, derivation: ref, proof: ref, approval: ref,
    finalAccountLock: ref, policyVersion: z.literal("reference_fee_policy_v3"),
    proofState: z.literal("verified"), disclosedBeforeLock: z.literal(false), builderCaptured: z.literal(false),
    priorSettlements: z.array(ref).max(100) }).strict(),
  z.object({ kind: z.literal("contractor_fee"), statement: ref, derivation: ref, origin: ref, approval: ref,
    customerInvoice: ref, payment: ref, policyVersion: z.literal("enterprise_site_capture_policy_v1"),
    originKind: z.enum(["site_user", "jobguard_confirmed"]), period }).strict(),
]);
const line = z.object({ id: uuid, principalPence: pence.refine(v => v > 0), taxPence: pence,
  sourcePrincipalPence: pence, provenance }).strict().refine(v => v.principalPence <= v.sourcePrincipalPence);
export const platformInvoiceProfileV1 = z.object({ version: z.literal("platform-invoice-profile.v1"),
  tenantId: uuid, issuerId: uuid, name: z.literal("JobGuard fictional issuer"),
  address: z.literal("Fictional address — simulation only"), vatRegistration: z.literal("SIMULATION-NOT-REGISTERED"),
  environment: z.literal("synthetic_demo") }).strict();
export const platformInvoiceRequestV1 = z.object({ version: z.literal("platform-invoice-request.v1"),
  environment: z.literal("synthetic_demo"), commandId: uuid, tenantId: uuid, issuerId: uuid, actorMembershipId: uuid,
  kind: z.enum(["invoice", "credit_note"]), originalNumber: z.string().regex(/^SIM-PLATFORM-[1-9]\d*$/u).nullable(),
  lines: z.array(line).min(1).max(100), taxPolicy: z.literal("D02-pending-approval-example"),
}).strict();
export type PlatformInvoiceRequest = z.infer<typeof platformInvoiceRequestV1>;
export type PlatformInvoiceProfile = z.infer<typeof platformInvoiceProfileV1>;
export const PLATFORM_INVOICE_WARNING = "Simulation only — D02 tax examples pending approval; not a tax invoice or real amount due";
export type PlatformInvoiceDocument = Readonly<{
  version: "platform-invoice-document.v1"; namespace: "platform_statement.invoice.synthetic.v1";
  number: string; sequence: number; request: PlatformInvoiceRequest; issuer: PlatformInvoiceProfile;
  principalPence: number; taxPence: number; grossPence: number;
  warning: typeof PLATFORM_INVOICE_WARNING; collectionStarted: false;
}>;
export class PlatformInvoiceError extends Error {
  constructor(readonly code: "INVALID_PLATFORM_INVOICE" | "PLATFORM_INVOICE_FORBIDDEN" | "PLATFORM_INVOICE_CONFLICT" | "PLATFORM_INVOICE_LIMIT" | "PLATFORM_INVOICE_LIVE_DISABLED") {
    super(code); this.name = "PlatformInvoiceError";
  }
}
function fail(code: PlatformInvoiceError["code"]): never { throw new PlatformInvoiceError(code); }
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) fail("INVALID_PLATFORM_INVOICE");
  return result.data;
}
/** Canonical bytes for immutable JSON downloads and replay binding. */
export function platformInvoiceCanonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(platformInvoiceCanonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, child]) => `${JSON.stringify(key)}:${platformInvoiceCanonical(child)}`).join(",")}}`;
  return JSON.stringify(value)!;
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function sum(values: number[]): number {
  try { return moneyFromBigInt(values.reduce((total, value) => total + BigInt(value), 0n)).pence; }
  catch { return fail("PLATFORM_INVOICE_LIMIT"); }
}
function sourceKey(value: z.infer<typeof provenance>): string {
  return value.kind === "subscription" ? `${value.kind}:${value.statement.id}` : `${value.kind}:${value.derivation.id}`;
}
function checkTenant(tenantId: string, value: unknown): void {
  if (!value || typeof value !== "object") return;
  if ("tenantId" in value && value.tenantId !== tenantId) fail("PLATFORM_INVOICE_FORBIDDEN");
  Object.values(value).forEach(child => checkTenant(tenantId, child));
}
/** Fixture-only issuance kernel. History MUST come from the locked durable store, never a client request.
 * References are fictional provenance, not independently verified production proof or authorisation. */
export function issuePlatformInvoiceFixture(profileRaw: unknown, raw: unknown, history: readonly PlatformInvoiceDocument[]) {
  const issuer = parse(platformInvoiceProfileV1, profileRaw), request = parse(platformInvoiceRequestV1, raw);
  checkTenant(issuer.tenantId, request);
  if (request.issuerId !== issuer.issuerId) fail("PLATFORM_INVOICE_FORBIDDEN");
  if (history.some(d => d.issuer.issuerId !== issuer.issuerId || d.issuer.tenantId !== issuer.tenantId)) fail("PLATFORM_INVOICE_FORBIDDEN");
  const replay = history.find(d => d.request.commandId === request.commandId);
  if (replay) {
    if (platformInvoiceCanonical(replay.request) !== platformInvoiceCanonical(request)) fail("PLATFORM_INVOICE_CONFLICT");
    return freeze(structuredClone(replay));
  }
  const kinds = new Set(request.lines.map(l => l.provenance.kind));
  if (kinds.size !== 1 || new Set(request.lines.map(l => l.id)).size !== request.lines.length ||
      new Set(request.lines.map(l => sourceKey(l.provenance))).size !== request.lines.length) fail("INVALID_PLATFORM_INVOICE");
  if (request.kind === "invoice") {
    if (request.originalNumber !== null) fail("INVALID_PLATFORM_INVOICE");
    const used = new Set(history.filter(d => d.request.kind === "invoice").flatMap(d => d.request.lines.map(l => sourceKey(l.provenance))));
    if (request.lines.some(l => used.has(sourceKey(l.provenance)))) fail("PLATFORM_INVOICE_CONFLICT");
  } else {
    const original = history.find(d => d.number === request.originalNumber && d.request.kind === "invoice");
    if (!original) fail("PLATFORM_INVOICE_FORBIDDEN");
    for (const current of request.lines) {
      const old = original.request.lines.find(l => l.id === current.id);
      if (!old || platformInvoiceCanonical(old.provenance) !== platformInvoiceCanonical(current.provenance) ||
          old.sourcePrincipalPence !== current.sourcePrincipalPence) fail("PLATFORM_INVOICE_FORBIDDEN");
      const credits = history.filter(d => d.request.kind === "credit_note" && d.request.originalNumber === original.number)
        .flatMap(d => d.request.lines).filter(l => l.id === current.id);
      if (sum([...credits.map(l => l.principalPence), current.principalPence]) > old.principalPence ||
          sum([...credits.map(l => l.taxPence), current.taxPence]) > old.taxPence) fail("PLATFORM_INVOICE_LIMIT");
      // Tax treatment is not invented here: synthetic corrections retain the example's exact ratio.
      if (BigInt(current.taxPence) * BigInt(old.principalPence) !== BigInt(old.taxPence) * BigInt(current.principalPence)) fail("INVALID_PLATFORM_INVOICE");
    }
  }
  const principalPence = sum(request.lines.map(l => l.principalPence)), taxPence = sum(request.lines.map(l => l.taxPence));
  const sequence = history.length + 1;
  if (!Number.isSafeInteger(sequence)) fail("PLATFORM_INVOICE_LIMIT");
  return freeze<PlatformInvoiceDocument>({ version: "platform-invoice-document.v1", namespace: "platform_statement.invoice.synthetic.v1",
    number: `SIM-PLATFORM-${sequence}`, sequence, request, issuer, principalPence, taxPence,
    grossPence: sum([principalPence, taxPence]), warning: PLATFORM_INVOICE_WARNING, collectionStarted: false });
}
export function downloadPlatformInvoice(document: PlatformInvoiceDocument) {
  const canonicalJson = platformInvoiceCanonical(document);
  return Object.freeze({ canonicalJson, hash: sha256(canonicalJson), bytes: new TextEncoder().encode(canonicalJson) });
}
/** No provider, receipt write or allocation is performed. netPaidPence is a fictional net receipt projection. */
export function platformInvoiceAccountFixture(original: PlatformInvoiceDocument, credits: readonly PlatformInvoiceDocument[], netPaidPence: unknown) {
  if (original.request.kind !== "invoice" || credits.some(c => c.request.kind !== "credit_note" || c.request.originalNumber !== original.number ||
      c.request.tenantId !== original.request.tenantId || c.request.issuerId !== original.request.issuerId) ||
      new Set(credits.map(c => c.number)).size !== credits.length) fail("INVALID_PLATFORM_INVOICE");
  const paid = parse(pence, netPaidPence), credited = sum(credits.map(c => c.grossPence));
  if (paid > original.grossPence || credited > original.grossPence) fail("PLATFORM_INVOICE_LIMIT");
  const balance = sum([original.grossPence, -credited, -paid]);
  return Object.freeze({ warning: PLATFORM_INVOICE_WARNING, principalPence: original.principalPence - sum(credits.map(c => c.principalPence)),
    taxPence: original.taxPence - sum(credits.map(c => c.taxPence)), grossPence: original.grossPence - credited,
    alreadyPaidPence: paid, remainingCashDuePence: Math.max(0, balance), refundDuePence: Math.max(0, -balance), collectionStarted: false });
}
export function refuseLivePlatformInvoice(): never { return fail("PLATFORM_INVOICE_LIVE_DISABLED"); }
