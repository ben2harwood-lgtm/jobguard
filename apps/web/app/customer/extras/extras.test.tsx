import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { candidateM1TaxPolicy, money } from "@jobguard/core";
import { expect, it } from "vitest";
import { extraPriceWords } from "./extras";

it.each([
  [14000, "£140.00 plus VAT £28.00 · total £168.00", "£168.00"],
  [5000, "£50.00 plus VAT £10.00 · total £60.00", "£60.00"],
  [1234, "£12.34 plus VAT £2.47 · total £14.81", "£14.81"],
  [-2500, "−£25.00 plus VAT −£5.00 · total −£30.00", "−£30.00"],
  [150000, "£1,500.00 plus VAT £300.00 · total £1,800.00", "£1,800.00"],
])("renders the price and approval wording for %i pence", (pence, expectedPrice, total) => {
  const { price, approval } = extraPriceWords(pence, 1);
  const html = renderToStaticMarkup(<><p>{price}</p><button>{approval}</button></>);
  expect(html).toContain(`Revision 1 · ${expectedPrice}`);
  expect(html).toContain(`<button>Approve revision 1 for ${total} including VAT</button>`);
});

it("uses the invoice tax policy for an amount that needs rounding", () => {
  const vat = candidateM1TaxPolicy.calculateGroup(money(1234), "standard_rate_20");
  const formattedVat = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(vat.pence / 100);
  expect(extraPriceWords(1234, 1).price).toContain(`plus VAT ${formattedVat}`);
});
