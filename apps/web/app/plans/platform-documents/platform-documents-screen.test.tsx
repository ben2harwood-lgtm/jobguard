import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { PLATFORM_INVOICE_WARNING } from "@jobguard/core";
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NOT_FOUND"); } }));
import Screen, { type PlatformDocumentsView } from "./platform-documents-screen";
import Page from "./page";
vi.stubGlobal("React", React);
it("shows the full warning first, empty state and no actions", () => {
  const html = renderToStaticMarkup(<Screen initial={{ version: "platform-documents.v1", collectionStarted: false, documents: [] }} />);
  expect(html.indexOf(PLATFORM_INVOICE_WARNING)).toBeLessThan(html.indexOf("<h1>"));
  expect(html).toContain("No documents have been issued.");
  expect(html.match(/tax invoice/g)).toHaveLength(1);
  expect(html).not.toMatch(/<button|<a |<form|download=/);
});
it("keeps subscription and fee lines separate, tolerates unfamiliar kinds, and renders server balances", () => {
  const lines = ["subscription", "success_fee", "future_kind"].map(kind => ({ id: kind, kind, policyVersion: "policy-ref", references: [{ name: "statement", id: "source-ref", hash: "a".repeat(64) }] }));
  const view: PlatformDocumentsView = { version: "platform-documents.v1", collectionStarted: false, documents: [{ issuerId: "issuer", invoice: { number: "SIM-PLATFORM-1", lines },
    credits: [{ number: "SIM-PLATFORM-2", lines: [] }], account: { principalPence: 2900, taxPence: 580, grossPence: 3480, alreadyPaidPence: 0, remainingCashDuePence: 3480, refundDuePence: 0, collectionStarted: false } }] };
  const html = renderToStaticMarkup(<Screen initial={view} />);
  for (const text of ["Subscription lines", "Fee and other lines", "future_kind", "source-ref", "Linked credit notes", "£34.80", "No payment is linked to these simulated documents yet."]) expect(html).toContain(text);
  expect(html).not.toMatch(/<button|<a |<form/);
});
it("keeps the page dark outside synthetic mode", () => {
  vi.stubEnv("JOBGUARD_ENV", "production"); expect(() => Page()).toThrow("NOT_FOUND"); vi.unstubAllEnvs();
});
