import { Controller, Get, Header, Headers, Param, Query, HttpException } from "@nestjs/common";
import { ApiOperation,ApiOkResponse } from "@nestjs/swagger";
import { Pool } from "pg";
import { JobWorkStateApplication } from "./job-work-state.application.js";
import { jobWorkStateFailure } from "./job-work-state.errors.js";
import { practiceCookie } from "./practice-access.js";
@Controller("jobs/:id/work-state")
export class JobWorkStateController {
 constructor(private readonly pool:Pool){}
 @Get() @Header("Cache-Control","no-store")
 @ApiOperation({summary:"Read immutable synthetic work facts; interval and command policies held"})
 @ApiOkResponse({description:"Persisted synthetic history with exact UTC microsecond timestamps and zero external actions"})
 async get(@Param("id")id:string,@Headers("cookie")cookie?:string,@Query()query:unknown={}){
  try{return await new JobWorkStateApplication(this.pool,practiceCookie(cookie)).get(id,query)}
  catch(error){const failure=jobWorkStateFailure(error);if(failure)throw new HttpException(failure.body,failure.status);throw error;}
 }
}

// Add only the new 422 response to source operations; the merged 409 metadata stays intact.
import { ApiUnprocessableEntityResponse } from "@nestjs/swagger";
import { PurchaseOrderController } from "./purchase-order.controller.js";
import { SupplierDocumentController } from "./supplier-document.controller.js";
import { ProofController } from "./proof/proof.controller.js";
import { VariationController } from "./variation/variation.controller.js";
for(const [prototype,method] of [
 [PurchaseOrderController.prototype,"revise"],[PurchaseOrderController.prototype,"place"],
 [SupplierDocumentController.prototype,"intake"],[ProofController.prototype,"post"],[VariationController.prototype,"post"],
] as const){
 ApiUnprocessableEntityResponse({description:"POST_LOCK_WORK_REQUIRES_LINKED_JOB: Start a linked job for this customer and site",schema:{type:"object",required:["code","message"],properties:{code:{type:"string",enum:["POST_LOCK_WORK_REQUIRES_LINKED_JOB"]},message:{type:"string",enum:["Start a linked job for this customer and site"]}}}})(prototype,method,Object.getOwnPropertyDescriptor(prototype,method)!);
}
