import {Body,Controller,Get,Headers,Param,Post,HttpException} from "@nestjs/common";
import {ApiOperation,ApiTags} from "@nestjs/swagger";
import {Pool} from "pg";
import {FinalCheckError} from "@jobguard/core";
import {FinalCheckApplication} from "./final-check.application.js";
import {practiceCookie} from "./practice-access.js";
async function boundary<T>(work:()=>Promise<T>):Promise<T>{try{return await work();}catch(e){if(e instanceof FinalCheckError)throw new HttpException({code:e.code},e.code==="FINAL_CHECK_FORBIDDEN"?403:/CONFLICT|STALE/u.test(e.code)?409:400);throw e;}}
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
