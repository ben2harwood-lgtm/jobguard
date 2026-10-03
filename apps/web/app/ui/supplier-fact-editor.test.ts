import { afterEach, describe, expect, it, vi } from "vitest";
import * as React from "react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SupplierFactEditor } from "./supplier-fact-editor";

afterEach(() => { vi.unstubAllGlobals(); });

const proposal = { document_id: "doc", document_type: "invoice" as const, quantity_decimal: "10.000000", unit_price_pence: 2500, net_pence: 25000,
  source_page: 1, span_start: 0, span_end: 10, source_region: "line-1", source_hash: "hash", version_id: "version", source_text: "10 x 25.00", issues: [] };
const render = (fact: Parameters<typeof SupplierFactEditor>[0]["fact"]) => {
  // Vitest preserves the project's classic JSX transform; Next supplies its own runtime.
  vi.stubGlobal("React", React);
  return renderToStaticMarkup(createElement(SupplierFactEditor, { jobId: "render-only", fact }));
};

describe("SupplierFactEditor confirmed facts", () => {
  // The workspace read builds `confirmed` with row_to_json, which emits numeric(20,6) and bigint as JSON numbers.
  it("renders a confirmed revision whose numeric columns arrive as JSON numbers", () => {
    const html = render({ ...proposal, confirmed: { revision: 1, quantity_decimal: 10, unit_price_pence: 2500, net_pence: 25000, origin: "source" } });
    expect(html).toContain('data-testid="supplier-line-quantity">10<');
    expect(html).toContain("£25.00");
    expect(html).toContain("£250.00");
    expect(html).toContain("Confirmed revision 1");
  });
  it("keeps exact decimal digits from a string quantity", () => {
    const html = render({ ...proposal, quantity_decimal: "10.500000", net_pence: 26250, confirmed: null });
    expect(html).toContain('data-testid="supplier-line-quantity">10.5<');
  });
});
