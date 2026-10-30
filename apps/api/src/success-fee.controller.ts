import { Body,Controller,Get,Post,Headers,Header,Param,Query,HttpException,Inject } from "@nestjs/common";
import { ApiBody,ApiOperation,ApiParam,ApiResponse,ApiTags } from "@nestjs/swagger";
import { Pool } from "pg";
import { SuccessFeeApplication,successFeeFailure } from "./success-fee.application.js";
import { practiceCookie } from "./practice-access.js";
const fields={version:{type:"string" as const,enum:["success-fee-command.v1"]},commandId:{type:"string" as const,format:"uuid"},expectedPostingRevision:{type:"integer" as const,minimum:0,maximum:Number.MAX_SAFE_INTEGER}};
const commands=["review","approve"].map(action=>{
 const exact=action==="approve"?{reviewId:{type:"string" as const,format:"uuid"},statementHash:{type:"string" as const,pattern:"^[a-f0-9]{64}$"}}:{};
 return {type:"object" as const,additionalProperties:false,required:[...Object.keys(fields),"action",...Object.keys(exact)],properties:{...fields,action:{type:"string" as const,enum:[action]},...exact}};
});
@ApiTags("synthetic success fees")
@ApiParam({name:"id",required:true,schema:{type:"string",format:"uuid"}})
@Controller("jobs/:id/success-fees")
export class SuccessFeeController {
 constructor(@Inject(Pool) private readonly pool:Pool){}
 private async run(work:(app:SuccessFeeApplication)=>Promise<unknown>,cookie?:string){
  try{return await work(new SuccessFeeApplication(this.pool,practiceCookie(cookie)));}
  catch(error){const failure=successFeeFailure(error);if(failure)throw new HttpException(failure.body,failure.status);throw error;}
 }
 @Get() @Header("Cache-Control","no-store")
 @ApiOperation({summary:"Read synthetic success-fee availability; source-backed calculation dependency-bound"})
 @ApiResponse({status:200,schema:{type:"object",additionalProperties:false,required:["version","jobId","environment","state","dependency","productionEnabled","realExternalActions"],properties:{
  version:{type:"string",enum:["success-fee-availability.v1"]},jobId:{type:"string",format:"uuid"},environment:{type:"string",enum:["synthetic_demo"]},
  state:{type:"string",enum:["dependency_bound"]},dependency:{type:"string",enum:["accepted_attribution_source_adapter"]},productionEnabled:{type:"boolean",enum:[false]},realExternalActions:{type:"integer",enum:[0]},
 }}})
 get(@Param("id")id:string,@Headers("cookie")cookie?:string,@Query()query:unknown={},@Headers("x-tenant-id")tenant?:string,@Headers("x-jobguard-tenant-id")selectedTenant?:string){return this.run(app=>app.view(id,query,tenant!==undefined||selectedTenant!==undefined),cookie);}
 @Post() @Header("Cache-Control","no-store")
 @ApiOperation({summary:"Validate synthetic fee review/approval intent; posting dependency-bound"})
 @ApiBody({schema:{oneOf:commands}})
 @ApiResponse({status:503,description:"No business effects; accepted attribution source adapter is missing"})
 post(@Param("id")id:string,@Body()body:unknown,@Headers("cookie")cookie?:string,@Query()query:unknown={},@Headers("x-tenant-id")tenant?:string,@Headers("x-jobguard-tenant-id")selectedTenant?:string){return this.run(app=>app.command(id,body,query,tenant!==undefined||selectedTenant!==undefined),cookie);}
}
