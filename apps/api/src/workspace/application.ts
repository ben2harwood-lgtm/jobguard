import type { Pool } from "pg";
import { WorkspaceService } from "./workspace.service.js";
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

/** The sole server-composition seam shared by Nest and deployed Next route adapters. */
export function createWorkspaceApplication(dependencies: { pool: Pool }) {
  const jobs = new WorkspaceService(dependencies.pool);
  const sandbox = new SandboxService(new SandboxRepository(dependencies.pool));
  const capture = new CaptureApplication(dependencies.pool);
  const quote = new QuoteApplication(dependencies.pool);
  const variation = new VariationApplication(dependencies.pool);
  const recovery = new RecoveryApplication(dependencies.pool);
  const decisions = new DecisionsApplication(dependencies.pool);
  const proof = new ProofApplication(dependencies.pool);
  const fees = new FeeIllustrationApplication(dependencies.pool);
  const finalAccount = new FinalAccountApplication(dependencies.pool);
  const customerInvoice = new CustomerInvoiceApplication(dependencies.pool);
  const materials = new MaterialApplication(dependencies.pool);
  const value = new ValueApplication(dependencies.pool);
  const purchaseOrders = new PurchaseOrderApplication(dependencies.pool);
  const supplierDocuments = new SupplierDocumentApplication(dependencies.pool);
  const recoveryCases = new RecoveryCaseApplication(dependencies.pool);
  const supplierMatches = new SupplierMatchApplication(dependencies.pool);
  return Object.freeze({ supplierMatches:Object.freeze({view:supplierMatches.view.bind(supplierMatches),create:supplierMatches.create.bind(supplierMatches),correct:supplierMatches.correct.bind(supplierMatches)}), recoveryCases:Object.freeze({list:recoveryCases.list.bind(recoveryCases),command:recoveryCases.command.bind(recoveryCases),eligibility:recoveryCases.eligibility.bind(recoveryCases)}), supplierDocuments:Object.freeze({view:supplierDocuments.view.bind(supplierDocuments),intake:supplierDocuments.intake.bind(supplierDocuments),receipt:supplierDocuments.receipt.bind(supplierDocuments),confirm:supplierDocuments.confirm.bind(supplierDocuments)}), purchaseOrders:Object.freeze({view:purchaseOrders.view.bind(purchaseOrders),revise:purchaseOrders.revise.bind(purchaseOrders),place:purchaseOrders.place.bind(purchaseOrders)}), materials:Object.freeze({view:materials.view.bind(materials),addRate:materials.addRate.bind(materials),addRequirement:materials.addRequirement.bind(materials)}), value:Object.freeze({read:value.read.bind(value)}), customerInvoice:Object.freeze({get:customerInvoice.get.bind(customerInvoice),issue:customerInvoice.issue.bind(customerInvoice),pdf:customerInvoice.pdf.bind(customerInvoice),creditView:customerInvoice.creditView.bind(customerInvoice),previewCredit:customerInvoice.previewCredit.bind(customerInvoice),issueCredit:customerInvoice.issueCredit.bind(customerInvoice),receiptView:customerInvoice.receiptView.bind(customerInvoice),recordReceipt:customerInvoice.recordReceipt.bind(customerInvoice),reverseReceipt:customerInvoice.reverseReceipt.bind(customerInvoice)}), finalAccount:Object.freeze({get:finalAccount.get.bind(finalAccount),build:finalAccount.build.bind(finalAccount)}), proof:Object.freeze({get:proof.get.bind(proof),command:proof.command.bind(proof)}), fees:Object.freeze({read:fees.read.bind(fees),create:fees.create.bind(fees),whatIf:fees.whatIf.bind(fees)}), recovery:Object.freeze({read:recovery.read.bind(recovery),select:recovery.select.bind(recovery),approve:recovery.approve.bind(recovery)}), decisions:Object.freeze({list:decisions.list.bind(decisions),evaluate:decisions.evaluate.bind(decisions),dismiss:decisions.dismiss.bind(decisions)}), jobs: Object.freeze({ get: jobs.getJob.bind(jobs) }), capture:Object.freeze({create:capture.capture.bind(capture),get:capture.view.bind(capture),save:capture.save.bind(capture),confirm:capture.confirm.bind(capture)}),quote:Object.freeze({get:quote.get.bind(quote),save:quote.save.bind(quote),preview:quote.preview.bind(quote),issue:quote.issue.bind(quote),deliveryView:quote.deliveryView.bind(quote),execute:quote.execute.bind(quote),pdf:quote.pdf.bind(quote),acceptanceView:quote.acceptanceView.bind(quote),accept:quote.accept.bind(quote),disposition:quote.disposition.bind(quote),activationView:quote.activationView.bind(quote),activate:quote.activate.bind(quote)}),variation:Object.freeze({get:variation.get.bind(variation),command:variation.command.bind(variation)}), sandbox:Object.freeze({create:sandbox.create.bind(sandbox),get:sandbox.get.bind(sandbox),reset:sandbox.reset.bind(sandbox),archive:sandbox.archive.bind(sandbox),advance:sandbox.advance.bind(sandbox)}) });
}
