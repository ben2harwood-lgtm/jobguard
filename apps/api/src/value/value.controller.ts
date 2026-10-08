import { practiceCookie } from "../practice-access.js";
import{Headers,Controller,Get,Param}from"@nestjs/common";import{ApiOperation,ApiTags}from"@nestjs/swagger";import{Pool}from"pg";import{ValueApplication}from"./value.application.js";
@ApiTags("jobs")@Controller("jobs/:id/value")export class ValueController{constructor(private readonly pool:Pool){}@Get()@ApiOperation({summary:"Read a synthetic job's persisted money position"})get(@Param("id")id:string, @Headers("cookie") cookie?:string){return new ValueApplication(this.pool,practiceCookie(cookie)).read(id)}}
