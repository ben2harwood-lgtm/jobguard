import {Body,Controller,Get,Headers,Param,Post,HttpException} from "@nestjs/common";
import {ApiOperation,ApiTags} from "@nestjs/swagger";
import {Pool} from "pg";
import {FinalCheckApplication,finalCheckFailure} from "./final-check.application.js";
import {practiceCookie} from "./practice-access.js";
async function boundary<T>(work:()=>Promise<T>):Promise<T>{try{return await work();}catch(e){const failure=finalCheckFailure(e);if(failure)throw new HttpException(failure.body,failure.status);throw e;}}
@ApiTags("final check")
@Controller("jobs/:id/final-check")
export class FinalCheckController{
 constructor(private readonly pool:Pool){}
 @Get() @ApiOperation({summary:"Read lock-bound synthetic final-check result"})
 get(@Param("id")id:string,@Headers("cookie")cookie?:string){return boundary(()=>new FinalCheckApplication(this.pool,practiceCookie(cookie)).get(id));}
 @Post("dispositions") @ApiOperation({summary:"Record a non-confirming synthetic final-check answer"})
 disposition(@Param("id")id:string,@Body()body:unknown,@Headers("cookie")cookie?:string){return boundary(()=>new FinalCheckApplication(this.pool,practiceCookie(cookie)).disposition(id,body));}
 @Get("disputes") @ApiOperation({summary:"Read unresolved attribution disputes for this job"})
 disputes(@Param("id")id:string,@Headers("cookie")cookie?:string){return boundary(()=>new FinalCheckApplication(this.pool,practiceCookie(cookie)).disputes(id));}
}
