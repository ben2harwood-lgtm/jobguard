import { describe, expect, it } from "vitest";
import { quoteDeliveredFrom } from "./quote-sent";

describe("TOMMY-DEMO: quoteDeliveredFrom", () => {
  it("counts only a saved simulated delivery as sent", () => {
    expect(quoteDeliveredFrom({ status: "simulated_delivery", reference: "Q-1" })).toBe(true);
    for (const status of ["previewed", "queued", "outcome_unknown", "retryable", "cancelled", undefined]) expect(quoteDeliveredFrom({ status })).toBe(false);
    expect(quoteDeliveredFrom(null)).toBe(false);
    expect(quoteDeliveredFrom("simulated_delivery")).toBe(false);
  });
});
