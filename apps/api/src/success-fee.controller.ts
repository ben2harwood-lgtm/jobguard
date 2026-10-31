import { Body,Controller,Get,Post,Headers,Header,Param,Query,HttpException,Inject,StreamableFile,NotFoundException } from "@nestjs/common";
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
 private async run<T>(work:(app:SuccessFeeApplication)=>Promise<T>,cookie?:string){
  try{return await work(new SuccessFeeApplication(this.pool,practiceCookie(cookie)));}
  catch(error){const failure=successFeeFailure(error);if(failure)throw new HttpException(failure.body,failure.status);throw error;}
 }
 @Get() @Header("Cache-Control","no-store")
 @ApiOperation({summary:"Read synthetic catch-fee review availability after final-account lock"})
 @ApiResponse({status:200,schema:{type:"object",additionalProperties:false,required:["version","jobId","environment","state","productionEnabled","realExternalActions"],properties:{
  version:{type:"string",enum:["success-fee-availability.v1"]},jobId:{type:"string",format:"uuid"},environment:{type:"string",enum:["synthetic_demo"]},
  state:{type:"string",enum:["dependency_bound","catch_review_available"]},dependency:{type:"string",enum:["accepted_attribution_source_adapter"]},productionEnabled:{type:"boolean",enum:[false]},realExternalActions:{type:"integer",enum:[0]},
 }}})
 get(@Param("id")id:string,@Headers("cookie")cookie?:string,@Query()query:unknown={},@Headers("x-tenant-id")tenant?:string,@Headers("x-jobguard-tenant-id")selectedTenant?:string){return this.run(app=>app.view(id,query,tenant!==undefined||selectedTenant!==undefined),cookie);}
 @Post() @Header("Cache-Control","no-store")
 @ApiOperation({summary:"Review an exact source-backed catch fee statement or approve its local posting"})
 @ApiBody({schema:{oneOf:commands}})
 @ApiResponse({status:201,description:"Immutable synthetic statement review or approved derivation; includes statement sources, statementHash, reviewId, derivationId, journalId, postingRevision and replayed"})
 @ApiResponse({status:409,description:"Statement/source/revision changed, review missing, or command identity conflict"})
 @ApiResponse({status:503,description:"No qualifying catch adapter/lock; Q2 and Q3 remain dependency-bound"})
 post(@Param("id")id:string,@Body()body:unknown,@Headers("cookie")cookie?:string,@Query()query:unknown={},@Headers("x-tenant-id")tenant?:string,@Headers("x-jobguard-tenant-id")selectedTenant?:string){return this.run(app=>app.command(id,body,query,tenant!==undefined||selectedTenant!==undefined),cookie);}
 @Get("statements") @Header("Cache-Control","no-store")
 @ApiOperation({summary:"Read immutable synthetic fee statements; no posting or collection"})
 @ApiResponse({status:200,description:"Versioned statement view with immutable source and approval links"})
 statements(@Param("id")id:string,@Headers("cookie")cookie?:string,@Query()query:unknown={},@Headers("x-tenant-id")tenant?:string,@Headers("x-jobguard-tenant-id")selectedTenant?:string){return this.run(app=>app.statements(id,query,tenant!==undefined||selectedTenant!==undefined),cookie);}
 @Post("statements") @Header("Cache-Control","no-store")
 @ApiOperation({summary:"Issue a simulation statement or approve its exact hash; no posting or collection"})
 @ApiBody({schema:{oneOf:[
  {type:"object",additionalProperties:false,required:["version","commandId","action"],properties:{version:{type:"string",enum:["simulation-fee-statement-command.v1"]},commandId:{type:"string",format:"uuid"},action:{type:"string",enum:["issue"]}}},
  {type:"object",additionalProperties:false,required:["version","commandId","action","statementId","statementHash"],properties:{version:{type:"string",enum:["simulation-fee-statement-command.v1"]},commandId:{type:"string",format:"uuid"},action:{type:"string",enum:["approve"]},statementId:{type:"string",format:"uuid"},statementHash:{type:"string",pattern:"^[a-f0-9]{64}$"}}},
 ]}})
 issueStatement(@Param("id")id:string,@Body()body:unknown,@Headers("cookie")cookie?:string,@Query()query:unknown={},@Headers("x-tenant-id")tenant?:string,@Headers("x-jobguard-tenant-id")selectedTenant?:string){return this.run(app=>app.issueStatement(id,body,query,tenant!==undefined||selectedTenant!==undefined),cookie);}
 @Get("statements/:statementId") @Header("Cache-Control","no-store")
 @ApiParam({name:"statementId",schema:{type:"string",format:"uuid"}})
 @ApiOperation({summary:"Download exact versioned simulation statement JSON bytes"})
 async downloadStatement(@Param("id")id:string,@Param("statementId")statementId:string,@Headers("cookie")cookie?:string,@Query()query:unknown={},@Headers("x-tenant-id")tenant?:string,@Headers("x-jobguard-tenant-id")selectedTenant?:string){
  const file=await this.run(app=>app.downloadStatement(id,statementId,query,tenant!==undefined||selectedTenant!==undefined),cookie);
  if(!file)throw new NotFoundException({code:"NOT_FOUND"});
  return new StreamableFile(file.bytes,{type:"application/json; charset=utf-8",disposition:`attachment; filename="${file.filename}"`});
 }

}
