import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { PracticePayNowView } from "./screen";
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
import Page from "./page";
it.each([1, 12000, 1000000000000])("renders %i pence with identical option markup and no action", pence => {
  const view = { invoiceNumber: "TEST-1", amountDue: { pence, currency: "GBP" as const }, options: (["bank_transfer", "card", "pay_by_bank"] as const).map(rail => ({ rail, customerTotal: { pence, currency: "GBP" as const } })) };
  const html = renderToStaticMarkup(<PracticePayNowView view={view} />);
  expect(html).not.toMatch(/surcharge|fee|catch|button|href|form/iu);
  const items = html.match(/<li[^>]*>.*?<\/li>/gu)!;
  expect(items).toHaveLength(3);
  expect(new Set(items.map(item => item.replace(/Bank transfer|Card|Pay by bank/gu, "OPTION"))).size).toBe(1);
  expect(html.indexOf("Bank transfer")).toBeLessThan(html.indexOf("Card"));
  expect(html.indexOf("Card")).toBeLessThan(html.indexOf("Pay by bank"));
});
it("keeps the page dark outside synthetic demo", () => {
  vi.stubEnv("JOBGUARD_ENV", "production");
  try { expect(Page).toThrow("NOT_FOUND"); } finally { vi.unstubAllEnvs(); }
});
