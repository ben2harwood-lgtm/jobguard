import { afterEach, expect, it, vi } from "vitest";
import { CaptureApplication } from "./capture/capture.application.js";
import { CommercialIntegrityApplication } from "./commercial-integrity.application.js";
import { CustomerInvoiceApplication } from "./customer-invoice.application.js";
import { DecisionsApplication } from "./decisions/decisions.application.js";
import { EvidencePackApplication } from "./evidence-pack.application.js";
import { FinalAccountApplication } from "./final-account.application.js";
import { InboxRelevanceApplication } from "./inbox-relevance.application.js";
import { MaterialApplication } from "./material.application.js";
import { ProofApplication } from "./proof/proof.application.js";
import { PurchaseOrderApplication } from "./purchase-order.application.js";
import { QuoteApplication } from "./quote/quote.application.js";
import { ReadinessApplication } from "./readiness.application.js";
import { RecoveryCaseApplication } from "./recovery-case.application.js";
import { SupplierDocumentApplication } from "./supplier-document.application.js";
import { SupplierMatchApplication } from "./supplier-match.application.js";
import { ThingsToCheckApplication } from "./things-to-check.application.js";
import { ValueApplication } from "./value/value.application.js";
import { VariationApplication } from "./variation/variation.application.js";
import { FeeIllustrationApplication } from "./workspace/fee-illustration.application.js";
import { RecoveryApplication } from "./workspace/recovery.application.js";

const job="18000000-0000-4000-8000-000000000002";
const body={jobId:job,tenantId:"11111111-1111-4111-8111-111111111111",decisionId:job};
const methods=[
 { name: "CaptureApplication.capture", ctor: CaptureApplication, invoke: (app: any, session: string | undefined) => app.capture(body) },
 { name: "CaptureApplication.view", ctor: CaptureApplication, invoke: (app: any, session: string | undefined) => app.view(job) },
 { name: "CaptureApplication.save", ctor: CaptureApplication, invoke: (app: any, session: string | undefined) => app.save(job,body) },
 { name: "CaptureApplication.confirm", ctor: CaptureApplication, invoke: (app: any, session: string | undefined) => app.confirm(job,body) },
 { name: "CommercialIntegrityApplication.view", ctor: CommercialIntegrityApplication, invoke: (app: any, session: string | undefined) => app.view(job) },
 { name: "CommercialIntegrityApplication.review", ctor: CommercialIntegrityApplication, invoke: (app: any, session: string | undefined) => app.review(job,body) },
 { name: "CustomerInvoiceApplication.get", ctor: CustomerInvoiceApplication, invoke: (app: any, session: string | undefined) => app.get(job) },
 { name: "CustomerInvoiceApplication.issue", ctor: CustomerInvoiceApplication, invoke: (app: any, session: string | undefined) => app.issue(job,body) },
 { name: "CustomerInvoiceApplication.pdf", ctor: CustomerInvoiceApplication, invoke: (app: any, session: string | undefined) => app.pdf(job,job) },
 { name: "CustomerInvoiceApplication.creditView", ctor: CustomerInvoiceApplication, invoke: (app: any, session: string | undefined) => app.creditView(job,job) },
 { name: "CustomerInvoiceApplication.previewCredit", ctor: CustomerInvoiceApplication, invoke: (app: any, session: string | undefined) => app.previewCredit(job,body) },
 { name: "CustomerInvoiceApplication.issueCredit", ctor: CustomerInvoiceApplication, invoke: (app: any, session: string | undefined) => app.issueCredit(job,body) },
 { name: "CustomerInvoiceApplication.receiptView", ctor: CustomerInvoiceApplication, invoke: (app: any, session: string | undefined) => app.receiptView(job,job) },
 { name: "CustomerInvoiceApplication.recordReceipt", ctor: CustomerInvoiceApplication, invoke: (app: any, session: string | undefined) => app.recordReceipt(job,body) },
 { name: "CustomerInvoiceApplication.reverseReceipt", ctor: CustomerInvoiceApplication, invoke: (app: any, session: string | undefined) => app.reverseReceipt(job,body) },
 { name: "DecisionsApplication.list", ctor: DecisionsApplication, invoke: (app: any, session: string | undefined) => app.list(body) },
 { name: "DecisionsApplication.evaluate", ctor: DecisionsApplication, invoke: (app: any, session: string | undefined) => app.evaluate(body) },
 { name: "DecisionsApplication.dismiss", ctor: DecisionsApplication, invoke: (app: any, session: string | undefined) => app.dismiss(body) },
 { name: "EvidencePackApplication.list", ctor: EvidencePackApplication, invoke: (app: any, session: string | undefined) => app.list(session,job) },
 { name: "EvidencePackApplication.generate", ctor: EvidencePackApplication, invoke: (app: any, session: string | undefined) => app.generate(session,job,body) },
 { name: "EvidencePackApplication.approveAttachment", ctor: EvidencePackApplication, invoke: (app: any, session: string | undefined) => app.approveAttachment(session,job,job,body) },
 { name: "EvidencePackApplication.inspect", ctor: EvidencePackApplication, invoke: (app: any, session: string | undefined) => app.inspect(session,job,job,body) },
 { name: "EvidencePackApplication.download", ctor: EvidencePackApplication, invoke: (app: any, session: string | undefined) => app.download(session,job,job) },
 { name: "FinalAccountApplication.get", ctor: FinalAccountApplication, invoke: (app: any, session: string | undefined) => app.get(job) },
 { name: "FinalAccountApplication.build", ctor: FinalAccountApplication, invoke: (app: any, session: string | undefined) => app.build(job,body) },
 { name: "InboxRelevanceApplication.view", ctor: InboxRelevanceApplication, invoke: (app: any, session: string | undefined) => app.view(job) },
 { name: "InboxRelevanceApplication.seed", ctor: InboxRelevanceApplication, invoke: (app: any, session: string | undefined) => app.seed(job,body) },
 { name: "InboxRelevanceApplication.budget", ctor: InboxRelevanceApplication, invoke: (app: any, session: string | undefined) => app.budget(job,body) },
 { name: "InboxRelevanceApplication.dismiss", ctor: InboxRelevanceApplication, invoke: (app: any, session: string | undefined) => app.dismiss(job,job,body) },
 { name: "MaterialApplication.addRate", ctor: MaterialApplication, invoke: (app: any, session: string | undefined) => app.addRate(body) },
 { name: "MaterialApplication.addRequirement", ctor: MaterialApplication, invoke: (app: any, session: string | undefined) => app.addRequirement(job,body) },
 { name: "MaterialApplication.view", ctor: MaterialApplication, invoke: (app: any, session: string | undefined) => app.view(job) },
 { name: "ProofApplication.get", ctor: ProofApplication, invoke: (app: any, session: string | undefined) => app.get(job) },
 { name: "ProofApplication.command", ctor: ProofApplication, invoke: (app: any, session: string | undefined) => app.command(job,body) },
 { name: "PurchaseOrderApplication.view", ctor: PurchaseOrderApplication, invoke: (app: any, session: string | undefined) => app.view(job) },
 { name: "PurchaseOrderApplication.revise", ctor: PurchaseOrderApplication, invoke: (app: any, session: string | undefined) => app.revise(job,body) },
 { name: "PurchaseOrderApplication.place", ctor: PurchaseOrderApplication, invoke: (app: any, session: string | undefined) => app.place(job,body) },
 { name: "QuoteApplication.get", ctor: QuoteApplication, invoke: (app: any, session: string | undefined) => app.get(job) },
 { name: "QuoteApplication.save", ctor: QuoteApplication, invoke: (app: any, session: string | undefined) => app.save(job,body) },
 { name: "QuoteApplication.preview", ctor: QuoteApplication, invoke: (app: any, session: string | undefined) => app.preview(job,body) },
 { name: "QuoteApplication.issue", ctor: QuoteApplication, invoke: (app: any, session: string | undefined) => app.issue(job,body) },
 { name: "QuoteApplication.deliveryView", ctor: QuoteApplication, invoke: (app: any, session: string | undefined) => app.deliveryView(job) },
 { name: "QuoteApplication.execute", ctor: QuoteApplication, invoke: (app: any, session: string | undefined) => app.execute(job,body) },
 { name: "QuoteApplication.pdf", ctor: QuoteApplication, invoke: (app: any, session: string | undefined) => app.pdf(job,job) },
 { name: "QuoteApplication.acceptanceView", ctor: QuoteApplication, invoke: (app: any, session: string | undefined) => app.acceptanceView(job) },
 { name: "QuoteApplication.accept", ctor: QuoteApplication, invoke: (app: any, session: string | undefined) => app.accept(job,body) },
 { name: "QuoteApplication.disposition", ctor: QuoteApplication, invoke: (app: any, session: string | undefined) => app.disposition(job,body) },
 { name: "QuoteApplication.activationView", ctor: QuoteApplication, invoke: (app: any, session: string | undefined) => app.activationView(job) },
 { name: "QuoteApplication.activate", ctor: QuoteApplication, invoke: (app: any, session: string | undefined) => app.activate(job,body) },
 { name: "ReadinessApplication.view", ctor: ReadinessApplication, invoke: (app: any, session: string | undefined) => app.view(job) },
 { name: "ReadinessApplication.record", ctor: ReadinessApplication, invoke: (app: any, session: string | undefined) => app.record(job,body) },
 { name: "ReadinessApplication.advance", ctor: ReadinessApplication, invoke: (app: any, session: string | undefined) => app.advance(job,body) },
 { name: "RecoveryCaseApplication.list", ctor: RecoveryCaseApplication, invoke: (app: any, session: string | undefined) => app.list(job) },
 { name: "RecoveryCaseApplication.command", ctor: RecoveryCaseApplication, invoke: (app: any, session: string | undefined) => app.command(job,body) },
 { name: "RecoveryCaseApplication.eligibility", ctor: RecoveryCaseApplication, invoke: (app: any, session: string | undefined) => app.eligibility(job,body,session) },
 { name: "SupplierDocumentApplication.view", ctor: SupplierDocumentApplication, invoke: (app: any, session: string | undefined) => app.view(job) },
 { name: "SupplierDocumentApplication.intake", ctor: SupplierDocumentApplication, invoke: (app: any, session: string | undefined) => app.intake(job,body) },
 { name: "SupplierDocumentApplication.receipt", ctor: SupplierDocumentApplication, invoke: (app: any, session: string | undefined) => app.receipt(job,body) },
 { name: "SupplierDocumentApplication.confirm", ctor: SupplierDocumentApplication, invoke: (app: any, session: string | undefined) => app.confirm(job,body) },
 { name: "SupplierMatchApplication.view", ctor: SupplierMatchApplication, invoke: (app: any, session: string | undefined) => app.view(job) },
 { name: "SupplierMatchApplication.create", ctor: SupplierMatchApplication, invoke: (app: any, session: string | undefined) => app.create(job,body) },
 { name: "SupplierMatchApplication.correct", ctor: SupplierMatchApplication, invoke: (app: any, session: string | undefined) => app.correct(job,body) },
 { name: "ThingsToCheckApplication.view", ctor: ThingsToCheckApplication, invoke: (app: any, session: string | undefined) => app.view(job) },
 { name: "ThingsToCheckApplication.evaluate", ctor: ThingsToCheckApplication, invoke: (app: any, session: string | undefined) => app.evaluate(job,body) },
 { name: "ThingsToCheckApplication.review", ctor: ThingsToCheckApplication, invoke: (app: any, session: string | undefined) => app.review(job,body) },
 { name: "ThingsToCheckApplication.supersede", ctor: ThingsToCheckApplication, invoke: (app: any, session: string | undefined) => app.supersede(job,body) },
 { name: "ValueApplication.read", ctor: ValueApplication, invoke: (app: any, session: string | undefined) => app.read(job) },
 { name: "VariationApplication.get", ctor: VariationApplication, invoke: (app: any, session: string | undefined) => app.get(job) },
 { name: "VariationApplication.command", ctor: VariationApplication, invoke: (app: any, session: string | undefined) => app.command(job,body) },
 { name: "FeeIllustrationApplication.read", ctor: FeeIllustrationApplication, invoke: (app: any, session: string | undefined) => app.read(job) },
 { name: "FeeIllustrationApplication.create", ctor: FeeIllustrationApplication, invoke: (app: any, session: string | undefined) => app.create(job,body) },
 { name: "RecoveryApplication.read", ctor: RecoveryApplication, invoke: (app: any, session: string | undefined) => app.read(job) },
 { name: "RecoveryApplication.select", ctor: RecoveryApplication, invoke: (app: any, session: string | undefined) => app.select(job,body) },
 { name: "RecoveryApplication.approve", ctor: RecoveryApplication, invoke: (app: any, session: string | undefined) => app.approve(job,body) },
];
afterEach(()=>vi.unstubAllEnvs());
it.each(methods)("$name refuses missing, invented and stranger sessions before business access",async entry=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
 for(const scenario of ["missing","invented",...(["CaptureApplication.capture","MaterialApplication.addRate","FeeIllustrationApplication.whatIf"].includes(entry.name)?[]:["stranger"])]){
  const session=scenario==="missing"?undefined:"18000000-0000-4000-8000-000000000001";
  const query=vi.fn(async(sql:string)=>({rows:scenario==="stranger"&&sql.includes("authenticate_practice_session")?[{tenant_id:body.tenantId,membership_id:"d1500000-0000-4000-8000-000000000003",identity_user_id:"d1500000-0000-4000-8000-000000000001"}]:[]}));
  const connect=vi.fn(async()=>({query,release:vi.fn()}));
  const app=new (entry.ctor as any)({query,connect},session);
  await expect(Promise.resolve().then(()=>entry.invoke(app,session))).rejects.toThrow(scenario==="stranger"?"NOT_FOUND":"UNAUTHENTICATED");
  if(scenario!=="stranger")expect(connect).not.toHaveBeenCalled();
  for(const [sql] of query.mock.calls)expect(sql).toMatch(/authenticate_practice_session|^(BEGIN|COMMIT|ROLLBACK)$|set_config|practice_session_digest/);
 }
});

it.each(methods)("$name cannot initialize practice authority in production or pilot mode",async entry=>{
 for(const mode of ["production","pilot_no_charge"]){
  vi.stubEnv("JOBGUARD_ENV",mode);
  const query=vi.fn(),connect=vi.fn();const session="18000000-0000-4000-8000-000000000001";
  const app=new(entry.ctor as any)({query,connect},session);
  await expect(Promise.resolve().then(()=>entry.invoke(app,session))).rejects.toThrow(/SYNTHETIC_MODE_REQUIRED|ELIGIBILITY_REVIEWER_FORBIDDEN|D11_PRODUCTION_PATH_REFUSED_PROPOSED/);
  expect(query).not.toHaveBeenCalled();expect(connect).not.toHaveBeenCalled();
 }
});
