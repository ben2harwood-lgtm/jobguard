import {Body,Controller,Get,Header,Headers,HttpCode,HttpException,Param,Post} from "@nestjs/common";
import {ApiBody,ApiOkResponse,ApiOperation,ApiParam,ApiTags} from "@nestjs/swagger";
import {Pool} from "pg";
import {BillingApplication,billingHttpFailure} from "./billing.application.js";
import {ContractorBillingError} from "@jobguard/core";
const session=(cookie?:string)=>cookie?.split(";").map(c=>c.trim()).find(c=>c.startsWith("jg_session="))?.slice(11);
const fail=(e:unknown):never=>{const f=billingHttpFailure(e);throw new HttpException(f.body,f.status);};
@ApiTags("contractor-billing") @Controller("contractor/jobs/:id/billing")
export class BillingController {
 private readonly application:BillingApplication;
 constructor(pool:Pool){this.application=new BillingApplication(pool);}
 @Get() @Header("Cache-Control","no-store") @ApiOperation({summary:"Read persisted synthetic contractor billing and reconciliation"})
 @ApiParam({name:"id",type:String,format:"uuid"}) @ApiOkResponse({description:"Persisted immutable export artifacts, current allocation runs, quarantine history and delivery status"})
 read(@Param("id") job:string,@Headers("cookie") cookie?:string){return this.application.read(session(cookie),job).catch(fail);}
 @Get(":batchId/download") @Header("Cache-Control","no-store") @Header("Content-Type","text/csv; charset=utf-8")
 @ApiOperation({summary:"Download exact persisted CSV after approved fake download delivery"})
 @ApiParam({name:"id",type:String,format:"uuid"}) @ApiParam({name:"batchId",type:String,format:"uuid"})
 async download(@Param("id") job:string,@Param("batchId") batch:string,@Headers("cookie") cookie?:string){
  try{return (await this.application.download(session(cookie),job,batch)).csv;}catch(e){return fail(e);}
 }
 @Post(":action") @HttpCode(200) @Header("Cache-Control","no-store") @ApiOperation({summary:"Finance-only synthetic billing export, status import or exact delivery approval"})
 @ApiParam({name:"id",type:String,format:"uuid"}) @ApiParam({name:"action",enum:["export","import","approve-delivery"]})
 @ApiBody({schema:{type:"object",description:"Versioned strict command: billing-finalise.v1, billing-import-request.v1, or billing-approve-delivery.v1"}})
 write(@Param("id") job:string,@Param("action") action:string,@Headers("cookie") cookie:string|undefined,@Headers("origin") origin:string|undefined,@Body() raw:unknown){
  const allowed=(process.env.JOBGUARD_ALLOWED_ORIGINS??"http://localhost:3000").split(",").map(v=>v.trim());
  if(!origin||!allowed.includes(origin))return fail(new ContractorBillingError("BILLING_FORBIDDEN"));
  if(action==="export")return this.application.finalise(session(cookie),job,raw).catch(fail);
  if(action==="import")return this.application.import(session(cookie),job,raw).catch(fail);
  if(action==="approve-delivery")return this.application.approveDelivery(session(cookie),job,raw).catch(fail);
  return fail(new ContractorBillingError("BILLING_INVALID"));
 }
}
