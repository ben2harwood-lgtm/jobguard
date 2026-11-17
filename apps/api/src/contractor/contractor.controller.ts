import { Body, Controller, Get, Headers, HttpException, Post, Query } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Pool } from "pg";
import { ContractorApplication, contractorHttpStatus } from "./contractor.application.js";
function principal(cookie?:string) {return {version:"contractor-principal.v1",sessionId:cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith('jg_session='))?.slice(11)};}
@ApiTags("contractor-organisation")
@Controller("contractor")
export class ContractorController {
 private readonly application:ContractorApplication;
 constructor(pool:Pool) {this.application=new ContractorApplication(pool);}
 private async call(work:()=>Promise<unknown>) {try{return await work();}catch(error){throw new HttpException({code:(error as {code?:string}).code??"DATABASE_UNAVAILABLE"},contractorHttpStatus(error));}}
 private origin(origin?:string) {if(origin!=="http://localhost:3000") throw new HttpException({code:"FORBIDDEN"},403);}
 @Post("practice") @ApiOperation({summary:"Generate an isolated synthetic contractor organisation; no sends or charges"})
 start(@Headers("cookie")cookie:string|undefined,@Headers("origin")origin:string|undefined,@Body()body:unknown) {this.origin(origin);return this.call(()=>this.application.start(principal(cookie),body));}
 @Get() @ApiOperation({summary:"Read contractor organisation or scoped immutable client contracts"})
 read(@Headers("cookie")cookie:string|undefined,@Query("tenantId")tenantId?:string,@Query("resource")resource?:string,@Query("id")id?:string) {return this.call(()=>tenantId?this.application.read(principal(cookie),{version:"contractor-query.v1",tenantId,resource:resource??"organisation",...(id?{id}:{})}):this.application.resume(principal(cookie)));}
 @Post("commands") @ApiOperation({summary:"Execute an audited versioned contractor administration command"})
 command(@Headers("cookie")cookie:string|undefined,@Headers("origin")origin:string|undefined,@Body()body:unknown) {this.origin(origin);return this.call(()=>this.application.command(principal(cookie),body));}
}
