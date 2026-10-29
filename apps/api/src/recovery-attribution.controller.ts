import { Body,Controller,Get,Post,Headers,Header,Param,Query,HttpException,Inject } from "@nestjs/common";
import { ApiOperation,ApiTags,ApiResponse } from "@nestjs/swagger";
import { Pool } from "pg";
import { RecoveryAttributionApplication,recoveryAttributionFailure } from "./recovery-attribution.application.js";
import { practiceCookie } from "./practice-access.js";
@ApiTags("synthetic recovery attribution")
@Controller("jobs/:id/success-fee-attribution")
export class RecoveryAttributionController {
 constructor(@Inject(Pool) private readonly pool:Pool){}
 private async run(work:(app:RecoveryAttributionApplication)=>Promise<unknown>,cookie?:string){
  try{return await work(new RecoveryAttributionApplication(this.pool,practiceCookie(cookie)));}
  catch(error){const failure=recoveryAttributionFailure(error);if(failure)throw new HttpException(failure.body,failure.status);throw error;}
 }
 @Get() @Header("Cache-Control","no-store")
 @ApiOperation({summary:"Read synthetic proposed principal-only attribution history; current qualification held"})
 get(@Param("id")id:string,@Headers("cookie")cookie?:string,@Query()query:unknown={}){return this.run(app=>app.get(id,query),cookie);}
 @Post() @Header("Cache-Control","no-store")
 @ApiOperation({summary:"Assess a stored synthetic catch and return its unreviewed value illustration"})
 @ApiResponse({status:409,description:"Stored sources, expected revisions or command replay conflict"})
 @ApiResponse({status:503,description:"Review approval remains dependency-bound"})
 post(@Param("id")id:string,@Body()body:unknown,@Headers("cookie")cookie?:string,@Query()query:unknown={}){return this.run(app=>app.command(id,body,query),cookie);}
}
