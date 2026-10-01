import { describe, expect, it } from "vitest";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SupplierFactEditor, initialQuantity } from "./supplier-fact-editor";

const base = {
  document_id: "d1", document_type: "invoice" as const, quantity_decimal: "11.000000", unit_price_pence: 2000, net_pence: 22000,
  source_page: 1, span_start: 0, span_end: 1, source_region: "r", source_hash: "h", version_id: "v", source_text: "t", issues: [],
};

// Classic JSX transform needs React in scope for the component under test.
(globalThis as { React?: unknown }).React = React;

describe("supplier fact editor quantities", () => {
  // The API once sent numeric(20,6) as a JSON number (row_to_json), which crashed `.replace`.
  it("accepts a JSON number for the confirmed quantity", () => {
    const confirmed = { revision: 1, quantity_decimal: 10 as string | number, unit_price_pence: 2000 as string | number, net_pence: 20000 as string | number, origin: "entered_by_you" };
    expect(initialQuantity({ ...base, confirmed })).toBe("10");
    const html = renderToStaticMarkup(createElement(SupplierFactEditor, { jobId: "j", fact: { ...base, confirmed } }));
    expect(html).toContain('value="10"');
    expect(html).toContain('value="200.00"');
  });
  it("accepts a decimal string and trims trailing zeros", () => {
    expect(initialQuantity({ ...base, confirmed: { revision: 1, quantity_decimal: "10.500000", unit_price_pence: "2000", net_pence: "20000", origin: "source" } })).toBe("10.5");
    expect(initialQuantity({ ...base, confirmed: null })).toBe("11");
    expect(initialQuantity({ ...base, quantity_decimal: null, confirmed: null })).toBe("");
  });
});
