import { describe, expect, it } from "vitest";
import { illustrativeValueCases } from "./value-v3.fixtures.js";
import type { ValueReceiptV3 } from "./value-v3.js";
import { canonicalValueReceiptPayload, renderValueReceipt } from "./value-v3-receipt.js";

const clone = <T>(v: T): T => structuredClone(v);
function business(): ValueReceiptV3 {
  const v = illustrativeValueCases.recovery;
  return { ...clone(v), scopeKind: "business", scope: { tenantId: "tenant", sessionRef: "session" },
    subscription: { periodId: "period-1", policyVersion: "d09-proposed", derivationVersion: "mon-fixture.v1", sourceRefs: ["meter-event"], cost: { state: "known", money: { pence: 8900, currency: "GBP" }, basis: "gross", sourceRefs: ["meter-event"] } } };
}
describe("CH9-R supplied illustrative receipt preparation", () => {
  it("R01 canonicalizes every unordered reference collection and object key without mutation", () => {
    const a = clone(illustrativeValueCases.reversed);
    a.asOf.vector.push({ producer: "other", revision: "r1" });
    a.categories[0] = { category: "checked", count: 2, sourceRefs: a.sources.map(s => s.id) };
    const b = clone(a);
    b.sources.reverse(); b.asOf.vector.reverse(); b.categories[0].sourceRefs.reverse();
    for (const c of b.categories.slice(1)) if ("recorded" in c) for (const k of ["recorded", "settled", "qualifying", "fee", "remainder"] as const) if (c[k].state === "known") c[k].sourceRefs.reverse();
    const before = JSON.stringify(a);
    // Explicit whole-object key reordering without pruning nested fields.
    const reordered = Object.fromEntries(Object.entries(a).reverse()) as unknown as ValueReceiptV3;
    expect(canonicalValueReceiptPayload(reordered)).toBe(canonicalValueReceiptPayload(a));
    expect(canonicalValueReceiptPayload(b)).toBe(canonicalValueReceiptPayload(a));
    expect(renderValueReceipt(b)).toEqual(renderValueReceipt(a));
    expect(JSON.stringify(a)).toBe(before);
    const core = clone(illustrativeValueCases.core); core.facts.reverse(); core.sources.reverse();
    expect(renderValueReceipt(core)).toEqual(renderValueReceipt(illustrativeValueCases.core));
  });
  it("R02 changed illustration/reversal changes body and retains original bytes", () => {
    const original = clone(illustrativeValueCases.recovery), before = JSON.stringify(original);
    expect(renderValueReceipt(original).text).not.toBe(renderValueReceipt(illustrativeValueCases.reversed).text);
    expect(JSON.stringify(original)).toBe(before);
    expect(renderValueReceipt(illustrativeValueCases.reversed).text).toContain("corrects=\"withheld\"");
  });
  it("R03 fails missing, wrong-job and wrong-session references without claiming provenance", () => {
    for (const mutate of [(v: ValueReceiptV3) => { v.sources = []; }, (v: ValueReceiptV3) => { v.sources[0]!.jobId = "foreign"; }, (v: ValueReceiptV3) => { v.sources[0]!.sessionRef = "foreign"; }]) {
      const v = clone(illustrativeValueCases.recovery); mutate(v);
      expect(() => renderValueReceipt(v)).toThrow();
    }
    expect(renderValueReceipt(illustrativeValueCases.recovery).status).toBe("incomplete");
    const omitted = clone(illustrativeValueCases.recovery); omitted.sources = []; omitted.categories[4] = clone(illustrativeValueCases.core.categories[4]);
    // Structurally valid omissions are unknowable to this formatter; never a complete claim.
    expect(renderValueReceipt(omitted).status).toBe("incomplete");
  });
  it("R05 subscription stays period-only with its own trace and canonical order", () => {
    const a = business();
    expect(renderValueReceipt(a).text).toContain("Subscription — billing period only");
    expect(renderValueReceipt(a).text).toContain("£89.00");
    expect(renderValueReceipt(a).text).toContain("mon-fixture.v1");
    if (a.scopeKind !== "business") throw new Error("fixture");
    a.subscription.sourceRefs.push("second-period-event");
    if (a.subscription.cost.state === "known") a.subscription.cost.sourceRefs.push("second-period-event");
    const b = clone(a);
    b.subscription.sourceRefs.reverse();
    if (b.subscription.cost.state === "known") b.subscription.cost.sourceRefs.reverse();
    expect(renderValueReceipt(b)).toEqual(renderValueReceipt(a));
    const bad = { ...clone(illustrativeValueCases.recovery), subscription: (a as Extract<ValueReceiptV3, { scopeKind: "business" }>).subscription };
    expect(() => renderValueReceipt(bad)).toThrow();
  });
  it("R06 emits escaped plain text and no links, rejecting external/path targets and extra link fields", () => {
    const v = clone(illustrativeValueCases.recovery);
    v.asOf.vector[0]!.revision = '<script>alert("£雪")</script>\n' + "x".repeat(140);
    const text = renderValueReceipt(v).text;
    expect(text).toContain("&lt;script&gt;"); expect(text).not.toContain("<script>"); expect(text).toContain("雪");
    const payload = canonicalValueReceiptPayload(v);
    expect(payload).not.toContain("<script>");
    expect(JSON.parse(payload)).toEqual(v);
    expect(text).toContain("\\n");
    for (const target of ["https://evil.invalid/job", "//evil.invalid", "/jobs/foreign", "javascript:alert(1)", "data:text/html,evil", "../foreign"]) {
      const bad = clone(illustrativeValueCases.recovery); bad.asOf.vector[0]!.revision = target;
      expect(() => renderValueReceipt(bad)).toThrow();
    }
    expect(() => renderValueReceipt({ ...v, href: "/jobs/foreign" } as unknown as ValueReceiptV3)).toThrow();
  });
  it("R07 unavailable and incomplete amounts remain unavailable, including subscription", () => {
    const v = business(); if (v.scopeKind !== "business") throw new Error("fixture");
    v.subscription.cost = { state: "incomplete", reason: "binding_held" };
    const result = renderValueReceipt(v);
    expect(result.text).toContain("Unavailable (incomplete); reason=binding_held");
    expect(result.text).not.toContain("£89.00");
    expect(result.text).toContain("Meter: Unavailable");
    expect(result.text).toContain("Supplied settled amount; source binding held: Unavailable (unknown)");
  });
  it("rejects unsupported M4 paid claims and duplicate sources", () => {
    const v = clone(illustrativeValueCases.recovery); v.sources.push(clone(v.sources[0]!));
    expect(() => canonicalValueReceiptPayload(v)).toThrow();
    expect(() => renderValueReceipt({ ...illustrativeValueCases.recovery, collectedPence: 28200 } as unknown as ValueReceiptV3)).toThrow();
  });
});

it.each([2000000 / 43, 24691 / 2])("fractional principal %s stays not yet complete without an upstream policy", fractionalPence => {
  const v = clone(illustrativeValueCases.recovery);
  for (const key of ["settled", "qualifying", "fee", "remainder"] as const) {
    v.categories[4][key] = { state: "incomplete", reason: "fractional_pence_requires_upstream_policy" };
  }
  const unsupported = clone(v);
  unsupported.categories[4].qualifying = { state: "known", money: { pence: fractionalPence, currency: "GBP" }, basis: "net_principal", sourceRefs: ["withheld"] };
  expect(() => renderValueReceipt(unsupported)).toThrow();
  const text = renderValueReceipt(v).text;
  for (const label of ["Supplied settled amount; source binding held", "Supplied qualifying principal illustration", "Fee illustration (SV-6 supplied)", "yours before VAT and tax"]) {
    expect(text.split("\n")).toContain(`category=withheld; ${label}: Not yet complete — Unavailable (incomplete); reason=fractional_pence_requires_upstream_policy; basis/sources unavailable; policy/derivation=see referenced supplied source ledger (unverified)`);
  }
  expect(text).not.toContain("£");
  expect(renderValueReceipt(v).status).toBe("incomplete");
});
it("rejects fractional pence and undeclared rational transports instead of rounding", () => {
  const v = clone(illustrativeValueCases.recovery);
  v.categories[4].qualifying = { state: "known", money: { pence: 24691 / 2, currency: "GBP" }, basis: "net_principal", sourceRefs: ["withheld"] };
  expect(() => renderValueReceipt(v)).toThrow();
  const rational = { state: "known", numerator: "2000000", denominator: "43", basis: "net_principal", sourceRefs: ["withheld"] };
  expect(() => renderValueReceipt({ ...v, categories: [v.categories[0], v.categories[1], v.categories[2], v.categories[3], { ...v.categories[4], qualifying: rational }] } as unknown as ValueReceiptV3)).toThrow();
});
it("rejects fees above known qualifying principal even with unavailable remainder", () => {
  for (const principal of [0, 100]) {
    const v = clone(illustrativeValueCases.recovery);
    v.categories[4].qualifying = { state: "known", money: { pence: principal, currency: "GBP" }, basis: "net_principal", sourceRefs: ["withheld"] };
    v.categories[4].remainder = { state: "unknown", reason: "not_reported" };
    expect(() => renderValueReceipt(v)).toThrow(/Positive fee requires sufficient known qualifying principal/);
  }
});

it.each([
  ["gross", "Gross (including any invoice VAT)"],
  ["net_principal", "Net principal (excluding VAT)"],
] as const)("R04 capture summary states the exact %s basis without an ownership claim", (basis, label) => {
  const v = clone(illustrativeValueCases.shadow);
  const tracked = v.categories[1];
  if (tracked.recorded.state !== "known") throw new Error("fixture requires known capture");
  tracked.recorded.basis = basis;
  const lines = renderValueReceipt(v).text.split("\n");
  expect(lines.filter(line => line.includes("Builder capture —"))).toEqual([
    `category=tracked; Builder capture — JobGuard fee is £0.00; currency=GBP; basis=Net principal (excluding VAT); sources=["capture"]; recorded amount basis=${label}; policy/derivation=see referenced supplied source ledger (unverified)`,
  ]);
});
