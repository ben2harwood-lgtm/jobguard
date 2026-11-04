import { beforeAll, describe, expect, it } from "vitest";
import {
  merchantConformanceCheckNames, runMerchantConformanceKit,
  type MerchantConformanceResult, type MerchantConformanceCheckResult,
} from "./merchant-conformance-kit.js";
import { createBadMerchantFake, createGoodMerchantFake } from "./merchant-conformance-fakes.js";

describe("M5-5 fictional merchant adapter conformance", () => {
  let good: MerchantConformanceCheckResult[];
  let bad: MerchantConformanceCheckResult[];
  beforeAll(async () => {
    good = await runMerchantConformanceKit(createGoodMerchantFake);
    bad = await runMerchantConformanceKit(createBadMerchantFake);
  });
  it.each(merchantConformanceCheckNames)("good passes and bad fails %s", (check) => {
    expect(good.find((entry) => entry.check === check)).toEqual({ check, passed: true });
    expect(bad.find((entry) => entry.check === check)).toEqual({ check, passed: false });
  });
  it.each(["delivery", "settlement"] as const)("rejects acknowledgment promoted only to %s", async (effect) => {
    const results = await runMerchantConformanceKit(() => {
      const adapter = createGoodMerchantFake();
      return { ...adapter, async snapshot(ctx) {
        const snapshot = await adapter.snapshot(ctx);
        const ack = snapshot.documents.find((entry) => entry.source.type === "acknowledgment");
        if (ack && effect === "delivery") snapshot.deliverySourceIds.push(ack.id);
        if (ack && effect === "settlement") snapshot.settledPence = 100;
        return snapshot;
      } };
    });
    expect(results.filter((entry) => !entry.passed).map((entry) => entry.check)).toEqual([
      "document_meanings", "acknowledgment_not_delivery_or_settlement",
    ]);
  });
  it.each(["audit", "fallback", "throw"] as const)("requires audited fallback on outage and drift: %s fault", async (fault) => {
    const results = await runMerchantConformanceKit(() => {
      const adapter = createGoodMerchantFake();
      return { ...adapter, async receive(input) {
        const result = await adapter.receive(input);
        if (result.status === "held" && fault === "throw") throw new Error("Fictional outage");
        if (result.status === "held" && fault === "fallback") {
          return { status: "held", reason: result.reason } as MerchantConformanceResult;
        }
        return result;
      }, async snapshot(ctx) {
        const snapshot = await adapter.snapshot(ctx);
        if (fault === "audit") snapshot.audit = [];
        return snapshot;
      } };
    });
    for (const check of ["outage", "schema_change"]) expect(results.find((entry) => entry.check === check)?.passed).toBe(false);
  });
  it("compares source and result values independently of object key order", async () => {
    const results = await runMerchantConformanceKit(() => {
      const adapter = createGoodMerchantFake();
      return { ...adapter, async receive(input) {
        const result = await adapter.receive(input);
        return Object.fromEntries(Object.entries(result).reverse()) as MerchantConformanceResult;
      }, async snapshot(ctx) {
        const snapshot = await adapter.snapshot(ctx);
        snapshot.documents = snapshot.documents.map((document) => ({ ...document,
          source: { text: document.source.text, number: document.source.number, type: document.source.type,
            supplierAccount: document.source.supplierAccount, version: document.source.version },
        }));
        return snapshot;
      } };
    });
    expect(results.every((entry) => entry.passed)).toBe(true);
  });
  it("keeps running named checks when adapter construction throws", async () => {
    expect(await runMerchantConformanceKit(() => { throw new Error("Fictional setup failure"); }))
      .toEqual(merchantConformanceCheckNames.map((check) => ({ check, passed: false })));
  });
});
