import { describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { CIS_FIXTURE_LABEL, CIS_POLICY_VERSION, VAT_FIXTURE_LABEL, VAT_SUPPORT_MATRIX_VERSION,
  CIS_ENABLED, assertCisIssueAllowed, type CisFixtureBook, type DarkVatTreatment } from "@jobguard/core";
import { CisFixtureRepository } from "../src/cis-fixture-repository.js";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const tenantId = id(1), jobId = id(2);
const context = (n: number) => ({ id: id(n), tenantId, jobId });
function fixture(code: DarkVatTreatment = "standard_20", status: "gross_payment" | "registered" | "unregistered" = "registered"): CisFixtureBook {
  const registered = code !== "non_vat", drc = code.startsWith("drc");
  return {
    version: "cis.fixture-book.v1", environment: "synthetic", label: CIS_FIXTURE_LABEL, policyVersion: CIS_POLICY_VERSION,
    tenantId, jobId, direction: "customer_receipt", contractorReference: "Fictional contractor", subcontractorReference: "Fictional builder",
    vatBook: {
      version: "vat.fixture-book.v1", matrixVersion: VAT_SUPPORT_MATRIX_VERSION, environment: "synthetic", label: VAT_FIXTURE_LABEL,
      tenantId, jobId, supplierReference: "Fictional builder", customerReference: "Fictional contractor",
      taxBasis: "full_net", roundingVersion: "fixture_cumulative_group_half_up_v1",
      documents: [{ id: id(10), previousDocumentId: null, kind: "interim", documentReference: "VAT-fixture-1",
        documentDate: "2026-10-01", interimCertificationId: id(11), retentionProfileId: id(20), retentionReleaseId: null, creditOfDocumentId: null,
        groups: [{ treatment: code, cumulativeNetPence: 10000, retainedNetPence: 1000, eligibility: {
          source: "human_fixture", actorId: id(3), evidenceId: id(4), supplierVatRegistered: registered,
          supplierVatNumber: registered ? "fixture-vat" : null, customerVatRegistered: true, customerVatNumber: "fixture-customer-vat",
          customerEndUser: !drc, intermediarySupplier: false, constructionReverseChargeInScope: drc, qualifyingBasisReference: "fixture-basis",
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
      subcontractorReference: "Fictional builder", status, evidenceId: id(31), evidenceReference: "fictional-status-record", recordedBy: id(3),
      validFrom: "2026-10-01", validThrough: "2026-11-05" }],
    payments: [], statements: [{ ...context(40), version: "cis.statement-fixture.v1", previousStatementId: null,
      kind: "payment", correctionOfStatementId: null, documentReference: "CIS-fixture-1", documentDate: "2026-10-31", taxMonthEnd: "2026-11-05",
      humanApproval: { actorId: id(3), decisionId: id(6), sourceCalculationReference: "fictional-calculation-1" },
      verificationId: id(30), vatDocumentId: id(10), retentionProfileId: id(20), cumulativePaidNetPence: 4000,
      cumulativeDirectMaterialsPence: 1000, materialsEvidenceId: id(32), cumulativePaidVatPence: 0, paymentRecordIds: [],
    }],
  };
}
function command(book = fixture()) {
 const { tenantId: _tenant, jobId, ...data } = book;
 return { version: "cis.persist-fixture.v1", commandId: id(90), jobId, fixture: data };
}
const actor = { membershipId: id(3), identityUserId: id(4) };
function following(book: CisFixtureBook, n = 41, correction = false): ReturnType<typeof command> {
 const previous = book.statements[0]!;
 return { ...command(book), commandId: id(n + 100), fixture: { ...command(book).fixture, verifications: [], payments: [],
  statements: [{ ...previous, id: id(n), previousStatementId: previous.id, documentReference: `fixture-${n}`,
   kind: correction ? "correction" as const : "payment" as const, correctionOfStatementId: correction ? previous.id : null,
   cumulativePaidNetPence: correction ? 2000 : 6000, paymentRecordIds: [] }] } };
}

function harness() {
 const records: unknown[] = [];
 const query = vi.fn(async (sql: string, args?: unknown[]) => {
  if (sql.includes("final_lock_hash")) throw Object.assign(new Error("permission denied for function final_lock_hash"), { code: "42501" });
  if (sql.includes("cis_fixture_records")) {
   if (args?.[3]) {
    const v = JSON.parse(String(args[3])), { commandId, requestHash, rateNumerator, ...payload } = v;
    if (!records.some(row => (row as {commandId:string}).commandId === commandId)) records.push({ commandId, requestHash, rateNumerator,
     rateDenominator: 100, actor: JSON.parse(String(args[2])), recordHash: "a".repeat(64), intact: true,
     environment: "synthetic", label: CIS_FIXTURE_LABEL, policyVersion: CIS_POLICY_VERSION, payload });
   }
   return { rows: [{ result: structuredClone(records) }] };
  }
  return { rows: [] };
 });
 const connect = vi.fn(async () => ({ query, release: vi.fn() }));
 return { repo: new CisFixtureRepository({ connect } as unknown as Pool), query, connect, records, context: testTenantContext(tenantId) };
}
describe("M4-22 CIS fixture storage boundary", () => {
 it("stores a SHA-256 request hash without calling the restricted database hash function", async () => {
  const f = harness(), input = command();
  const stored = await f.repo.command(f.context, actor, input);
  expect(stored.records[0]!.requestHash).toMatch(/^[a-f0-9]{64}$/u);
  expect(f.query.mock.calls.some(([sql]) => sql.includes("final_lock_hash"))).toBe(false);
 });
 it("rebuilds stored figures, replays once, and appends a correction without editing history", async () => {
  const f = harness(), input = command();
  const initial = await f.repo.command(f.context, actor, input);
  expect(initial.reconciliation.statements[0]).toMatchObject({ invoiceNet: {pence:10000}, vatToSupplier:{pence:2000},
   retention:{pence:1000}, cisDeduction:{pence:600}, actualCash:{pence:0}, unpaidCash:{pence:3400}, feeEligibleRecovery:{pence:0} });
  await f.repo.command(f.context, actor, input); expect(f.records).toHaveLength(1);
  await expect(f.repo.command(f.context, actor, {...input, fixture:{...input.fixture, direction:"subcontractor_payment"}})).rejects.toThrow("CONFLICT");
  await f.repo.command(f.context, actor, following(fixture(),41,true));
  const read = await f.repo.read(f.context, jobId);
  expect(read.book.statements[0]).toEqual(initial.book.statements[0]);
  expect(read.records[1]!.payload.fixed).toBeNull(); expect(read.records[0]!.payload.fixed?.vatBook).toEqual(fixture().vatBook);
  expect(read.reconciliation.statements[1]!.cisDeduction.pence).toBe(200);
  expect(read).toMatchObject({environment:"synthetic",label:CIS_FIXTURE_LABEL});
  expect(CIS_ENABLED).toBe(false); expect(assertCisIssueAllowed).toThrow();
 });
 it("rejects altered command payload and all changed fixed snapshots", async () => {
  const f = harness(), input = command(); await f.repo.command(f.context,actor,input);
  const changed = structuredClone(input); changed.fixture.statements[0]!.documentReference = "altered";
  await expect(f.repo.command(f.context,actor,changed)).rejects.toThrow("CONFLICT");
  for (const key of ["vatBook","retentionBook"] as const) {
   const next = following(fixture());
   if (key === "vatBook") next.fixture.vatBook.documents[0]!.documentReference = "altered";
   else { const profile=next.fixture.retentionBook.records[0]!; if(profile.version!=="retention.profile.v1")throw Error("fixture profile"); profile.contractProfileVersion="altered"; }
   await expect(f.repo.command(f.context,actor,next)).rejects.toThrow("CONFLICT");
  }
  expect(f.records).toHaveLength(1);
 });
 it("stores nothing for missing, stale, unknown status or foreign lineage", async () => {
  for (const mutate of [
   (b:CisFixtureBook) => {b.verifications=[];},
   (b:CisFixtureBook) => {b.verifications[0]!.validThrough="2026-10-30";},
   (b:CisFixtureBook) => {b.verifications[0]!.status="unknown" as never;},
   (b:CisFixtureBook) => {b.verifications[0]!.tenantId=id(999);},
  ]) {
   const f=harness(), b=fixture(); mutate(b);
   await expect(f.repo.command(f.context,actor,command(b))).rejects.toThrow(); expect(f.records).toHaveLength(0);
  }
 });
 it.each(["tenantId","actor","enabled","CIS_ENABLED"])("rejects caller %s before connecting",async key => {
  const f=harness(); await expect(f.repo.command(f.context,actor,{...command(),[key]:true})).rejects.toThrow("INVALID_INPUT");
  expect(f.connect).not.toHaveBeenCalled();
 });
 it("refuses altered stored hashes, rates and source rows on read",async()=> {
  for (const field of ["intact","rateNumerator","payload"] as const) {
   const f=harness();await f.repo.command(f.context,actor,command());
   const row=f.records[0] as Record<string,unknown>;
   row[field]=field==="intact"?false:field==="rateNumerator"?30:{};
   await expect(f.repo.read(f.context,jobId)).rejects.toThrow("UNAVAILABLE");
  }
 });
 it("refuses bad context, empty books and redacts unexpected SQL errors",async()=> {
  const f=harness();await expect(f.repo.read(f.context,jobId)).rejects.toThrow("NOT_FOUND");
  await expect(f.repo.read({tenantId} as never,jobId)).rejects.toThrow("UNAVAILABLE");
  f.query.mockRejectedValueOnce(new Error("private fixture detail"));
  await expect(f.repo.read(f.context,jobId)).rejects.toThrow("UNAVAILABLE");
 });
});
