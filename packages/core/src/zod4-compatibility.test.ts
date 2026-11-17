import { describe, expect, it } from "vitest";
import { z } from "zod";
import { mobileAccessV1, mobileExchangeV1 } from "./mobile-auth.js";
import { quoteLineV1 } from "./quote.js";
import { utcDatetimeV1 } from "./datetime.js";
import { instantV1 } from "./receipt-allocation.js";
import { parseLogSorSiteExtra, parseOrderCheckQuery } from "./site-extra-pricing.js";
import { practiceFeedQueryV1 } from "./practice-feed.js";

// Keep the patch's short circuit observable without allocating a huge array or risking an OOM.
describe("Zod 4 migration boundary regressions", () => {
  it("rejects an oversized constrained array before reading any element", () => {
    let elementReads = 0;
    const oversized = new Proxy([], {
      get(target, key, receiver) {
        if (key === "length") return 100_000_000;
        if (typeof key === "string" && /^\d+$/u.test(key)) {
          elementReads++;
          throw new Error("oversized array elements must never be visited");
        }
        return Reflect.get(target, key, receiver);
      },
    });
    const parsed = z.array(z.object({ value: z.string() }).strict()).max(8).safeParse(oversized);
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues).toEqual([
      expect.objectContaining({ code: "too_big", maximum: 8, path: [] }),
    ]);
    expect(elementReads).toBe(0);
  }, 1000);

  it("keeps UUID syntax without newly requiring RFC variant bits", () => {
    const raw = { version: "mobile-exchange.v1", requestedTenantId: "12345678-1234-1234-1234-123456789abc" };
    expect(mobileExchangeV1.parse(raw)).toEqual(raw);
    for (const requestedTenantId of ["", "invalid", `${raw.requestedTenantId}x`, 123, null]) {
      expect(mobileExchangeV1.safeParse({ ...raw, requestedTenantId }).success).toBe(false);
    }
    expect(mobileExchangeV1.safeParse({ ...raw, tenantId: raw.requestedTenantId }).success).toBe(false);
  });

  it("keeps session credentials strict and integer prices nonnegative", () => {
    const credential = "a".repeat(43);
    expect(mobileAccessV1.safeParse({ version: "mobile-access.v1", credential }).success).toBe(true);
    for (const input of [credential.slice(1), `${credential}=`, null, 123]) {
      expect(mobileAccessV1.safeParse({ version: "mobile-access.v1", credential: input }).success).toBe(false);
    }
    expect(mobileAccessV1.safeParse({ version: "mobile-access.v1", credential, permissions: ["admin"] }).success).toBe(false);
    const price = quoteLineV1.shape.unitRatePence;
    for (const input of [-1, 0.5, "1", NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      expect(price.safeParse(input).success).toBe(false);
    }
    expect(price.parse(0)).toBe(0);
  });

  it("keeps offsets with and without colons and rejects invalid dates and offsets", () => {
    for (const value of ["2026-10-24T12:30Z", "2028-02-29T12:30Z", "2026-10-24T12:30+0130", "2026-10-24T12:30-23:59", "2026-10-24T12:30:59.123456+0130", "2026-10-24T12:30:59+01:30"]) {
      expect(instantV1.parse(value)).toBe(value);
      if (value.endsWith("Z")) expect(utcDatetimeV1.parse(value)).toBe(value);
    }
    for (const value of ["2026-02-30T12:30Z", "2026-10-24T25:30Z", "2026-10-24T12:30+2460", "2026-10-24T12:30:00+99:99", "2026-10-24T12:30"]) {
      expect(instantV1.safeParse(value).success).toBe(false);
    }
  });

  it("keeps UTC-only contracts accepting minute precision without accepting offsets", () => {
    for (const value of ["2026-10-24T12:30Z", "2028-02-29T12:30:59.123456789Z"]) expect(utcDatetimeV1.parse(value)).toBe(value);
    for (const value of ["2026-10-24T12:30+01:30", "2026-02-30T12:30Z", "2026-10-24T12:30", "2026-10-24T24:00Z"]) expect(utcDatetimeV1.safeParse(value).success).toBe(false);
  });

  it("reports one field issue for impossible offsets and preserves quantity error precedence", () => {
    for (const value of ["2026-10-24T12:30:00+99:99", "2026-10-24T12:30:00-2400"]) {
      const parsed = z.object({ recordedAt: instantV1 }).safeParse({ recordedAt: value });
      expect(parsed.success).toBe(false);
      if (!parsed.success) expect(parsed.error.issues.map(issue => issue.path)).toEqual([["recordedAt"]]);
    }
    const head = { version: "log-sor-site-extra.v1", commandId: "12345678-1234-1234-1234-123456789abc", sorCode: "A", note: "Synthetic extra" };
    for (const quantity of [undefined, null, "", 1, "0", "1.0000001"]) {
      expect(() => parseLogSorSiteExtra({ ...head, quantity })).toThrow("INVALID_QUANTITY");
      expect(() => parseOrderCheckQuery({ sorCode: "A", quantity })).toThrow("INVALID_QUANTITY");
      expect(() => parseLogSorSiteExtra({ ...head, commandId: "bad", quantity })).toThrow("INVALID_COMMAND");
    }
    expect(() => parseLogSorSiteExtra(head)).toThrow("INVALID_QUANTITY");
    expect(() => parseOrderCheckQuery({ sorCode: "A" })).toThrow("INVALID_QUANTITY");
  });

  it("parses query defaults and continues rejecting out-of-range limits", () => {
    expect(practiceFeedQueryV1.parse({ version: "practice-feed-query.v1" }).limit).toBe(20);
    expect(practiceFeedQueryV1.parse({ version: "practice-feed-query.v1", limit: "2" }).limit).toBe(2);
    for (const limit of [0, 51, 1.5, "bad"]) expect(practiceFeedQueryV1.safeParse({ version: "practice-feed-query.v1", limit }).success).toBe(false);
    // Prefaults, unlike v4 defaults, run the original checks and transforms.
    expect(z.string().trim().min(1).prefault(" value ").parse(undefined)).toBe("value");
    expect(z.string().min(1).prefault("").safeParse(undefined).success).toBe(false);
  });
});
