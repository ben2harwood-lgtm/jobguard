import { Body,Controller,Get,Headers,Param,Post,HttpException } from "@nestjs/common";
import { ApiOperation,ApiTags } from "@nestjs/swagger";
import { Pool } from "pg";
import { FinalAccountLockError } from "@jobguard/core";
import { FinalAccountLockApplication } from "./final-account-lock.application.js";
import { practiceCookie } from "./practice-access.js";
async function command<T>(work:()=>Promise<T>):Promise<T>{try{return await work();}catch(error){
 if(error instanceof FinalAccountLockError)throw new HttpException({code:error.code,...(error.existingLockId?{existingLockId:error.existingLockId}:{})},/ALREADY_LOCKED|IDEMPOTENCY|STALE|SOURCE_CHANGED|UPLOADS_IN_PROGRESS/u.test(error.code)?409:400);
 const code=error instanceof Error?error.message:"DATABASE_UNAVAILABLE";
 if(/^(FORBIDDEN|FINAL_REVIEW_CLOSED|COMMAND_CONFLICT|FINAL_INVOICE_|SUPPLEMENTARY_|INVOICE_AMOUNT_INVALID|SCOPE_ITEM_NOT_BASELINE)/u.test(code))throw new HttpException({code},code==="FORBIDDEN"?403:400);
 throw error;
}}
@ApiTags("final-account lock")
@Controller("jobs/:id/final-account")
export class FinalAccountLockController {
 constructor(private readonly pool:Pool){}
 @Get("lock") @ApiOperation({summary:"Read final-account completion without shadow content"})
 get(@Param("id")id:string,@Headers("cookie")cookie?:string){return command(()=>new FinalAccountLockApplication(this.pool,practiceCookie(cookie)).get(id));}
 @Post("lock") @ApiOperation({summary:"Complete final account or issue an exact lock-bound synthetic invoice"})
 lock(@Param("id")id:string,@Body()body:unknown,@Headers("cookie")cookie?:string){const app=new FinalAccountLockApplication(this.pool,practiceCookie(cookie));return command(async()=>body!==null&&typeof body==="object"&&"version" in body&&body.version==="lock-bound-invoice.issue.v1"?await app.issueInvoice(id,body):await app.lock(id,body));}
 @Post("dispositions") @ApiOperation({summary:"Record baseline scope disposition"})
 disposition(@Param("id")id:string,@Body()body:unknown,@Headers("cookie")cookie?:string){return command(()=>new FinalAccountLockApplication(this.pool,practiceCookie(cookie)).disposition(id,body));}
 @Post("terms") @ApiOperation({summary:"Accept the closed synthetic Final Check terms"})
 terms(@Param("id")id:string,@Body()body:unknown,@Headers("cookie")cookie?:string){return command(()=>new FinalAccountLockApplication(this.pool,practiceCookie(cookie)).acceptTerms(id,body));}
 @Post("review-extras") @ApiOperation({summary:"Add a builder capture during final review"})
 extra(@Param("id")id:string,@Body()body:unknown,@Headers("cookie")cookie?:string){return command(()=>new FinalAccountLockApplication(this.pool,practiceCookie(cookie)).reviewExtra(id,body));}
}
