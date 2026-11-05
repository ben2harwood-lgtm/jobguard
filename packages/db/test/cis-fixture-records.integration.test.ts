import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { cluster, type Cluster } from "./extra-fixtures.js";
import { seedWorkJob, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
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

describe("M4-22 real PostgreSQL fixture statements", () => {
 let c: Cluster;
 beforeAll(async()=>{c=await cluster();},240000);
 afterAll(async()=>{await c?.close();});
 async function setup() {
  const a=await seedWorkJob(c as unknown as WorkFixture);
  const user=(await c.admin.query("SELECT identity_user_id FROM app.membership WHERE tenant_id=$1 AND id=$2",[a.tenantId,a.actorId])).rows[0].identity_user_id as string;
  const principal={membershipId:a.actorId,identityUserId:user};
  // Replace all synthetic context references, including supplied source snapshots.
  const b=JSON.parse(JSON.stringify(fixture()).replaceAll(tenantId,a.tenantId).replaceAll(jobId,a.jobId)) as CisFixtureBook;
  return {a,b,principal,repo:new CisFixtureRepository(c.runtime)};
 }
 it("stores separate figures, exact rates and lineage, replaying once after repository recreation",async()=>{
  const {a,b,principal,repo}=await setup(), input=command(b);
  b.payments.push({version:"cis.payment-fixture.v1",id:id(50),tenantId:a.tenantId,jobId:a.jobId,
   paymentReference:"fictional-payment-50",paymentDate:"2026-10-31",evidenceId:id(150),cashPence:3400,reversalOfPaymentId:null});
  input.fixture.payments=b.payments;input.fixture.statements[0]!.paymentRecordIds=[id(50)];
  const [first,replay]=await Promise.all([repo.command(a.context,principal,input),repo.command(a.context,principal,input)]);
  expect(replay).toEqual(first);
  const read=await new CisFixtureRepository(c.runtime).read(a.context,a.jobId);
  expect(read.records).toHaveLength(1);expect(read.records[0]).toMatchObject({environment:"synthetic",label:CIS_FIXTURE_LABEL,
   rateNumerator:20,rateDenominator:100,policyVersion:CIS_POLICY_VERSION,intact:true});
  expect(read.reconciliation.statements[0]).toMatchObject({invoiceNet:{pence:10000},vatToSupplier:{pence:2000},
   retention:{pence:1000},cisDeduction:{pence:600},actualCash:{pence:3400},unpaidCash:{pence:0},feeEligibleRecovery:{pence:0}});
  expect(read.lineage).toContain("no verified evidence");
  expect(CIS_ENABLED).toBe(false);expect(assertCisIssueAllowed).toThrow();
  const changed=structuredClone(input);changed.fixture.statements[0]!.documentReference="changed";
  await expect(repo.command(a.context,principal,changed)).rejects.toThrow("CONFLICT");
  const correction=following(b,41,true);correction.fixture.payments=[];
  await repo.command(a.context,principal,correction);
  const corrected=await repo.read(a.context,a.jobId);
  expect(corrected.book.statements[0]).toEqual(read.book.statements[0]);
  expect(corrected.reconciliation.statements[1]).toMatchObject({cisDeduction:{pence:200},refundDue:{pence:1600}});
  expect(corrected.records[1]!.payload.fixed).toBeNull();
 });
 it("serializes concurrent extensions and refuses reused document references and payment IDs",async()=>{
  const {a,b,principal,repo}=await setup();await repo.command(a.context,principal,command(b));
  const results=await Promise.allSettled([repo.command(a.context,principal,following(b,41)),repo.command(a.context,principal,following(b,42))]);
  expect(results.filter(x=>x.status==="fulfilled")).toHaveLength(1);
  const read=await repo.read(a.context,a.jobId),tail=read.book.statements.at(-1)!;
  const next=following(b,43);next.fixture.statements[0]!.previousStatementId=tail.id;
  next.fixture.statements[0]!.documentReference=read.book.statements[0]!.documentReference;
  await expect(repo.command(a.context,principal,next)).rejects.toThrow();
  next.fixture.statements[0]!.documentReference="unique-payment";
  const payment={version:"cis.payment-fixture.v1" as const,id:id(50),tenantId:a.tenantId,jobId:a.jobId,paymentReference:"fictional-cash",
   paymentDate:"2026-10-31",evidenceId:id(150),cashPence:10,reversalOfPaymentId:null};
  next.fixture.payments=[payment];next.fixture.statements[0]!.paymentRecordIds=[payment.id];
  await repo.command(a.context,principal,next);
  const reuse=following(b,44);reuse.fixture.statements[0]!.previousStatementId=id(43);
  reuse.fixture.statements[0]!.paymentRecordIds=[payment.id];
  const competing={...reuse,commandId:randomUUID(),fixture:{...reuse.fixture,payments:[payment]}};
  const attempts=await Promise.allSettled([repo.command(a.context,principal,reuse),repo.command(a.context,principal,competing)]);
  expect(attempts.every(x=>x.status==="rejected")).toBe(true);
  expect((await repo.read(a.context,a.jobId)).records).toHaveLength(3);
 });
 it("admits only one concurrent use of a document reference or payment identity",async()=>{
  for(const duplicate of ["document","payment"]) {
   const {a,b,principal,repo}=await setup();await repo.command(a.context,principal,command(b));
   const one=following(b,41),two=following(b,42);
   if(duplicate==="document")two.fixture.statements[0]!.documentReference=one.fixture.statements[0]!.documentReference;
   else {
    const payment={version:"cis.payment-fixture.v1" as const,id:id(50),tenantId:a.tenantId,jobId:a.jobId,
     paymentReference:"fictional-concurrent-payment",paymentDate:"2026-10-31",evidenceId:id(150),cashPence:10,reversalOfPaymentId:null};
    for(const input of [one,two]){input.fixture.payments=[payment];input.fixture.statements[0]!.paymentRecordIds=[payment.id];}
   }
   const results=await Promise.allSettled([repo.command(a.context,principal,one),repo.command(a.context,principal,two)]);
   expect(results.filter(x=>x.status==="fulfilled")).toHaveLength(1);
   expect((await repo.read(a.context,a.jobId)).records).toHaveLength(2);
  }
 });
 it("refuses missing, unknown or stale verification without storing any record",async()=>{
  for (const status of ["missing","unknown","stale"]) {
   const {a,b,principal,repo}=await setup();
   if(status==="missing")b.verifications=[];
   if(status==="unknown")b.verifications[0]!.status="unsupported" as never;
   if(status==="stale")b.verifications[0]!.validThrough="2026-10-30";
   await expect(repo.command(a.context,principal,command(b))).rejects.toThrow();
   const {statements,payments,verifications,...fixed}=b;
   const raw={commandId:randomUUID(),requestHash:"a".repeat(64),rateNumerator:30,fixed,
    statement:statements[0],payments,verifications};
   await expect(workTenant(c.runtime,a.tenantId,db=>db.query("SELECT app.cis_fixture_records($1,$2,$3::jsonb,$4::jsonb)",
    [a.tenantId,a.jobId,JSON.stringify(principal),JSON.stringify(raw)]))).rejects.toThrow("CIS_FIXTURE_CONFLICT");
   expect((await c.admin.query("SELECT count(*)::int n FROM app.cis_fixture_record WHERE tenant_id=$1",[a.tenantId])).rows[0].n).toBe(0);
  }
 });
 it("uses identical not-found for foreign tenant and missing job; rejects actor substitution and revocation",async()=>{
  const x=await setup(),y=await setup();await x.repo.command(x.a.context,x.principal,command(x.b));
  for(const job of [x.a.jobId,randomUUID()])await expect(y.repo.read(y.a.context,job)).rejects.toThrow("CIS_FIXTURE_NOT_FOUND");
  await expect(x.repo.command(x.a.context,y.principal,following(x.b))).rejects.toThrow("NOT_FOUND");
  await c.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[x.a.tenantId,x.a.actorId]);
  await expect(x.repo.command(x.a.context,x.principal,command(x.b))).rejects.toThrow("NOT_FOUND");
 });
 it("refuses altered source snapshots, direct writes, historical edits and deletion",async()=>{
  const {a,b,principal,repo}=await setup();await repo.command(a.context,principal,command(b));
  for (const source of ["vatBook","retentionBook"] as const) {
   const next=following(b);
   if(source==="vatBook")next.fixture.vatBook.documents[0]!.documentReference="changed";
   else { const profile=next.fixture.retentionBook.records[0]!; if(profile.version!=="retention.profile.v1")throw Error("fixture profile"); profile.contractProfileVersion="changed"; }
   await expect(repo.command(a.context,principal,next)).rejects.toThrow("CONFLICT");
  }
  for(const sql of ["SELECT * FROM app.cis_fixture_record","UPDATE app.cis_fixture_record SET payload='{}'","DELETE FROM app.cis_fixture_record","TRUNCATE app.cis_fixture_record"])
   await expect(workTenant(c.runtime,a.tenantId,db=>db.query(sql))).rejects.toMatchObject({code:"42501"});
  for(const sql of ["UPDATE app.cis_fixture_record SET payload='{}'","DELETE FROM app.cis_fixture_record","TRUNCATE app.cis_fixture_record"])
   await expect(c.admin.query(sql)).rejects.toMatchObject({code:"55000"});
  expect((await repo.read(a.context,a.jobId)).records).toHaveLength(1);
  const policies=(await c.admin.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='app.cis_fixture_record'::regclass")).rows[0];
  expect(policies).toEqual({relrowsecurity:true,relforcerowsecurity:true});
  await workTenant(c.admin,a.tenantId,async db=>{
   await db.query("SET LOCAL ROLE jobguard_migration");
   expect((await db.query("SELECT count(*)::int n FROM app.cis_fixture_record")).rows[0].n).toBe(1);
   await db.query("SELECT set_config('app.tenant_id',$1,true)",[randomUUID()]);
   expect((await db.query("SELECT count(*)::int n FROM app.cis_fixture_record")).rows[0].n).toBe(0);
  });
 });
});
