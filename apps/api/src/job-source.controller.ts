import {Body,Controller,Get,Header,Headers,HttpCode,Param,Post,Query,HttpException} from "@nestjs/common";
import {ApiBody,ApiConflictResponse,ApiCreatedResponse,ApiOperation,ApiOkResponse,ApiUnprocessableEntityResponse} from "@nestjs/swagger";
import {Pool} from "pg";
import {createWorkspaceApplication} from "./workspace/application.js";
import {practiceCookie} from "./practice-access.js";
import {jobSourceFailure} from "./job-source.errors.js";
const conflict={description:"JOB_NOT_LIVE: only live jobs accept new sources. IDEMPOTENCY_CONFLICT: command id reused with a different request.",schema:{type:"object",required:["code"],properties:{code:{type:"string",enum:["JOB_NOT_LIVE","IDEMPOTENCY_CONFLICT"]}}}};
const linked={description:"POST_LOCK_WORK_REQUIRES_LINKED_JOB: Start a linked job for this customer and site",schema:{type:"object",required:["code","message"],properties:{code:{type:"string",enum:["POST_LOCK_WORK_REQUIRES_LINKED_JOB"]},message:{type:"string",enum:["Start a linked job for this customer and site"]}}}};
@Controller("jobs/:id")
export class JobSourceController {
 constructor(private readonly pool:Pool){}
 @Get("diary") @Header("Cache-Control","no-store")
 @ApiOperation({summary:"Read saved synthetic diary records with the constant standing notice; intake held"})
 @ApiOkResponse({description:"job-diary-read.v1: immutable original text, exact evidence binding and standing notice"})
 async diary(@Param("id")id:string,@Headers("cookie")cookie?:string,@Query()query:unknown={}){
  try{return await createWorkspaceApplication({pool:this.pool,sessionId:practiceCookie(cookie)}).jobSources.diary(id,query)}catch(error){const failure=jobSourceFailure(error);throw new HttpException(failure.body,failure.status)}
 }
 @Get("customer-messages") @Header("Cache-Control","no-store")
 @ApiOperation({summary:"Read synthetic customer-message sources; creation authority held"})
 @ApiOkResponse({description:"customer-message-read.v1: named fictional customer and separate actual tester attribution"})
 async messages(@Param("id")id:string,@Headers("cookie")cookie?:string,@Query()query:unknown={}){
  try{return await createWorkspaceApplication({pool:this.pool,sessionId:practiceCookie(cookie)}).jobSources.messages(id,query)}catch(error){const failure=jobSourceFailure(error);throw new HttpException(failure.body,failure.status)}
 }
 @Post("diary") @HttpCode(201) @Header("Cache-Control","no-store")
 @ApiOperation({summary:"Record an off-site synthetic diary note on a live, unlocked job; on-site notes wait for MON-1 place admission"})
 @ApiBody({schema:{type:"object",additionalProperties:false,required:["version","commandId","entryMode","onSite","text"],properties:{version:{type:"string",enum:["job-diary-input.v1"]},commandId:{type:"string",format:"uuid"},entryMode:{type:"string",enum:["typed","dictated_text"]},onSite:{type:"boolean"},text:{type:"string",minLength:1,maxLength:8000}}}})
 @ApiCreatedResponse({description:"job-source-intake-receipt.v1 with the saved note, exact evidence binding and the standing notice"})
 @ApiConflictResponse(conflict) @ApiUnprocessableEntityResponse(linked)
 async recordDiary(@Param("id")id:string,@Body()body:unknown,@Headers("cookie")cookie?:string){
  try{return await createWorkspaceApplication({pool:this.pool,sessionId:practiceCookie(cookie)}).jobSources.intake(id,"diary",body)}catch(error){const failure=jobSourceFailure(error);throw new HttpException(failure.body,failure.status)}
 }
 @Post("customer-messages") @HttpCode(201) @Header("Cache-Control","no-store")
 @ApiOperation({summary:"Record a message from a named fictional customer, entered by the job owner, on a live, unlocked synthetic job"})
 @ApiBody({schema:{type:"object",additionalProperties:false,required:["version","commandId","fictionalCustomer","text"],properties:{version:{type:"string",enum:["customer-message-input.v1"]},commandId:{type:"string",format:"uuid"},fictionalCustomer:{type:"object",additionalProperties:false,required:["kind","name"],properties:{kind:{type:"string",enum:["named_fictional_customer"]},name:{type:"string",minLength:1,maxLength:160}}},text:{type:"string",minLength:1,maxLength:8000}}}})
 @ApiCreatedResponse({description:"job-source-intake-receipt.v1 with the saved message, named fictional customer and actual tester"})
 @ApiConflictResponse(conflict) @ApiUnprocessableEntityResponse(linked)
 async recordMessage(@Param("id")id:string,@Body()body:unknown,@Headers("cookie")cookie?:string){
  try{return await createWorkspaceApplication({pool:this.pool,sessionId:practiceCookie(cookie)}).jobSources.intake(id,"customer_message",body)}catch(error){const failure=jobSourceFailure(error);throw new HttpException(failure.body,failure.status)}
 }
}
