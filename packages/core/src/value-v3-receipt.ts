import { formatValueMoney, VALUE_V3_LABELS, valueReceiptV3 } from "./value-v3.js";
import type { ValueAmountV3, ValueReceiptV3 } from "./value-v3.js";

/** Pure preparation only. No storage, authorisation, qualification or source verification. */
export interface RenderedValueReceiptV3 {
  readonly version: "value-receipt-render.v1";
  readonly mediaType: "text/plain";
  readonly status: "incomplete";
  readonly canonicalPayload: string;
  readonly text: string;
}
export class ValueReceiptRenderError extends Error {
  readonly code = "VALUE_RECEIPT_LINK_TARGET_REJECTED";
  constructor() { super("VALUE_RECEIPT_LINK_TARGET_REJECTED"); this.name = "ValueReceiptRenderError"; }
}
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const sortedRefs = (refs: string[]): string[] => [...refs].sort(compare);
// References are opaque identifiers, never navigable targets. No URL/link API is exposed.
function rejectTargets(value: unknown): void {
  if (typeof value === "string" && /^\s*(?:[a-z][a-z0-9+.-]*:\/\/|javascript:|data:|vbscript:|file:|mailto:|[\\/]|\.\.[\\/])/i.test(value)) {
    throw new ValueReceiptRenderError();
  }
  if (Array.isArray(value)) for (const child of value) rejectTargets(child);
  else if (value !== null && typeof value === "object") for (const child of Object.values(value)) rejectTargets(child);
}
function normalized(receipt: ValueReceiptV3): ValueReceiptV3 {
  // Zod parses into a fresh object and rejects unknown fields; never sort caller arrays.
  const v = valueReceiptV3.parse(receipt);
  rejectTargets(v);
  v.sources.sort((a, b) => compare(a.id, b.id));
  v.facts.sort((a, b) => compare(a.id, b.id));
  v.asOf.vector.sort((a, b) => compare(a.producer, b.producer) || compare(a.revision, b.revision));
  v.categories[0].sourceRefs = sortedRefs(v.categories[0].sourceRefs);
  const sortAmount = (amount: ValueAmountV3) => {
    if (amount.state === "known") amount.sourceRefs = sortedRefs(amount.sourceRefs);
  };
  for (const c of [v.categories[1], v.categories[2], v.categories[3], v.categories[4]]) {
    for (const key of ["recorded", "settled", "qualifying", "fee", "remainder"] as const) sortAmount(c[key]);
  }
  if (v.scopeKind === "business") {
    v.subscription.sourceRefs = sortedRefs(v.subscription.sourceRefs);
    sortAmount(v.subscription.cost);
  }
  return v;
}
// Fixed lexical key order, independent of locale and insertion order. No digest in pure core.
function json(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(json).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => compare(a, b)).map(([k, v]) => `${JSON.stringify(k)}:${json(v)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
function safeJson(value: unknown): string {
  return json(value).replace(/[<>&\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
}
/** Canonical supplied DTO bytes only; not a signed/stored financial document. */
export function canonicalValueReceiptPayload(receipt: ValueReceiptV3): string {
  return safeJson(normalized(receipt));
}
const textRef = (value: unknown): string => json(value)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/[\u2028\u2029\u202a-\u202e\u2066-\u2069]/g, c => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`);
const refs = (values: string[]): string => values.length ? values.map(textRef).join(", ") : "none supplied";
function amountText(amount: ValueAmountV3): string {
  return amount.state === "known"
    ? `${formatValueMoney(amount)}; currency=GBP; basis=${VALUE_V3_LABELS[amount.basis]}; sources=[${refs(amount.sourceRefs)}]`
    : `${formatValueMoney(amount)}; reason=${amount.reason}; basis/sources unavailable`;
}
/** All output is incomplete because CH9-S permits only illustrative_unbound inputs. */
export function renderValueReceipt(receipt: ValueReceiptV3): RenderedValueReceiptV3 {
  const v = normalized(receipt);
  const lines = [
    "Value receipt — supplied illustrative report", VALUE_V3_LABELS.illustration, VALUE_V3_LABELS.tax,
    "Incomplete — Source bindings held; supplied DTOs do not verify completeness, provenance, chronology or settlement.",
    `Scope: ${textRef(v.scopeKind)} ${textRef(v.scope)}; environment=${v.environment}; disclosure=${v.disclosure}`,
    `As-of supplied source vector: ${textRef(v.asOf.vector)}`,
    `Time contract: ${v.asOf.timeContract}; measure=${v.asOf.measure}; window=${textRef(v.asOf.window)}; selection semantics unbound`,
    "Currency: GBP; tax basis is stated for each amount; no tax outcome calculated.",
    "Policies/derivations: supplied per source below; missing bindings remain unavailable.",
    `category=checked; supplied count=${v.categories[0].count}; basis=count only; sources=[${refs(v.categories[0].sourceRefs)}]; policy/derivation=unavailable (binding held)`,
  ];
  const labels = {
    recorded: "Supplied recorded amount", settled: VALUE_V3_LABELS.settled,
    qualifying: "Supplied qualifying principal illustration", fee: "Fee illustration (SV-6 supplied)", remainder: VALUE_V3_LABELS.remainder,
  };
  for (const c of [v.categories[1], v.categories[2], v.categories[3], v.categories[4]]) {
    for (const key of ["recorded", "settled", "qualifying", "fee", "remainder"] as const) {
      lines.push(`category=${c.category}; ${labels[key]}: ${amountText(c[key])}; policy/derivation=see referenced supplied source ledger (unverified)`);
    }
  }
  for (const s of v.sources) {
    lines.push(`Source ${textRef(s.id)}; event=${textRef(s.eventId)}; revision=${s.revision}; category=${s.category}; scope=${textRef({ tenantId: s.tenantId, jobId: s.jobId, sessionRef: s.sessionRef })}; kind=${s.kind}; qualification=${s.qualification}; occurredAt=${textRef(s.occurredAt)}; corrects=${textRef(s.corrects)}; policy=${textRef(s.policyVersion)}; derivation=${textRef(s.derivationVersion)}`);
    for (const key of ["netMovement", "feeMovement"] as const) if (s[key] !== null) {
      lines.push(`category=${s.category}; ${key}=${formatValueMoney({ state: "known", money: s[key], basis: "net_principal", sourceRefs: [s.id] })}; currency=GBP; basis=net_principal; source=${textRef(s.id)}; policy=${textRef(s.policyVersion)}; derivation=${textRef(s.derivationVersion)}`);
    }
  }
  for (const f of v.facts) {
    const s = v.sources.find(source => source.id === f.sourceRef)!;
    lines.push(`Fact ${textRef(f.id)}; category=${s.category}; kind=${f.kind}${f.kind === "recorded_payment" ? `; ${VALUE_V3_LABELS.recorded}` : ""}; ${amountText({ state: "known", money: f.amount, basis: f.basis, sourceRefs: [f.sourceRef] })}; policy=${textRef(s.policyVersion)}; derivation=${textRef(s.derivationVersion)}`);
  }
  if (v.scopeKind === "business") {
    const s = v.subscription;
    lines.push(`Subscription — billing period only; period=${textRef(s.periodId)}; category=subscription; ${amountText(s.cost)}; period sources=[${refs(s.sourceRefs)}]; policy=${textRef(s.policyVersion)}; derivation=${textRef(s.derivationVersion)}`);
  }
  lines.push("Meter: Unavailable (MON-1 producer binding held)", "Fee posted (M4): Unavailable (not represented by CH9-S)", "Fee collected (M4): Unavailable (not represented by CH9-S)", "Fee refunded (M4): Unavailable (not represented by CH9-S)");
  return { version: "value-receipt-render.v1", mediaType: "text/plain", status: "incomplete", canonicalPayload: safeJson(v), text: lines.join("\n") };
}
