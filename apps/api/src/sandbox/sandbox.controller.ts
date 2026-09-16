import {Body,Controller,Get,Param,Post,Req,HttpException} from "@nestjs/common";
import {ApiTags,ApiOperation} from "@nestjs/swagger";
import {SandboxService,SandboxServiceError} from "./sandbox.service.js";
@ApiTags("sandbox") @Controller("sandbox/runs") export class SandboxController{constructor(private readonly service:SandboxService){}
 private session(r:{headers:{cookie?:string}}){return r.headers.cookie?.split(";").map(x=>x.trim()).find(x=>x.startsWith("jg_session="))?.slice(11)}
 private async invoke<T>(fn:()=>Promise<T>){try{return await fn()}catch(e){if(!(e instanceof SandboxServiceError))throw e;throw new HttpException({code:e.code},e.code==="UNAUTHENTICATED"?401:e.code==="NOT_FOUND"?404:e.code==="ARCHIVED"||e.code==="COMMAND_CONFLICT"?409:400)}}
 @Post() @ApiOperation({summary:"Create a private synthetic practice run"}) create(@Req()r:{headers:{cookie?:string}},@Body()b:unknown){return this.invoke(()=>this.service.create(this.session(r),b))}
 @Get(":id") get(@Req()r:{headers:{cookie?:string}},@Param("id")id:string){return this.invoke(()=>this.service.get(this.session(r),id))}
 @Post(":id/reset") reset(@Req()r:{headers:{cookie?:string}},@Param("id")id:string,@Body()b:unknown){return this.invoke(()=>this.service.reset(this.session(r),id,b))}
 @Post(":id/archive") archive(@Req()r:{headers:{cookie?:string}},@Param("id")id:string,@Body()b:unknown){return this.invoke(()=>this.service.archive(this.session(r),id,b))}
 @Post(":id/advance") advance(@Req()r:{headers:{cookie?:string}},@Param("id")id:string,@Body()b:unknown){return this.invoke(()=>this.service.advance(this.session(r),id,b))}
}
