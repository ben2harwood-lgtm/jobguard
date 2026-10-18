import { describe, expect, it } from "vitest";
import { MAX_MONEY_PENCE } from "./money.js";
import { assertReviewConfirmable, proposalReviewV1, type ProposalReview } from "./review.js";

const id = (n: number) => `${String(n).padStart(8, "0")}-0000-4000-8000-000000000000`;
const review: ProposalReview = {
  version: "proposal_review_v1", reviewId: id(1), proposalId: id(2), jobId: id(3), revision: 0,
  lines: [{ id: id(4), scopeItemId: id(5), origin: "proposal", description: "Fictional cabinets",
    room: "Kitchen", category: "Joinery", quantity: "1", unit: "item", unitPricePence: null,
    disposition: "accepted", dismissalReason: null, parentScopeItemIds: [], sourceExcerpt: "cabinets" }],
  questions: [],
};
const withCommercial = (quantity: string | null, unitPricePence: number | null): ProposalReview => ({
  ...review, lines: [{ ...review.lines[0]!, quantity, unitPricePence }],
});

describe("LATER-B8 review boundaries", () => {
  it.each([MAX_MONEY_PENCE + 1, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1, 0.5, -1, NaN, Infinity])(
    "L011 review rejects over-limit money and excess quantity precision: rate %s", unitPricePence => {
      const input = withCommercial("1", unitPricePence);
      expect(proposalReviewV1.safeParse(input).success).toBe(false);
      expect(() => assertReviewConfirmable(input)).toThrow();
    });

  it.each(["1.0000001", "0.1234567", "01", "1.", ".1", "-1", "1e2", " 1"])(
    "L011 review rejects over-limit money and excess quantity precision: quantity %s", quantity => {
      const input = withCommercial(quantity, null);
      expect(proposalReviewV1.safeParse(input).success).toBe(false);
      expect(() => assertReviewConfirmable(input)).toThrow();
    });

  it.each(["0", "1", "1.000001", "0.123456"])(
    "L011 preserves declared quantity precision and inclusive money limit: %s", quantity => {
      expect(() => assertReviewConfirmable(withCommercial(quantity, MAX_MONEY_PENCE))).not.toThrow();
      expect(() => assertReviewConfirmable(withCommercial(quantity, 0))).not.toThrow();
      expect(() => assertReviewConfirmable(withCommercial(quantity, null))).not.toThrow();
    });

  it("L011 permits unknown commercial fields while reviewing", () => {
    expect(proposalReviewV1.parse(withCommercial(null, null)).lines[0]!.quantity).toBeNull();
  });

  it("L011 validates commercial fields on dismissed lines too", () => {
    const input = withCommercial("1.0000001", MAX_MONEY_PENCE + 1);
    input.lines[0] = { ...input.lines[0]!, disposition: "dismissed", dismissalReason: "Duplicate" };
    expect(proposalReviewV1.safeParse(input).success).toBe(false);
  });
});
