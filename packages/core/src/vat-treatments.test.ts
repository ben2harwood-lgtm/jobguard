import { describe, expect, it } from "vitest";
import { MAX_MONEY_PENCE } from "./money.js";
import { candidateM1TaxPolicy } from "./tax.js";
import { money } from "./money.js";
import {
  VAT_SUPPORT_MATRIX, VAT_SUPPORT_MATRIX_VERSION, VAT_FIXTURE_LABEL, VAT_TREATMENTS_ENABLED,
  VatTreatmentError, reconcileVatTreatmentFixtures, assertVatTreatmentIssueAllowed,
  type DarkVatTreatment, type VatTreatmentFixtureBook,
} from "./vat-treatments.js";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const codes = Object.keys(VAT_SUPPORT_MATRIX) as DarkVatTreatment[];
function fixture(code: DarkVatTreatment = "reduced_5"): VatTreatmentFixtureBook {
  return {
    version: "vat.fixture-book.v1", matrixVersion: VAT_SUPPORT_MATRIX_VERSION,
    environment: "synthetic", label: VAT_FIXTURE_LABEL, tenantId: id(1), jobId: id(2),
    supplierReference: "Fictional builder", customerReference: "Fictional customer",
    taxBasis: "net_after_retention", roundingVersion: "fixture_cumulative_group_half_up_v1",
    documents: [{
      id: id(10), previousDocumentId: null, kind: "interim", documentReference: "fixture-1",
      documentDate: "2026-10-31", interimCertificationId: id(20), retentionProfileId: id(30),
      retentionReleaseId: null, creditOfDocumentId: null,
      groups: [{ treatment: code, cumulativeNetPence: 10000, retainedNetPence: 1000, eligibility: {
        source: "human_fixture", actorId: id(3), evidenceId: id(4),
        supplierVatRegistered: code !== "non_vat", supplierVatNumber: code === "non_vat" ? null : "fixture-supplier-vat",
        customerVatRegistered: true, customerVatNumber: "fixture-customer-vat", customerEndUser: false,
        intermediarySupplier: false, constructionReverseChargeInScope: code.startsWith("drc"),
        qualifyingBasisReference: "fictional explicit qualification, not a job description",
      } }],
    }],
  };
}
function append(book: VatTreatmentFixtureBook, kind: "interim" | "credit_note" | "retention_release", net: number, retained: number) {
  const prior = book.documents.at(-1)!;
  const n = book.documents.length + 10;
  book.documents.push({ ...structuredClone(prior), id: id(n), previousDocumentId: prior.id, kind,
    documentReference: `fixture-${n}`, creditOfDocumentId: kind === "credit_note" ? prior.id : null,
    retentionReleaseId: kind === "retention_release" ? id(n + 100) : null,
    groups: prior.groups.map(g => ({ ...structuredClone(g), cumulativeNetPence: net, retainedNetPence: retained })),
  });
}
function last(book: VatTreatmentFixtureBook) { return reconcileVatTreatmentFixtures(book).documents.at(-1)!; }
function rejects(input: unknown, code: string) {
  try { reconcileVatTreatmentFixtures(input); throw new Error("Expected failure"); }
  catch (error) { expect(error).toBeInstanceOf(VatTreatmentError); expect(error).toMatchObject({ code }); }
}
function reconciles(book: VatTreatmentFixtureBook) {
  const result = reconcileVatTreatmentFixtures(book);
  let net = 0n, vat = 0n, gross = 0n, cash = 0n;
  for (const doc of result.documents) {
    for (const v of [doc.delta, doc.cumulative]) {
      expect(v.gross.pence).toBe(v.net.pence + v.vatToSupplier.pence);
      expect(v.expectedCash.pence).toBe(v.gross.pence - v.retained.pence);
      expect(v.fullValueGross.pence).toBe(v.gross.pence + v.retainedVat.pence);
      for (const value of Object.values(v)) expect(Number.isSafeInteger(value.pence)).toBe(true);
    }
    net += BigInt(doc.delta.net.pence); vat += BigInt(doc.delta.vatToSupplier.pence);
    gross += BigInt(doc.delta.gross.pence); cash += BigInt(doc.delta.expectedCash.pence);
    expect([net, vat, gross, cash]).toEqual([doc.cumulative.net, doc.cumulative.vatToSupplier,
      doc.cumulative.gross, doc.cumulative.expectedCash].map(value => BigInt(value.pence)));
  }
}

describe("M4-21 fixture, awaiting adviser approval", () => {
  it.each(codes)("%s remains disabled with no caller-supplied approval route", code => {
    expect(VAT_TREATMENTS_ENABLED).toBe(false);
    expect(VAT_SUPPORT_MATRIX[code].approval).toBe("not adviser-approved");
    const result = reconcileVatTreatmentFixtures(fixture(code));
    expect(result.issueBlockers).toContain("D02_D06_ADVISER_APPROVAL_REQUIRED");
    expect(result.label).toBe(VAT_FIXTURE_LABEL);
    expect(Object.isFrozen(VAT_SUPPORT_MATRIX[code].requiredFields)).toBe(true);
    expect(() => assertVatTreatmentIssueAllowed()).toThrow(expect.objectContaining({ code: "ISSUE_DISABLED" }));
    rejects({ ...fixture(code), adviserApproved: true }, "INVALID_INPUT");
  });
  it.each(codes)("%s reconciles partial bills, a credit and a retention release under both explicit bases", code => {
    for (const basis of ["full_net", "net_after_retention"] as const) {
      const book = fixture(code); book.taxBasis = basis;
      append(book, "interim", 20000, 2000);
      append(book, "credit_note", 15000, 1500);
      append(book, "retention_release", 15000, 0);
      reconciles(book);
      const release = last(book);
      expect(release.delta.net.pence).toBe(0);
      expect(release.delta.fullValueGross.pence).toBe(0);
      expect(release.delta.expectedCash.pence).toBeGreaterThanOrEqual(1500);
      expect(release.cumulative.retained.pence).toBe(0);
    }
  });
  it("uses exact cumulative group rounding so small part bills and credits do not lose pennies", () => {
    const book = fixture("reduced_5");
    book.documents[0]!.groups[0]!.cumulativeNetPence = 10;
    book.documents[0]!.groups[0]!.retainedNetPence = 0;
    append(book, "interim", 20, 0); append(book, "interim", 30, 0);
    expect(reconcileVatTreatmentFixtures(book).documents.map(d => d.delta.vatToSupplier.pence)).toEqual([1, 0, 1]);
    append(book, "credit_note", 20, 0); append(book, "credit_note", 0, 0);
    expect(reconcileVatTreatmentFixtures(book).documents.slice(-2).map(d => d.delta.vatToSupplier.pence)).toEqual([-1, -1]);
    reconciles(book);
  });
  it.each(["drc_20", "drc_5"] as const)("%s keeps customer debt intact and VAT accounted by customer separate", code => {
    const book = fixture(code), doc = last(book), rate = code === "drc_20" ? 20 : 5;
    expect(doc.cumulative.net.pence).toBe(10000);
    expect(doc.cumulative.gross.pence).toBe(10000);
    expect(doc.cumulative.vatToSupplier.pence).toBe(0);
    expect(doc.cumulative.reverseChargeVat.pence).toBe(rate === 20 ? 1800 : 450);
    expect(doc.cumulative.expectedCash.pence).toBe(9000);
    expect(doc.groups[0]!.wording).toContain("customer to account");
    append(book, "retention_release", 10000, 0);
    expect(last(book).delta.reverseChargeVat.pence).toBe(rate === 20 ? 200 : 50);
    expect(last(book).delta.expectedCash.pence).toBe(1000);
  });
  it("groups mixed zero, reduced and standard fixtures independently", () => {
    const book = fixture("standard_20");
    book.documents[0]!.groups.push(fixture("zero").documents[0]!.groups[0]!, fixture("reduced_5").documents[0]!.groups[0]!);
    expect(last(book).cumulative).toMatchObject({ net: { pence: 30000 }, vatToSupplier: { pence: 2250 },
      gross: { pence: 32250 }, retained: { pence: 3000 }, retainedVat: { pence: 250 }, expectedCash: { pence: 29250 } });
    reconciles(book);
    book.documents[0]!.groups.push(fixture("non_vat").documents[0]!.groups[0]!);
    rejects(book, "ELIGIBILITY_CONFLICT");
  });
  it("rejects unsupported, absent or model-inferred eligibility with no default to 20%", () => {
    for (const field of ["treatment", "eligibility"] as const) {
      const book = fixture(); const group = book.documents[0]!.groups[0]!;
      const { [field]: _missing, ...incomplete } = group;
      rejects({ ...book, documents: [{ ...book.documents[0], groups: [incomplete] }] }, "INVALID_INPUT");
    }
    for (const e of [{ source: "model" }, { supplierVatRegistered: undefined }, { customerEndUser: undefined },
      { qualifyingBasisReference: "" }]) {
      const book = fixture(); Object.assign(book.documents[0]!.groups[0]!.eligibility, e); rejects(book, "INVALID_INPUT");
    }
    for (const value of ["exempt", "cis", "unknown"]) {
      const book = fixture(); Object.assign(book.documents[0]!.groups[0]!, { treatment: value }); rejects(book, "INVALID_INPUT");
    }
  });
  it.each([{ customerEndUser: true }, { intermediarySupplier: true }, { customerVatRegistered: false },
    { supplierVatRegistered: false }, { constructionReverseChargeInScope: false }])("rejects conflicting DRC status %j", change => {
    const book = fixture("drc_20"); Object.assign(book.documents[0]!.groups[0]!.eligibility, change);
    rejects(book, "ELIGIBILITY_CONFLICT");
  });
  it("does not change the M1 20%-only policy", () => {
    expect(candidateM1TaxPolicy.calculateGroup(money(100), "standard_rate_20").pence).toBe(20);
    for (const code of codes) expect(() => candidateM1TaxPolicy.calculateGroup(money(100), code)).toThrow();
  });
  it("blocks missing lineage, duplicate documents/groups and rewritten eligibility", () => {
    const book = fixture(); append(book, "credit_note", 5000, 500);
    for (const change of [{ creditOfDocumentId: id(999) }, { previousDocumentId: null }, { retentionProfileId: id(999) },
      { id: id(10) }, { documentReference: "fixture-1" }]) {
      const invalid = structuredClone(book); Object.assign(invalid.documents[1]!, change); rejects(invalid, "INVALID_LINEAGE");
    }
    const rewritten = structuredClone(book); rewritten.documents[1]!.groups[0]!.eligibility.evidenceId = id(99);
    rejects(rewritten, "INVALID_LINEAGE");
    const duplicate = fixture(); duplicate.documents[0]!.groups.push(duplicate.documents[0]!.groups[0]!);
    rejects(duplicate, "INVALID_LINEAGE");
  });
  it("bounds credits, release movements, pence and gross aggregates", () => {
    for (const [kind, net, retained] of [["credit_note", 11000, 1000], ["credit_note", 9000, 2000],
      ["retention_release", 9000, 0], ["retention_release", 10000, 2000], ["interim", 9000, 0]] as const) {
      const book = fixture(); append(book, kind, net, retained); rejects(book, "VALUE_LIMIT");
    }
    for (const value of [-1, 1.5, Number.MAX_SAFE_INTEGER, MAX_MONEY_PENCE + 1]) {
      const book = fixture(); book.documents[0]!.groups[0]!.cumulativeNetPence = value; rejects(book, "INVALID_INPUT");
    }
    const overflow = fixture("standard_20"); overflow.documents[0]!.groups[0]!.cumulativeNetPence = MAX_MONEY_PENCE;
    rejects(overflow, "VALUE_LIMIT");
    const overRetained = fixture(); overRetained.documents[0]!.groups[0]!.retainedNetPence = 10001;
    rejects(overRetained, "VALUE_LIMIT");
  });
  it("blocks aggregate overflow, duplicate release allocation and release disguised as interim billing", () => {
    const overflow = fixture("zero");
    overflow.documents[0]!.groups[0]!.cumulativeNetPence = MAX_MONEY_PENCE;
    const second = fixture("reduced_5").documents[0]!.groups[0]!;
    second.cumulativeNetPence = 1; second.retainedNetPence = 0;
    overflow.documents[0]!.groups.push(second); rejects(overflow, "VALUE_LIMIT");
    const releases = fixture(); append(releases, "retention_release", 10000, 500);
    append(releases, "retention_release", 10000, 0);
    releases.documents[2]!.retentionReleaseId = releases.documents[1]!.retentionReleaseId;
    rejects(releases, "INVALID_LINEAGE");
    const disguised = fixture(); append(disguised, "interim", 10000, 0);
    rejects(disguised, "VALUE_LIMIT");
  });
  it("copies input, freezes outputs and rejects unrecognised policy/environment versions", () => {
    const book = fixture(), before = JSON.stringify(book), result = reconcileVatTreatmentFixtures(book);
    expect(JSON.stringify(book)).toBe(before); expect(Object.isFrozen(book)).toBe(false);
    expect(Object.isFrozen(result.documents[0]!.source.groups)).toBe(true);
    for (const change of [{ environment: "production" }, { matrixVersion: "approved" }, { taxBasis: "auto" },
      { roundingVersion: "unversioned" }, { label: "approved" }]) rejects({ ...book, ...change }, "INVALID_INPUT");
  });
});
