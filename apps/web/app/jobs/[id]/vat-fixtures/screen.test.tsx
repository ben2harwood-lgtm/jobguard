import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { reconcileVatTreatmentFixtures, vatTreatmentFixtureBookV1, VAT_FIXTURE_LABEL, VAT_SUPPORT_MATRIX_VERSION } from "@jobguard/core";
import { VatFixtureScreen, VatFixtureDocuments } from "./screen";
vi.stubGlobal("React", React);
afterEach(() => { vi.unstubAllGlobals(); vi.stubGlobal("React", React); });
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
it("shows no saved figures or write form before the company session/read succeeds", () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  const html = renderToStaticMarkup(<VatFixtureScreen jobId={id(2)} issueRefusal="Server says real issue is disabled" />);
  expect(fetch).not.toHaveBeenCalled(); expect(html).not.toContain("<form"); expect(html).not.toContain("10000p");
  expect(html).toContain("practice calculation, approved by no adviser"); expect(html).toContain("No invoice is issued");
  expect(html).toContain("fixture lineage, not proof");
  expect(html).toContain("Server says real issue is disabled");
});
it("renders the server's separate figures and refusal; DRC is not a discount or waived debt", () => {
  const book = vatTreatmentFixtureBookV1.parse({ version: "vat.fixture-book.v1", matrixVersion: VAT_SUPPORT_MATRIX_VERSION, environment: "synthetic", label: VAT_FIXTURE_LABEL,
    tenantId: id(1), jobId: id(2), supplierReference: "Fictional supplier", customerReference: "Fictional customer", taxBasis: "net_after_retention", roundingVersion: "fixture_cumulative_group_half_up_v1",
    documents: [{ id: id(3), previousDocumentId: null, kind: "interim", documentReference: "Fictional document", documentDate: "2026-11-04", interimCertificationId: id(4), retentionProfileId: id(5), retentionReleaseId: null, creditOfDocumentId: null,
      groups: [{ treatment: "drc_20", cumulativeNetPence: 10000, retainedNetPence: 1000, eligibility: { source: "human_fixture", actorId: id(6), evidenceId: id(7), supplierVatRegistered: true, supplierVatNumber: "fictional-vat", customerVatRegistered: true, customerVatNumber: "fictional-customer-vat", customerEndUser: false, intermediarySupplier: false, constructionReverseChargeInScope: true, qualifyingBasisReference: "fictional basis" } }] }] });
  const reconciliation = reconcileVatTreatmentFixtures(book);
  const html = renderToStaticMarkup(<VatFixtureDocuments view={{ book, reconciliation, records: [], environment: "synthetic", label: VAT_FIXTURE_LABEL, lineage: "fixture lineage, never authority", issueRefusal: "Server says real issue is disabled", creditMethod: "Candidate method only" }} />);
  for (const label of ["Net", "Supplier VAT", "Customer-accounted reverse-charge VAT", "Gross", "Retained principal", "Expected cash", "This document movement", "Cumulative figures", VAT_SUPPORT_MATRIX_VERSION]) expect(html).toContain(label);
  for (const figure of ["10000p GBP", "0p GBP", "1800p GBP", "1000p GBP", "9000p GBP"]) expect(html).toContain(figure);
  expect(html).toContain("Reverse charge: customer to account for VAT to HMRC.");
  expect(html).not.toMatch(/discount|waived debt/u); expect(html).toContain('aria-disabled="true"');
  expect(html).toContain("Server says real issue is disabled"); expect(html).toContain("Candidate method only");
});
