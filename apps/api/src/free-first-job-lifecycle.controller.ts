import { Body, Controller, Get, Header, Inject, Param, Post, Req, HttpException } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { ZodError } from "zod";
import { Pool } from "pg";
import { FreeFirstJobLifecycleApplication, trialHttpFailure } from "./free-first-job-lifecycle.application.js";
import { IDENTITY_APPLICATION, cookieToken, identityStatus, type IdentityHttpRequest } from "./auth/identity-http.js";
import type { IdentityApplication } from "./auth/identity.application.js";
@ApiTags("trial")
@Controller("jobs/:id")
export class FreeFirstJobLifecycleController {
 constructor(private readonly pool:Pool,@Inject(IDENTITY_APPLICATION) private readonly identity:()=>IdentityApplication){}
 private async run(request:IdentityHttpRequest,jobId:string,action:"read"|"command"|"activate",raw?:unknown){
  try{
   const credentials={sessionToken:cookieToken(request),tenantHeader:request.headers["x-tenant-id"],csrfToken:request.headers["x-csrf-token"],origin:request.headers.origin};
   const app=new FreeFirstJobLifecycleApplication(this.pool,this.identity());
   if(action==="read")return await app.read(credentials,jobId);
   if(action==="command")return await app.command(credentials,jobId,raw);
   return await app.activate(credentials,jobId,raw);
  }catch(error){const failure=trialHttpFailure(error);if(failure)throw new HttpException(failure.body,failure.status);if(error instanceof ZodError)throw new HttpException({code:"INVALID_FREE_FIRST_JOB_INPUT"},400);const identity=identityStatus(error);throw new HttpException({code:identity.code},identity.status);}
 }
 @Get("trial") @Header("Cache-Control","no-store") @ApiOperation({summary:"Read the current company's synthetic first-job trial"})
 read(@Param("id") id:string,@Req() request:IdentityHttpRequest){return this.run(request,id,"read");}
 @Post("trial") @Header("Cache-Control","no-store") @ApiOperation({summary:"Request or explicitly simulate the company's card setup"})
 command(@Param("id") id:string,@Req() request:IdentityHttpRequest,@Body() body:unknown){return this.run(request,id,"command",body);}
 // Ordinary activation keeps its existing URL; the quote controller delegates normal sessions.
 activate(id:string,request:IdentityHttpRequest,raw:unknown){return this.run(request,id,"activate",raw);}
}
