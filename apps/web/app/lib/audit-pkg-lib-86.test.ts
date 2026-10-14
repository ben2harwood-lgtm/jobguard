import { expect, it } from "vitest";
import { merchantSourceRefs, parseSupplierSources } from "./recovery-case-requests";

const RATE = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const VERSION = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const fact = { document_number: "INV-M320-001", version_id: VERSION };
const material = { rateId: RATE, quantity: "40", eachPence: 2000 };

it.each(["40", "40.0", "40.000000"])(
  "materials-320 preserves recorded sources for equivalent decimal quantities (%s)",
  quantity => {
    const sources = parseSupplierSources({ materials: [{ ...material, quantity }] }, { state: { facts: [fact] } });
    expect(sources).toBeDefined();
    expect(merchantSourceRefs(sources!)).toEqual([RATE, VERSION]);
  },
);

it.each(["40.00", "40.000", "40.0000", "40.00000"])(
  "materials-320 preserves recorded sources at the remaining supported precisions (%s)",
  quantity => {
    expect(merchantSourceRefs({ materials: [{ ...material, quantity }], facts: [fact] })).toEqual([RATE, VERSION]);
  },
);

const fallback = ["Supplier agreement AG-320", "Delivery note DN-320", "Supplier invoice INV-320"];

it.each(["39.999999", "40.000001", "400", "040", "4e1", "40.", "40.0000000", " 40", "40 ", "40\n", "40.0\n"])(
  "materials-320 does not coerce a different or invalid quantity into a match (%s)",
  quantity => {
    expect(merchantSourceRefs({ materials: [{ ...material, quantity }], facts: [fact] })).toEqual(fallback);
  },
);

it("materials-320 keeps mixed-representation duplicate rates ambiguous", () => {
  expect(merchantSourceRefs({
    materials: [material, { ...material, quantity: "40.0", rateId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee" }],
    facts: [fact],
  })).toEqual(fallback);
});

it("materials-320 still requires the recorded rate, exact unit price and matching invoice", () => {
  for (const unmatched of [{ ...material, quantity: "40.0", eachPence: 2001 }, { ...material, quantity: "40.0", rateId: null }]) {
    expect(merchantSourceRefs({ materials: [unmatched], facts: [fact] })).toEqual(fallback);
  }
  expect(merchantSourceRefs({ materials: [{ ...material, quantity: "40.0" }], facts: [] })).toEqual(fallback);
  expect(merchantSourceRefs({
    materials: [{ ...material, quantity: "40.0" }],
    facts: [{ ...fact, document_number: "INV-MATERIALS-B" }],
  })).toEqual(fallback);
});
