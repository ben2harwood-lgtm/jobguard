import { Body,Controller,Get,Post,Headers,Header,Param,Query,HttpException,Inject } from "@nestjs/common";
import { ApiOperation,ApiTags } from "@nestjs/swagger";
import { Pool } from "pg";
import { PaymentFeeApplication,paymentFeeFailure } from "./payment-fee.application.js";
import { practiceCookie } from "./practice-access.js";
@ApiTags("synthetic payment fees")
@Controller("jobs/:id/payment-fees")
export class PaymentFeeController {
 constructor(@Inject(Pool)private readonly pool:Pool){}
 private async run(work:(app:PaymentFeeApplication)=>Promise<unknown>,cookie?:string){
  try{return await work(new PaymentFeeApplication(this.pool,practiceCookie(cookie)));}
  catch(error){const failure=paymentFeeFailure(error);if(failure)throw new HttpException(failure.body,failure.status);throw error;}
 }
 @Get() @Header("Cache-Control","no-store")
 @ApiOperation({summary:"Read verified synthetic receipt statements and current approval/dispute state"})
 get(@Param("id")id:string,@Headers("cookie")cookie?:string,@Query()query:unknown={}){return this.run(app=>app.get(id,query),cookie);}
 @Post() @Header("Cache-Control","no-store")
 @ApiOperation({summary:"Prepare, approve the exact hash, or pause a synthetic receipt fee statement"})
 post(@Param("id")id:string,@Body()body:unknown,@Headers("cookie")cookie?:string,@Query()query:unknown={}){return this.run(app=>app.command(id,body,query),cookie);}
}
