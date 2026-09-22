import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller.js";
import { Pool } from "pg";
import { CaptureRepository } from "@jobguard/db";
import { CaptureController } from "./capture/capture.controller.js";
import { CaptureService } from "./capture/capture.service.js";
import { WorkspaceController } from "./workspace/workspace.controller.js";
import { WorkspaceService } from "./workspace/workspace.service.js";
import { SandboxRepository } from "@jobguard/db";
import { SandboxService } from "./sandbox/sandbox.service.js";
import { SandboxController } from "./sandbox/sandbox.controller.js";
import { QuoteController } from "./quote/quote.controller.js";
import { VariationController } from "./variation/variation.controller.js";
import { DecisionsController } from "./decisions/decisions.controller.js";
import { ProofController } from "./proof/proof.controller.js";
import { FeeIllustrationController } from "./workspace/fee-illustration.controller.js";
import { FinalAccountController } from "./final-account.controller.js";
import { MaterialController } from "./material.controller.js";
import { CustomerInvoiceController } from "./customer-invoice.controller.js";
import { ValueController } from "./value/value.controller.js";
import { PurchaseOrderController } from "./purchase-order.controller.js";
import { SupplierDocumentController } from "./supplier-document.controller.js";
import { SupplierMatchController } from "./supplier-match.controller.js";
import { RecoveryCaseController } from "./recovery-case.controller.js";
import { ThingsToCheckController } from "./things-to-check.controller.js";
import { ReadinessController } from "./readiness.controller.js";
import { InboxRelevanceController } from "./inbox-relevance.controller.js";

@Module({ controllers: [HealthController,CaptureController,WorkspaceController,SandboxController,QuoteController,VariationController,DecisionsController,ProofController,FeeIllustrationController,FinalAccountController,CustomerInvoiceController,MaterialController,ValueController,PurchaseOrderController,SupplierDocumentController,SupplierMatchController,RecoveryCaseController,ThingsToCheckController,ReadinessController,InboxRelevanceController], providers:[{provide:Pool,useFactory:()=>new Pool({connectionString:process.env.DATABASE_URL})},{provide:CaptureRepository,useFactory:(pool:Pool)=>new CaptureRepository(pool),inject:[Pool]},{provide:SandboxRepository,useFactory:(pool:Pool)=>new SandboxRepository(pool),inject:[Pool]},{provide:WorkspaceService,useFactory:(pool:Pool)=>new WorkspaceService(pool),inject:[Pool]},{provide:SandboxService,useFactory:(repository:SandboxRepository)=>new SandboxService(repository),inject:[SandboxRepository]},CaptureService] })
export class AppModule {}
