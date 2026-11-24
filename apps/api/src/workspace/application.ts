import { pilotFinalCheck } from "./pilot-final-check.js";
import { pilotFinalAccount } from "./pilot-final-account.js";
import { pilotJobContinuation } from "./pilot-job-continuation.js";
import { requirePilotG1 } from "@jobguard/config";
import { CaptureConflictError, FirmProfileRepository, firmProfileV1, JobPartiesRepository, RequestBindingRefusedError } from "@jobguard/db";
import { AuthError } from "../auth/auth-provider.js";
import { resolveVerifiedTenantContext, type TenantRequestCredentials } from "../auth/principal-bridge.js";
import { z } from "zod";
import { CommercialIntegrityV3Application } from "../commercial-integrity-v3.application.js";
import { PaymentFeeApplication } from "../payment-fee.application.js";
import { OidcApplication } from "../auth/sso/oidc.application.js";
import { OidcRepository } from "@jobguard/db";
import { BusinessValueApplication } from "../value/value-business.application.js";
import { ValueV3Application } from "../value/value-v3.application.js";
import { ValueV3Reader } from "@jobguard/db";
import { SuccessFeeApplication } from "../success-fee.application.js";
import { JobImportV3Application } from "../job-import-v3.application.js";
import { RecoveryAttributionApplication, recoveryAttributionFailure } from "../recovery-attribution.application.js";
import { JobSourceApplication } from "../job-source.application.js";
import { JobWorkStateApplication } from "../job-work-state.application.js";
import { FinalCheckApplication,finalCheckFailure } from "../final-check.application.js";
import { jobWorkStateFailure } from "../job-work-state.failure.js";
import { ScimApplication } from "../auth/sso/scim.application.js";
import { scimSeed } from "../auth/sso/scim.contracts.js";
import { ScimRepository } from "@jobguard/db";
import { ssoEmergencyWindowMinutes } from "../auth/sso/sso-required.contracts.js";
import { SsoRequiredApplication } from "../auth/sso/sso-required.application.js";
import { SsoRequiredRepository } from "@jobguard/db";
import { FinalAccountLockApplication } from "../final-account-lock.application.js";
import { SiteExtraApplication } from "../contractor/site-extra.application.js";
import { AuditExportApplication } from "../audit-export/audit-export.application.js";
import { PracticeFactsApplication } from "../practice-facts.application.js";
import { SsoApplication } from "../auth/sso/sso.application.js";
import { ssoDeploymentMode } from "../auth/sso/sso.contracts.js";
import type { IdentityApplication } from "../auth/identity.application.js";
import { EnterpriseIdentityRepository } from "@jobguard/db";
import { PreventionCheckApplication } from "../prevention-check.application.js";
import type { Pool } from "pg";
import { pilotJobAccess } from "./pilot-job-access.js";
import { jobPartiesFormV1 } from "@jobguard/core";
import { WorkspaceService, WorkspaceServiceError } from "./workspace.service.js";
import { SandboxRepository } from "@jobguard/db";
import { SandboxService } from "../sandbox/sandbox.service.js";
import { CaptureApplication } from "../capture/capture.application.js";
import { QuoteApplication } from "../quote/quote.application.js";
import { VariationApplication } from "../variation/variation.application.js";
import { RecoveryApplication } from "./recovery.application.js";
import { DecisionsApplication } from "../decisions/decisions.application.js";
import { ProofApplication } from "../proof/proof.application.js";
import { FeeIllustrationApplication } from "./fee-illustration.application.js";
import { FinalAccountApplication } from "../final-account.application.js";
import { MaterialApplication } from "../material.application.js";
import { CustomerInvoiceApplication } from "../customer-invoice.application.js";
import { ValueApplication } from "../value/value.application.js";
import { PurchaseOrderApplication } from "../purchase-order.application.js";
import { SupplierDocumentApplication } from "../supplier-document.application.js";
import { RecoveryCaseApplication } from "../recovery-case.application.js";
import { SupplierMatchApplication } from "../supplier-match.application.js";
import { ThingsToCheckApplication } from "../things-to-check.application.js";
import { ReadinessApplication } from "../readiness.application.js";
import { InboxRelevanceApplication } from "../inbox-relevance.application.js";
import { EvidencePackApplication } from "../evidence-pack.application.js";
import { JobPartiesApplication } from "../job-parties.application.js";
import { RecoveryAllocationApplication } from "../recovery-allocation.application.js";
import { PracticeFeedApplication } from "../practice-feed.application.js";
import { evidencePackFailure } from "../evidence-pack.errors.js";
import { WorkOrderApplication } from "../contractor/work-order.application.js";
import { SchedulingApplication } from "../contractor/scheduling.application.js";
import { RecoveryMessageApplication } from "../recovery-message.application.js";
import { recoveryMessageFailure } from "../recovery-message.errors.js";
import { RecoveryFollowUpApplication, recoveryFollowUpFailure } from "../recovery-follow-up.application.js";

/** The sole server-composition seam shared by Nest and deployed Next route adapters. */
export function createWorkspaceApplication(dependencies: { pool: Pool; sessionId?: string | undefined; identity?: IdentityApplication }) {
  const oidc = dependencies.identity ? new OidcApplication(dependencies.identity.provider, new OidcRepository(dependencies.identity.provider.repository.pool), dependencies.identity.allowedOrigin, ssoDeploymentMode(process.env.JOBGUARD_ENV)) : undefined;
  const sso = dependencies.identity ? new SsoApplication(dependencies.identity.provider, new EnterpriseIdentityRepository(dependencies.identity.provider.repository.pool), dependencies.identity.allowedOrigin, ssoDeploymentMode(process.env.JOBGUARD_ENV)) : undefined;
  const ssoRequired = dependencies.identity ? new SsoRequiredApplication(dependencies.identity.provider, new SsoRequiredRepository(dependencies.identity.provider.repository.pool), dependencies.identity.allowedOrigin, ssoDeploymentMode(process.env.JOBGUARD_ENV), ssoEmergencyWindowMinutes(process.env.JOBGUARD_SSO_EMERGENCY_WINDOW_MINUTES)) : undefined;
  const scim = dependencies.identity ? new ScimApplication(new ScimRepository(dependencies.identity.provider.repository.pool), ssoDeploymentMode(process.env.JOBGUARD_ENV), scimSeed(process.env.JOBGUARD_SCIM_SYNTHETIC_SEED)) : undefined;
  const auditExports = new AuditExportApplication(dependencies.pool);
  const preventionChecks = new PreventionCheckApplication(dependencies.pool, dependencies.sessionId);
  const parties = new JobPartiesApplication(dependencies.pool);
  const jobs = new WorkspaceService(dependencies.pool);
  const sandbox = new SandboxService(new SandboxRepository(dependencies.pool));
  const capture = new CaptureApplication(dependencies.pool, dependencies.sessionId);
  const quote = new QuoteApplication(dependencies.pool, dependencies.sessionId);
  const variation = new VariationApplication(dependencies.pool, dependencies.sessionId);
  const recovery = new RecoveryApplication(dependencies.pool, dependencies.sessionId);
  const decisions = new DecisionsApplication(dependencies.pool, dependencies.sessionId);
  const proof = new ProofApplication(dependencies.pool, dependencies.sessionId);
  const fees = new FeeIllustrationApplication(dependencies.pool, dependencies.sessionId);
  const finalAccount = new FinalAccountApplication(dependencies.pool, dependencies.sessionId);
  const customerInvoice = new CustomerInvoiceApplication(dependencies.pool, dependencies.sessionId);
  const materials = new MaterialApplication(dependencies.pool, dependencies.sessionId);
  const businessValue = new BusinessValueApplication(dependencies.pool, dependencies.sessionId);
  const valueV3 = new ValueV3Application(dependencies.pool, dependencies.sessionId, new ValueV3Reader(dependencies.pool, dependencies.sessionId));
  const value = new ValueApplication(dependencies.pool, dependencies.sessionId);
  const purchaseOrders = new PurchaseOrderApplication(dependencies.pool, dependencies.sessionId);
  const supplierDocuments = new SupplierDocumentApplication(dependencies.pool, dependencies.sessionId);
  const recoveryCases = new RecoveryCaseApplication(dependencies.pool, dependencies.sessionId);
  const supplierMatches = new SupplierMatchApplication(dependencies.pool, dependencies.sessionId);
  const thingsToCheck = new ThingsToCheckApplication(dependencies.pool, dependencies.sessionId);
  const readiness = new ReadinessApplication(dependencies.pool, dependencies.sessionId);
  const inboxRelevance = new InboxRelevanceApplication(dependencies.pool, dependencies.sessionId);
  const evidencePacks = new EvidencePackApplication(dependencies.pool);
  const recoveryMessages = new RecoveryMessageApplication(dependencies.pool);
  const recoveryFollowUps = new RecoveryFollowUpApplication(dependencies.pool);
  const recoveryAllocations = new RecoveryAllocationApplication(dependencies.pool);
  const practiceFeed = new PracticeFeedApplication(dependencies.pool);
  const practiceFacts = new PracticeFactsApplication(dependencies.pool);
  // ENT-2: the contractor session in this request is the only authority the work-order and scheduling services take.
  const contractorPrincipal = { version: "contractor-principal.v1", sessionId: dependencies.sessionId };
  const workOrders = new WorkOrderApplication(dependencies.pool);
  const scheduling = new SchedulingApplication(dependencies.pool);
  const siteExtras = new SiteExtraApplication(dependencies.pool);
  const commercialIntegrityV3 = new CommercialIntegrityV3Application(dependencies.pool);
  const finalAccountLock = new FinalAccountLockApplication(dependencies.pool,dependencies.sessionId);
  const successFees = new SuccessFeeApplication(dependencies.pool,dependencies.sessionId);
  const attribution = new RecoveryAttributionApplication(dependencies.pool,dependencies.sessionId);
  return Object.freeze({ commercialIntegrityV3: Object.freeze({
    family: (jobId:string) => commercialIntegrityV3.family(dependencies.sessionId,jobId),
    view: (jobId:string,query:unknown) => commercialIntegrityV3.view(dependencies.sessionId,jobId,query),
    review: (jobId:string,body:unknown) => commercialIntegrityV3.review(dependencies.sessionId,jobId,body),
  }), paymentFees: new PaymentFeeApplication(dependencies.pool,dependencies.sessionId), businessValue: Object.freeze({readBusiness:businessValue.readBusiness.bind(businessValue)}), valueV3: Object.freeze({readJob:valueV3.readJob.bind(valueV3)}), successFees: Object.freeze({demoSettle:successFees.demoSettle.bind(successFees),reconcileMoney:successFees.reconcileMoney.bind(successFees),collection:successFees.collection.bind(successFees),collect:successFees.collect.bind(successFees),statements:successFees.statements.bind(successFees),issueStatement:successFees.issueStatement.bind(successFees),downloadStatement:successFees.downloadStatement.bind(successFees),view:successFees.view.bind(successFees),command:successFees.command.bind(successFees)}), imports: new JobImportV3Application(dependencies.pool, dependencies.sessionId), recoveryAttribution: Object.freeze({get:attribution.get.bind(attribution),command:attribution.command.bind(attribution),failure:recoveryAttributionFailure}), jobSources: Object.freeze({ historical: (jobId:string)=>new JobSourceApplication(dependencies.pool,dependencies.sessionId).historical(jobId), importHistorical: (jobId:string,raw:unknown)=>new JobSourceApplication(dependencies.pool,dependencies.sessionId).importHistorical(jobId,raw), diary: (jobId:string,query?:unknown)=>new JobSourceApplication(dependencies.pool,dependencies.sessionId).diary(jobId,query), messages: (jobId:string,query?:unknown)=>new JobSourceApplication(dependencies.pool,dependencies.sessionId).messages(jobId,query), intake: (jobId:string,kind:"diary"|"customer_message",raw:unknown)=>new JobSourceApplication(dependencies.pool,dependencies.sessionId).intake(jobId,kind,raw) }), oidc, scim, ssoRequired, siteExtras: Object.freeze({ log: (jobId: string, raw: unknown) => siteExtras.log(contractorPrincipal, jobId, raw), logSor: (jobId: string, raw: unknown) => siteExtras.logSor(contractorPrincipal, jobId, raw), sorRecentItems: (jobId: string) => siteExtras.sorRecentItems(contractorPrincipal, jobId), sorItems: (jobId: string, query: unknown) => siteExtras.sorItems(contractorPrincipal, jobId, query), orderCheck: (jobId: string, query: unknown) => siteExtras.orderCheck(contractorPrincipal, jobId, query), startVisit: (jobId: string, raw: unknown) => siteExtras.startVisit(contractorPrincipal, jobId, raw), completeVisit: (jobId: string, visitId: string, raw: unknown) => siteExtras.completeVisit(contractorPrincipal, jobId, visitId, raw), assignedJobs: () => siteExtras.assignedJobs(contractorPrincipal), orderLines: (jobId: string) => siteExtras.orderLines(contractorPrincipal, jobId) }), sso, auditExports:Object.freeze({list:()=>auditExports.list(dependencies.sessionId),create:(raw:unknown)=>auditExports.create(dependencies.sessionId,raw)}), practiceFacts:Object.freeze({view:practiceFacts.view.bind(practiceFacts),command:practiceFacts.command.bind(practiceFacts)}), recoveryAllocations:Object.freeze({view:recoveryAllocations.view.bind(recoveryAllocations),command:recoveryAllocations.command.bind(recoveryAllocations)}), workOrders:Object.freeze({overview:()=>workOrders.overview(contractorPrincipal),importGenerated:(raw:unknown)=>workOrders.importGenerated(contractorPrincipal,raw),batch:(batchId:string)=>workOrders.batch(contractorPrincipal,batchId),revisions:(workOrderId:string)=>workOrders.revisions(contractorPrincipal,workOrderId),sorVersions:()=>workOrders.sorVersions(contractorPrincipal),importSorVersion:(raw:unknown)=>workOrders.importSorVersion(contractorPrincipal,raw)}), scheduling:Object.freeze({assignments:(jobId:string)=>scheduling.assignments(contractorPrincipal,jobId),siteVisits:(jobId:string)=>scheduling.siteVisits(contractorPrincipal,jobId)}), recoveryMessages:Object.freeze({read:recoveryMessages.read.bind(recoveryMessages),preview:recoveryMessages.preview.bind(recoveryMessages),command:recoveryMessages.command.bind(recoveryMessages),failure:recoveryMessageFailure}), recoveryFollowUps:Object.freeze({read:recoveryFollowUps.read.bind(recoveryFollowUps),schedule:recoveryFollowUps.schedule.bind(recoveryFollowUps),command:recoveryFollowUps.command.bind(recoveryFollowUps),failure:recoveryFollowUpFailure}), practiceFeed:Object.freeze({view:practiceFeed.view.bind(practiceFeed),command:practiceFeed.command.bind(practiceFeed)}), preventionChecks:Object.freeze({view:preventionChecks.view.bind(preventionChecks),exposureSchedule:preventionChecks.exposureSchedule.bind(preventionChecks),command:preventionChecks.command.bind(preventionChecks)}), parties:Object.freeze({list:parties.list.bind(parties),view:parties.view.bind(parties),command:parties.command.bind(parties),adopt:parties.adopt.bind(parties)}), evidencePacks:Object.freeze({listV3:evidencePacks.listV3.bind(evidencePacks),list:evidencePacks.list.bind(evidencePacks),generate:evidencePacks.generate.bind(evidencePacks),approveAttachment:evidencePacks.approveAttachment.bind(evidencePacks),inspect:evidencePacks.inspect.bind(evidencePacks),download:evidencePacks.download.bind(evidencePacks),failure:evidencePackFailure}), inboxRelevance:Object.freeze({view:inboxRelevance.view.bind(inboxRelevance),seed:inboxRelevance.seed.bind(inboxRelevance),budget:inboxRelevance.budget.bind(inboxRelevance),dismiss:inboxRelevance.dismiss.bind(inboxRelevance)}), readiness:Object.freeze({view:readiness.view.bind(readiness),record:readiness.record.bind(readiness),advance:readiness.advance.bind(readiness)}), thingsToCheck:Object.freeze({view:thingsToCheck.view.bind(thingsToCheck),evaluate:thingsToCheck.evaluate.bind(thingsToCheck),review:thingsToCheck.review.bind(thingsToCheck),supersede:thingsToCheck.supersede.bind(thingsToCheck)}), supplierMatches:Object.freeze({view:supplierMatches.view.bind(supplierMatches),create:supplierMatches.create.bind(supplierMatches),correct:supplierMatches.correct.bind(supplierMatches)}), recoveryCases:Object.freeze({list:recoveryCases.list.bind(recoveryCases),command:recoveryCases.command.bind(recoveryCases),eligibility:recoveryCases.eligibility.bind(recoveryCases)}), supplierDocuments:Object.freeze({view:supplierDocuments.view.bind(supplierDocuments),intake:supplierDocuments.intake.bind(supplierDocuments),receipt:supplierDocuments.receipt.bind(supplierDocuments),confirm:supplierDocuments.confirm.bind(supplierDocuments)}), purchaseOrders:Object.freeze({view:purchaseOrders.view.bind(purchaseOrders),revise:purchaseOrders.revise.bind(purchaseOrders),place:purchaseOrders.place.bind(purchaseOrders)}), materials:Object.freeze({view:materials.view.bind(materials),addRate:materials.addRate.bind(materials),addRequirement:materials.addRequirement.bind(materials)}), value:Object.freeze({read:value.read.bind(value)}), customerInvoice:Object.freeze({listForJobs:customerInvoice.listForJobs.bind(customerInvoice),get:customerInvoice.get.bind(customerInvoice),issue:customerInvoice.issue.bind(customerInvoice),pdf:customerInvoice.pdf.bind(customerInvoice),creditView:customerInvoice.creditView.bind(customerInvoice),previewCredit:customerInvoice.previewCredit.bind(customerInvoice),issueCredit:customerInvoice.issueCredit.bind(customerInvoice),receiptView:customerInvoice.receiptView.bind(customerInvoice),recordReceipt:customerInvoice.recordReceipt.bind(customerInvoice),reverseReceipt:customerInvoice.reverseReceipt.bind(customerInvoice)}), finalAccount:Object.freeze({get:finalAccount.get.bind(finalAccount),build:finalAccount.build.bind(finalAccount)}), proof:Object.freeze({get:proof.get.bind(proof),command:proof.command.bind(proof)}), fees:Object.freeze({read:fees.read.bind(fees),create:fees.create.bind(fees),whatIf:fees.whatIf.bind(fees)}), recovery:Object.freeze({read:recovery.read.bind(recovery),select:recovery.select.bind(recovery),approve:recovery.approve.bind(recovery)}), decisions:Object.freeze({list:decisions.list.bind(decisions),evaluate:decisions.evaluate.bind(decisions),dismiss:decisions.dismiss.bind(decisions)}), jobs: Object.freeze({ get: jobs.getJob.bind(jobs) }), capture:Object.freeze({create:capture.capture.bind(capture),get:capture.view.bind(capture),save:capture.save.bind(capture),confirm:capture.confirm.bind(capture)}),quote:Object.freeze({get:quote.get.bind(quote),save:quote.save.bind(quote),preview:quote.preview.bind(quote),issue:quote.issue.bind(quote),deliveryView:quote.deliveryView.bind(quote),execute:quote.execute.bind(quote),pdf:quote.pdf.bind(quote),acceptanceView:quote.acceptanceView.bind(quote),accept:quote.accept.bind(quote),disposition:quote.disposition.bind(quote),activationView:quote.activationView.bind(quote),activate:quote.activate.bind(quote)}),variation:Object.freeze({get:variation.get.bind(variation),command:variation.command.bind(variation)}), sandbox:Object.freeze({create:sandbox.create.bind(sandbox),get:sandbox.get.bind(sandbox),reset:sandbox.reset.bind(sandbox),archive:sandbox.archive.bind(sandbox),advance:sandbox.advance.bind(sandbox)}), finalAccountLock, finalCheck: Object.freeze({ get: (jobId:string) => new FinalCheckApplication(dependencies.pool,dependencies.sessionId).get(jobId), disposition: (jobId:string,raw:unknown) => new FinalCheckApplication(dependencies.pool,dependencies.sessionId).disposition(jobId,raw), confirmCatch: (jobId:string,raw:unknown) => new FinalCheckApplication(dependencies.pool,dependencies.sessionId).confirmCatch(jobId,raw), requestRun: (jobId:string,raw:unknown) => new FinalCheckApplication(dependencies.pool,dependencies.sessionId).requestRun(jobId,raw), disputes: (jobId:string) => new FinalCheckApplication(dependencies.pool,dependencies.sessionId).disputes(jobId), failure: finalCheckFailure }), workState: Object.freeze({ command: (jobId:string,raw:unknown) => new JobWorkStateApplication(dependencies.pool,dependencies.sessionId).command(jobId,raw), get: (jobId:string,rawQuery?:unknown) => new JobWorkStateApplication(dependencies.pool,dependencies.sessionId).get(jobId,rawQuery), failure: jobWorkStateFailure }) });
}

/** A new composition for each request. The pool may outlive the request; its authority does not. */
export async function createPilotWorkspaceApplication(
  dependencies: { pool: Pool; identity: IdentityApplication },
  credentials: TenantRequestCredentials,
) {
  requirePilotG1(process.env);
  const { pool, identity } = dependencies;
  if (identity.provider.environment !== "pilot_no_charge") throw new AuthError("UNAUTHENTICATED");
  const context = await resolveVerifiedTenantContext(identity.provider, credentials, identity.allowedOrigin);

  const jobs = new WorkspaceService(pool);
  const access = pilotJobAccess(pool, context);
  const capture = new CaptureApplication(pool, undefined, access);
  const quote = new QuoteApplication(pool, undefined, access);
  const firmProfile = new FirmProfileRepository(pool);
  const parties = new JobPartiesRepository(pool);
  return {
    listJobs: (jobId?: string) => jobs.listPilotJobs(context, jobId),
    continuation: pilotJobContinuation(pool, context, access),
    finalAccount: pilotFinalAccount(pool, context, access),
    finalCheck: pilotFinalCheck(pool, context, access),
    invoicePolicyPending: async (id: string) => {
      await access(id, true);
      throw new Error("PILOT_INVOICE_POLICY_PENDING");
    },
    capture: {
      create: capture.capture.bind(capture), get: capture.view.bind(capture),
      save: capture.save.bind(capture), confirm: capture.confirm.bind(capture),
    },
    quote: {
      get: quote.get.bind(quote), save: quote.save.bind(quote), preview: quote.preview.bind(quote),
      issue: quote.issue.bind(quote), deliveryView: quote.deliveryView.bind(quote), pdf: quote.pdf.bind(quote),
    },
    profile: {
      read: () => firmProfile.read(context),
      save: async (raw: unknown) => {
        await access(undefined, true);
        const input = firmProfileV1.safeParse(raw);
        if (!input.success || !input.data.contactEmail.toLowerCase().endsWith(".invalid")) throw new Error("INVALID_PROFILE");
        return firmProfile.save(context, input.data);
      },
    },
    parties: {
      read: async (id: string) => {
        const actor = await access(id, true);
        return parties.view(context, actor.membershipId, id);
      },
      save: async (id: string, raw: unknown) => {
        const actor = await access(id, true);
        const input = jobPartiesFormV1.safeParse(raw);
        if (!input.success || !input.data.customer.email?.toLowerCase().endsWith(".invalid")) throw new Error("INVALID_PARTIES");
        return parties.command(context, actor.membershipId, id, input.data);
      },
    },
  };
}

export function pilotWorkspaceFailure(error: unknown): { code: string; status: number } {
  const check = finalCheckFailure(error);
  if (check) return { code: check.body.code, status: check.status };
  if (error instanceof AuthError) return { code: error.code, status: error.code === "UNAUTHENTICATED" ? 401 : 403 };
  if (error instanceof RequestBindingRefusedError) return { code: "TENANT_FORBIDDEN", status: 403 };
  if (error instanceof WorkspaceServiceError && error.code === "NOT_FOUND") return { code: error.code, status: 404 };
  if (error instanceof z.ZodError) return { code: "TENANT_FORBIDDEN", status: 403 };
  if (error instanceof CaptureConflictError) return { code: error.code, status: 409 };
  if (error instanceof Error) {
    const code = "code" in error && error.code !== "22023" ? error.code : error.message;
    switch (code) {
      case "DISCLOSURE_TERMS_NOT_ACCEPTED": return { code: "TERMS_PENDING", status: 409 };
      case "PILOT_INVOICE_POLICY_PENDING": case "FINAL_ACCOUNT_ALREADY_LOCKED": case "SCOPE_DISPOSITION_MISSING": case "STALE_REVISION":
      case "FINAL_ACCOUNT_UPLOADS_IN_PROGRESS": case "FINAL_REVIEW_CLOSED": return { code, status: 409 };
      case "INVALID_FINAL_ACCOUNT_LOCK_INPUT": return { code, status: 400 };
      case "NOT_FOUND": case "UPLOAD_NOT_FOUND": case "JOB_NOT_FOUND": case "P0002": return { code: "NOT_FOUND", status: 404 };
      case "FORBIDDEN": case "AUTHORIZATION_INVALID": case "TENANT_FORBIDDEN": return { code, status: 403 };
      case "42501": return { code: "FORBIDDEN", status: 403 };
      case "INVALID_COMMAND": case "INVALID_BUILDER_CAPTURE": case "INVALID_CAPTURE": case "INVALID_QUOTE": case "INVALID_PROFILE": case "INVALID_PARTIES":
      case "REVIEW_INCOMPLETE": case "QUOTE_NOT_ISSUABLE": case "JOB_PARTIES_REQUIRED": case "RECIPIENT_CHANGED":
        return { code, status: 400 };
      case "PROOF_NOT_FINAL": return { code: "PROOF_INVALID", status: 422 };
      case "PROOF_INVALID": case "OBJECT_INVALID": case "UPLOAD_EXPIRED": return { code, status: 422 };
      case "40001": return { code: "REVISION_CONFLICT", status: 409 };
      case "STALE_ACCEPTANCE": case "stale or unissued exact quote": case "superseded exact quote":
      case "acceptance is not allowed": return { code: "STALE_ACCEPTANCE", status: 409 };
      case "JOB_NOT_LIVE": case "ACTIVATION_REQUIRED": case "IDEMPOTENCY_CONFLICT":
      case "REVIEW_REVISION_CONFLICT": case "QUOTE_REVISION_CONFLICT": case "COMMAND_CONFLICT":
      case "REVISION_CONFLICT": case "QUOTE_CHANGED": case "STALE_QUOTE_APPROVAL": case "PHOTO_LIMIT_REACHED":
        return { code, status: 409 };
    }
  }
  return { code: "DATABASE_UNAVAILABLE", status: 503 };
}

export { requirePilotG1 };
