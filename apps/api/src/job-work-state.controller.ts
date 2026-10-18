import { Controller, Get, Post, Body, Res, Header, Headers, Param, Query, HttpException } from "@nestjs/common";
import { ApiOperation,ApiOkResponse,ApiConflictResponse,ApiBadRequestResponse,ApiNotFoundResponse } from "@nestjs/swagger";
import { Pool } from "pg";
import { JobWorkStateApplication } from "./job-work-state.application.js";
import { jobWorkStateFailure } from "./job-work-state.errors.js";
import { practiceCookie } from "./practice-access.js";
@Controller("jobs/:id/work-state")
export class JobWorkStateController {
 constructor(private readonly pool:Pool){}
 @Get() @Header("Cache-Control","no-store")
 @ApiOperation({summary:"Read immutable synthetic work facts"})
 @ApiOkResponse({description:"Persisted synthetic history with exact UTC microsecond timestamps and zero external actions"})
 async get(@Param("id")id:string,@Headers("cookie")cookie?:string,@Query()query:unknown={}){
  try{return await new JobWorkStateApplication(this.pool,practiceCookie(cookie)).get(id,query)}
  catch(error){const failure=jobWorkStateFailure(error);if(failure)throw new HttpException(failure.body,failure.status);throw error;}
 }
 @Post() @Header("Cache-Control","no-store")
 @ApiOperation({summary:"Record owner-authorized synthetic work state"})
 @ApiConflictResponse({description:"State/revision conflict or unavailable capacity admission",schema:{type:"object",required:["code"],properties:{code:{type:"string",enum:["JOB_NOT_LIVE","WORK_STATE_CONFLICT","WORK_STATE_STALE_REVISION","CAPACITY_ADMISSION_UNAVAILABLE","JOB_WORK_CLOSED"]}}}})
 @ApiBadRequestResponse({description:"INVALID_WORK_STATE_INPUT: strict versioned action required"})
 @ApiNotFoundResponse({description:"NOT_FOUND: current owner/session authority required"})
 @ApiUnprocessableEntityResponse({description:"POST_LOCK_WORK_REQUIRES_LINKED_JOB: Start a linked job for this customer and site"})
 @ApiCreatedResponse({description:"Durable first command result; replay returns the same snapshot"})
 async post(@Param("id")id:string,@Body()raw:unknown,@Headers("cookie")cookie?:string,@Res({passthrough:true})response?:{setHeader(name:string,value:string):void}){
  response?.setHeader("Cache-Control","no-store");
  // Also covers practice-session refusals handled by the existing identity filter.
  return new JobWorkStateApplication(this.pool,practiceCookie(cookie)).command(id,raw);
 }

}

// Keep the variation operation identical to main; add 422 to the other source operations.
import { ApiCreatedResponse, ApiUnprocessableEntityResponse } from "@nestjs/swagger";
import { PurchaseOrderController } from "./purchase-order.controller.js";
import { SupplierDocumentController } from "./supplier-document.controller.js";
import { ProofController } from "./proof/proof.controller.js";
import { VariationController } from "./variation/variation.controller.js";
// Preserve the merged created response explicitly in CH-4's own decoration.
ApiCreatedResponse({description:""})(VariationController.prototype,"post",Object.getOwnPropertyDescriptor(VariationController.prototype,"post")!);
for(const [prototype,method] of [
 [PurchaseOrderController.prototype,"revise"],[PurchaseOrderController.prototype,"place"],
 [SupplierDocumentController.prototype,"intake"],[ProofController.prototype,"post"],
] as const){
 ApiUnprocessableEntityResponse({description:"POST_LOCK_WORK_REQUIRES_LINKED_JOB: Start a linked job for this customer and site",schema:{type:"object",required:["code","message"],properties:{code:{type:"string",enum:["POST_LOCK_WORK_REQUIRES_LINKED_JOB"]},message:{type:"string",enum:["Start a linked job for this customer and site"]}}}})(prototype,method,Object.getOwnPropertyDescriptor(prototype,method)!);
}
