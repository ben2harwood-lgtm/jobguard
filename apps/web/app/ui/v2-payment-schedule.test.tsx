import React from "react";
import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { V2PaymentSchedule } from "./v2-payment-schedule";
it("shows a loading state and the net practice boundary without invoice actions", () => {
  const html = renderToStaticMarkup(<V2PaymentSchedule jobId="11111111-1111-4111-8111-111111111111"/>);
  expect(html).toContain("Payment schedule");
  expect(html).toContain("Every amount here is ex-VAT");
  expect(html).toContain("No invoice is drafted or issued");
  expect(html).toContain("nothing is sent or charged");
  expect(html).toContain("Loading payment schedule");
  expect(html).not.toContain("Send invoice");
});
