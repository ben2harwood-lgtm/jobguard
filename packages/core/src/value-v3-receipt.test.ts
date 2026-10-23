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
