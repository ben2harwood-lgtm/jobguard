import "reflect-metadata";
import { afterEach,expect,it,vi } from "vitest";
import type { Pool } from "pg";
import { SandboxRepository } from "@jobguard/db";
import { SandboxService } from "./sandbox/sandbox.service.js";
import { WorkspaceService } from "./workspace/workspace.service.js";
import {CaptureController} from "./capture/capture.controller.js";
import {CommercialIntegrityController} from "./commercial-integrity.controller.js";
import {CustomerInvoiceController} from "./customer-invoice.controller.js";
import {DecisionsController} from "./decisions/decisions.controller.js";
import {EvidencePackController} from "./evidence-pack.controller.js";
import {FinalAccountController} from "./final-account.controller.js";
import {InboxRelevanceController} from "./inbox-relevance.controller.js";
import {MaterialController} from "./material.controller.js";
import {ProofController} from "./proof/proof.controller.js";
import {PurchaseOrderController} from "./purchase-order.controller.js";
import {QuoteController} from "./quote/quote.controller.js";
import {ReadinessController} from "./readiness.controller.js";
import {RecoveryCaseController} from "./recovery-case.controller.js";
import {SandboxController} from "./sandbox/sandbox.controller.js";
import {SupplierDocumentController} from "./supplier-document.controller.js";
import {SupplierMatchController} from "./supplier-match.controller.js";
import {ThingsToCheckController} from "./things-to-check.controller.js";
import {ValueController} from "./value/value.controller.js";
import {VariationController} from "./variation/variation.controller.js";
import {FeeIllustrationController} from "./workspace/fee-illustration.controller.js";
import {WorkspaceController} from "./workspace/workspace.controller.js";

const job="18000000-0000-4000-8000-000000000002",tenant="11111111-1111-4111-8111-111111111111";
const body={jobId:job,tenantId:tenant,decisionId:job};
const sandboxBody={contractVersion:"sandbox_command_v1",commandId:job};
const methods=[ {name:"CaptureController.capture",run:(pool:Pool,cookie:string|undefined)=>new CaptureController(pool).capture(cookie,body)},
 {name:"CommercialIntegrityController.view",run:(pool:Pool,cookie:string|undefined)=>new CommercialIntegrityController(pool).view(job,cookie)},
 {name:"CommercialIntegrityController.review",run:(pool:Pool,cookie:string|undefined)=>new CommercialIntegrityController(pool).review(job,body,cookie)},
 {name:"CustomerInvoiceController.get",run:(pool:Pool,cookie:string|undefined)=>new CustomerInvoiceController(pool).get(job,cookie)},
 {name:"CustomerInvoiceController.post",run:(pool:Pool,cookie:string|undefined)=>new CustomerInvoiceController(pool).post(job,body,cookie)},
 {name:"CustomerInvoiceController.pdf",run:(pool:Pool,cookie:string|undefined)=>new CustomerInvoiceController(pool).pdf(job,job,cookie)},
 {name:"CustomerInvoiceController.creditView",run:(pool:Pool,cookie:string|undefined)=>new CustomerInvoiceController(pool).creditView(job,job,cookie)},
 {name:"CustomerInvoiceController.preview",run:(pool:Pool,cookie:string|undefined)=>new CustomerInvoiceController(pool).preview(job,job,body,cookie)},
 {name:"CustomerInvoiceController.credit",run:(pool:Pool,cookie:string|undefined)=>new CustomerInvoiceController(pool).credit(job,job,body,cookie)},
 {name:"CustomerInvoiceController.receipts",run:(pool:Pool,cookie:string|undefined)=>new CustomerInvoiceController(pool).receipts(job,job,cookie)},
 {name:"CustomerInvoiceController.receipt",run:(pool:Pool,cookie:string|undefined)=>new CustomerInvoiceController(pool).receipt(job,job,body,cookie)},
 {name:"CustomerInvoiceController.reverse",run:(pool:Pool,cookie:string|undefined)=>new CustomerInvoiceController(pool).reverse(job,job,body,cookie)},
 {name:"DecisionsController.list",run:(pool:Pool,cookie:string|undefined)=>new DecisionsController(pool).list(tenant,job,cookie)},
 {name:"DecisionsController.evaluate",run:(pool:Pool,cookie:string|undefined)=>new DecisionsController(pool).evaluate(body,cookie)},
 {name:"DecisionsController.resolve",run:(pool:Pool,cookie:string|undefined)=>new DecisionsController(pool).resolve(body,cookie)},
 {name:"EvidencePackController.get",run:(pool:Pool,cookie:string|undefined)=>new EvidencePackController(pool).get({headers:{...(cookie?{cookie}:{})}},job)},
 {name:"EvidencePackController.post",run:(pool:Pool,cookie:string|undefined)=>new EvidencePackController(pool).post({headers:{...(cookie?{cookie}:{})}},job,body)},
 {name:"EvidencePackController.approve",run:(pool:Pool,cookie:string|undefined)=>new EvidencePackController(pool).approve({headers:{...(cookie?{cookie}:{})}},job,job,body)},
 {name:"EvidencePackController.inspect",run:(pool:Pool,cookie:string|undefined)=>new EvidencePackController(pool).inspect({headers:{...(cookie?{cookie}:{})}},job,job,{})},
 {name:"EvidencePackController.download",run:(pool:Pool,cookie:string|undefined)=>new EvidencePackController(pool).download({headers:{...(cookie?{cookie}:{})}},job,job)},
 {name:"FinalAccountController.get",run:(pool:Pool,cookie:string|undefined)=>new FinalAccountController(pool).get(job,cookie)},
 {name:"FinalAccountController.post",run:(pool:Pool,cookie:string|undefined)=>new FinalAccountController(pool).post(job,body,cookie)},
 {name:"InboxRelevanceController.view",run:(pool:Pool,cookie:string|undefined)=>new InboxRelevanceController(pool).view(job,cookie)},
 {name:"InboxRelevanceController.seed",run:(pool:Pool,cookie:string|undefined)=>new InboxRelevanceController(pool).seed(job,body,cookie)},
 {name:"InboxRelevanceController.budget",run:(pool:Pool,cookie:string|undefined)=>new InboxRelevanceController(pool).budget(job,body,cookie)},
 {name:"InboxRelevanceController.dismiss",run:(pool:Pool,cookie:string|undefined)=>new InboxRelevanceController(pool).dismiss(job,job,body,cookie)},
 {name:"MaterialController.get",run:(pool:Pool,cookie:string|undefined)=>new MaterialController(pool).get(job,cookie)},
 {name:"MaterialController.requirement",run:(pool:Pool,cookie:string|undefined)=>new MaterialController(pool).requirement(job,body,cookie)},
 {name:"MaterialController.rate",run:(pool:Pool,cookie:string|undefined)=>new MaterialController(pool).rate(body,cookie)},
 {name:"ProofController.get",run:(pool:Pool,cookie:string|undefined)=>new ProofController(pool).get(job,cookie)},
 {name:"ProofController.post",run:(pool:Pool,cookie:string|undefined)=>new ProofController(pool).post(job,body,cookie)},
 {name:"PurchaseOrderController.get",run:(pool:Pool,cookie:string|undefined)=>new PurchaseOrderController(pool).get(job,cookie)},
 {name:"PurchaseOrderController.revise",run:(pool:Pool,cookie:string|undefined)=>new PurchaseOrderController(pool).revise(job,body,cookie)},
 {name:"PurchaseOrderController.place",run:(pool:Pool,cookie:string|undefined)=>new PurchaseOrderController(pool).place(job,body,cookie)},
 {name:"QuoteController.get",run:(pool:Pool,cookie:string|undefined)=>new QuoteController(pool).get(job,cookie)},
 {name:"QuoteController.acceptance",run:(pool:Pool,cookie:string|undefined)=>new QuoteController(pool).acceptance(job,cookie)},
 {name:"QuoteController.accept",run:(pool:Pool,cookie:string|undefined)=>new QuoteController(pool).accept(job,body,cookie)},
 {name:"QuoteController.disposition",run:(pool:Pool,cookie:string|undefined)=>new QuoteController(pool).disposition(job,body,cookie)},
 {name:"QuoteController.activation",run:(pool:Pool,cookie:string|undefined)=>new QuoteController(pool).activation(job,cookie)},
 {name:"QuoteController.activate",run:(pool:Pool,cookie:string|undefined)=>new QuoteController(pool).activate(job,body,cookie)},
 {name:"QuoteController.save",run:(pool:Pool,cookie:string|undefined)=>new QuoteController(pool).save(job,body,cookie)},
 {name:"ReadinessController.view",run:(pool:Pool,cookie:string|undefined)=>new ReadinessController(pool).view(job,cookie)},
 {name:"ReadinessController.plan",run:(pool:Pool,cookie:string|undefined)=>new ReadinessController(pool).plan(job,body,cookie)},
 {name:"ReadinessController.advance",run:(pool:Pool,cookie:string|undefined)=>new ReadinessController(pool).advance(job,body,cookie)},
 {name:"RecoveryCaseController.get",run:(pool:Pool,cookie:string|undefined)=>new RecoveryCaseController(pool).get(job,cookie)},
 {name:"RecoveryCaseController.post",run:(pool:Pool,cookie:string|undefined)=>new RecoveryCaseController(pool).post(job,body,cookie)},
 {name:"RecoveryCaseController.eligibility",run:(pool:Pool,cookie:string|undefined)=>new RecoveryCaseController(pool).eligibility(job,body,{headers:{...(cookie?{cookie}:{})}},cookie)},
 {name:"SandboxController.create",run:(pool:Pool,cookie:string|undefined)=>new SandboxController(new SandboxService(new SandboxRepository(pool))).create({headers:{...(cookie?{cookie}:{})}},sandboxBody)},
 {name:"SandboxController.get",run:(pool:Pool,cookie:string|undefined)=>new SandboxController(new SandboxService(new SandboxRepository(pool))).get({headers:{...(cookie?{cookie}:{})}},job)},
 {name:"SandboxController.reset",run:(pool:Pool,cookie:string|undefined)=>new SandboxController(new SandboxService(new SandboxRepository(pool))).reset({headers:{...(cookie?{cookie}:{})}},job,sandboxBody)},
 {name:"SandboxController.archive",run:(pool:Pool,cookie:string|undefined)=>new SandboxController(new SandboxService(new SandboxRepository(pool))).archive({headers:{...(cookie?{cookie}:{})}},job,sandboxBody)},
 {name:"SandboxController.advance",run:(pool:Pool,cookie:string|undefined)=>new SandboxController(new SandboxService(new SandboxRepository(pool))).advance({headers:{...(cookie?{cookie}:{})}},job,sandboxBody)},
 {name:"SupplierDocumentController.view",run:(pool:Pool,cookie:string|undefined)=>new SupplierDocumentController(pool).view(job,cookie)},
 {name:"SupplierDocumentController.intake",run:(pool:Pool,cookie:string|undefined)=>new SupplierDocumentController(pool).intake(job,body,cookie)},
 {name:"SupplierDocumentController.receipt",run:(pool:Pool,cookie:string|undefined)=>new SupplierDocumentController(pool).receipt(job,body,cookie)},
 {name:"SupplierDocumentController.confirm",run:(pool:Pool,cookie:string|undefined)=>new SupplierDocumentController(pool).confirm(job,body,cookie)},
 {name:"SupplierMatchController.view",run:(pool:Pool,cookie:string|undefined)=>new SupplierMatchController(pool).view(job,cookie)},
 {name:"SupplierMatchController.create",run:(pool:Pool,cookie:string|undefined)=>new SupplierMatchController(pool).create(job,body,cookie)},
 {name:"SupplierMatchController.correct",run:(pool:Pool,cookie:string|undefined)=>new SupplierMatchController(pool).correct(job,body,cookie)},
 {name:"ThingsToCheckController.view",run:(pool:Pool,cookie:string|undefined)=>new ThingsToCheckController(pool).view(job,cookie)},
 {name:"ThingsToCheckController.evaluate",run:(pool:Pool,cookie:string|undefined)=>new ThingsToCheckController(pool).evaluate(job,body,cookie)},
 {name:"ThingsToCheckController.review",run:(pool:Pool,cookie:string|undefined)=>new ThingsToCheckController(pool).review(job,body,cookie)},
 {name:"ThingsToCheckController.supersede",run:(pool:Pool,cookie:string|undefined)=>new ThingsToCheckController(pool).supersede(job,body,cookie)},
 {name:"ValueController.get",run:(pool:Pool,cookie:string|undefined)=>new ValueController(pool).get(job,cookie)},
 {name:"VariationController.get",run:(pool:Pool,cookie:string|undefined)=>new VariationController(pool).get(job,cookie)},
 {name:"VariationController.post",run:(pool:Pool,cookie:string|undefined)=>new VariationController(pool).post(job,body,cookie)},
 {name:"FeeIllustrationController.get",run:(pool:Pool,cookie:string|undefined)=>new FeeIllustrationController(pool).get(job,cookie)},
 {name:"FeeIllustrationController.create",run:(pool:Pool,cookie:string|undefined)=>new FeeIllustrationController(pool).create(job,body,cookie)},
 {name:"FeeIllustrationController.whatIf",run:(pool:Pool,cookie:string|undefined)=>new FeeIllustrationController(pool).whatIf(job,body,cookie)},
 {name:"WorkspaceController.get",run:(pool:Pool,cookie:string|undefined)=>new WorkspaceController(new WorkspaceService(pool)).get({headers:{...(cookie?{cookie}:{})}},job,undefined)},
];
afterEach(()=>vi.unstubAllEnvs());
it.each(methods)("$name refuses missing, invented and stranger sessions on the actual handler",async entry=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
 for(const scenario of ["missing","invented",...(["CaptureController.capture","MaterialController.rate","SandboxController.create"].includes(entry.name)?[]:["stranger"])]){
  const cookie=scenario==="missing"?undefined:"jg_session=18000000-0000-4000-8000-000000000001";
  const query=vi.fn(async(sql:string)=>({rows:scenario==="stranger"&&sql.includes("authenticate_practice_session")?[{tenant_id:tenant,membership_id:"d1500000-0000-4000-8000-000000000003",identity_user_id:"d1500000-0000-4000-8000-000000000001"}]:[]}));
  const connect=vi.fn(async()=>({query,release:vi.fn()}));
  const pool={query,connect} as unknown as Pool;
  let error:unknown;try{await entry.run(pool,cookie)}catch(e){error=e}
  expect(error).toBeTruthy();
  const failure=error as {message:string;getResponse?:()=>{code:string}};
  expect(failure.getResponse?.().code??failure.message).toBe(scenario==="stranger"?"NOT_FOUND":"UNAUTHENTICATED");
  if(scenario!=="stranger")expect(connect).not.toHaveBeenCalled();
 }
});

// Exercise the actual Next route and practiceFailure without binding a listener.
// Framework/database adapters are doubles; PostgreSQL/browser proof remains CI.
it("Next quote delivery GET maps missing, invented and stranger practice sessions to 401/404",async()=>{
 const {readFileSync}=await import("node:fs");
 const {runInNewContext}=await import("node:vm");
 const {transpileModule,ModuleKind}=await import("typescript");
 const {PracticeAccessError}=await import("@jobguard/db");
 let token:string|undefined;
 const deliveryView=vi.fn();
 const json=(body:unknown,options?:ResponseInit)=>Response.json(body,options);
 const adapters:Record<string,unknown>={
  "server-only":{},"next/headers":{cookies:async()=>({get:()=>token?{value:token}:undefined})},
  "next/server":{NextResponse:{json}},"@jobguard/db":{PracticeAccessError},"@jobguard/api/workspace":{},"pg":{},
 };
 function load(path:string):Record<string,any>{
  const exports:Record<string,any>={};
  const js=transpileModule(readFileSync(new URL(path,import.meta.url),"utf8"),{compilerOptions:{module:ModuleKind.CommonJS}}).outputText;
  runInNewContext(js,{exports,require:(id:string)=>{if(!(id in adapters))throw new Error(`Unexpected route import: ${id}`);return adapters[id]},Response});
  return exports;
 }
 adapters["../../../../../lib/synthetic-server"]=load("../../web/app/lib/synthetic-server.ts");
 adapters["../../../../../lib/workspace-server"]={workspaceApplication:async()=>({quote:{deliveryView}})};
 const route=load("../../web/app/api/jobs/[id]/quotes/delivery/route.ts");
 for(const scenario of ["missing","invented","stranger"]){
  token=scenario==="missing"?undefined:"18000000-0000-4000-8000-000000000001";
  deliveryView.mockReset().mockRejectedValue(new PracticeAccessError(scenario==="stranger"?"NOT_FOUND":"UNAUTHENTICATED"));
  const response=await route.GET(new Request("http://synthetic.invalid"),{params:Promise.resolve({id:job})});
  expect(response.status).toBe(scenario==="stranger"?404:401);
  expect(await response.json()).toEqual({code:scenario==="stranger"?"NOT_FOUND":"UNAUTHENTICATED"});
  if(scenario==="missing")expect(deliveryView).not.toHaveBeenCalled();
  else{expect(deliveryView).toHaveBeenCalledWith(job);expect(response.headers.get("cache-control")).toBe("no-store");}
 }
 token="18000000-0000-4000-8000-000000000001";
 deliveryView.mockReset().mockResolvedValue({jobId:job,deliveries:[]});
 expect(await (await route.GET(new Request("http://synthetic.invalid"),{params:Promise.resolve({id:job})})).json()).toEqual({jobId:job,deliveries:[]});
});
