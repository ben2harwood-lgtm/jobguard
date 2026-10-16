import {Controller,Get,Header,Headers,Param,Query,HttpException} from "@nestjs/common";
import {ApiOperation,ApiOkResponse} from "@nestjs/swagger";
import {Pool} from "pg";
import {createWorkspaceApplication} from "./workspace/application.js";
import {practiceCookie} from "./practice-access.js";
import {jobSourceFailure} from "./job-source.errors.js";
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
}
