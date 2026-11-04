import "server-only";
import { CisFixtureApplication } from "@jobguard/api/workspace";
import { CisFixtureRepository } from "@jobguard/db";
import { CIS_FIXTURE_LABEL, CIS_POLICY_VERSION, VAT_FIXTURE_LABEL, VAT_SUPPORT_MATRIX_VERSION,
  type CisFixtureBook } from "@jobguard/core";
import { identityApplication } from "./identity-server";
import { syntheticPool } from "./synthetic-server";
// Labelled fictional starting book: £100 net, £20 supplier VAT, £10 retention.
// These snapshots join no VAT, retention, invoice or payment tables.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export function cisStartingBook(tenantId: string, jobId: string): CisFixtureBook {
  const context = (n: number) => ({ id: id(n), tenantId, jobId });
  return {
    version: "cis.fixture-book.v1", environment: "synthetic", label: CIS_FIXTURE_LABEL, policyVersion: CIS_POLICY_VERSION,
    tenantId, jobId, direction: "customer_receipt", contractorReference: "Fictional contractor", subcontractorReference: "Fictional builder",
    vatBook: {
      version: "vat.fixture-book.v1", matrixVersion: VAT_SUPPORT_MATRIX_VERSION, environment: "synthetic", label: VAT_FIXTURE_LABEL,
      tenantId, jobId, supplierReference: "Fictional builder", customerReference: "Fictional contractor",
      taxBasis: "full_net", roundingVersion: "fixture_cumulative_group_half_up_v1",
      documents: [{ id: id(10), previousDocumentId: null, kind: "interim", documentReference: "VAT-fixture-1",
        documentDate: "2026-10-01", interimCertificationId: id(11), retentionProfileId: id(20), retentionReleaseId: null, creditOfDocumentId: null,
        groups: [{ treatment: "standard_20", cumulativeNetPence: 10000, retainedNetPence: 1000, eligibility: {
          source: "human_fixture", actorId: id(3), evidenceId: id(4), supplierVatRegistered: true,
          supplierVatNumber: "fixture-vat", customerVatRegistered: true, customerVatNumber: "fixture-customer-vat",
          customerEndUser: true, intermediarySupplier: false, constructionReverseChargeInScope: false, qualifyingBasisReference: "fixture-basis",
        } }],
      }],
    },
    retentionBook: { version: "retention.book.v1", environment: "synthetic", tenantId, jobId, records: [{
      ...context(20), version: "retention.profile.v1", revision: 1, previousProfileId: null,
      contractProfileVersion: "fixture-v1", fixtureApprovalId: id(5), taxTreatmentVersion: "fixture-full-net-v1",
      retained: { netPence: 1000, taxPence: 0 }, alreadyBilled: { netPence: 0, taxPence: 0 },
      conditions: [{ id: id(21), milestone: "completion", description: "Fictional completion", dueDate: "2027-01-01",
        source: { kind: "human_input", actorId: id(3), inputId: id(4) }, dateSource: { kind: "human_input", actorId: id(3), inputId: id(4) },
        cumulativeLimit: { netPence: 1000, taxPence: 0 } }],
    }] },
    verifications: [{ ...context(30), version: "cis.verification-fixture.v1", contractorReference: "Fictional contractor",
      subcontractorReference: "Fictional builder", status: "registered", evidenceId: id(31), evidenceReference: "fictional-status-record", recordedBy: id(3),
      validFrom: "2026-10-01", validThrough: "2026-11-05" }],
    payments: [], statements: [{ ...context(40), version: "cis.statement-fixture.v1", previousStatementId: null,
      kind: "payment", correctionOfStatementId: null, documentReference: "CIS-fixture-1", documentDate: "2026-10-31", taxMonthEnd: "2026-11-05",
      humanApproval: { actorId: id(3), decisionId: id(6), sourceCalculationReference: "fictional-calculation-1" },
      verificationId: id(30), vatDocumentId: id(10), retentionProfileId: id(20), cumulativePaidNetPence: 4000,
      cumulativeDirectMaterialsPence: 1000, materialsEvidenceId: id(32), cumulativePaidVatPence: 0, paymentRecordIds: [],
    }],
  };
}

export function cisFixtureApplication() {
  return new CisFixtureApplication(identityApplication(), new CisFixtureRepository(syntheticPool()), cisStartingBook);
}
