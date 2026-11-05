import { All, Body, Controller, Header, HttpException, Inject, Param, Req, Res } from '@nestjs/common';
import type { EnterpriseAccessApplication } from './enterprise-access.application.js';
import { EnterpriseAccessError } from './enterprise-access.contracts.js';
export const SCIM2_APPLICATION='SCIM2_APPLICATION';
type Request={method:string;headers:Record<string,string|undefined>;url:string};
type Response={status(code:number):Response;setHeader(name:string,value:string):void};
/** DARK: deliberately absent from module/composition. No machine login or credential is installed. */
@Controller('scim/v2/:bindingId')
export class Scim2Controller {
 constructor(@Inject(SCIM2_APPLICATION) private readonly application:()=>EnterpriseAccessApplication) {}
 @All(':kind/:id') @Header('Cache-Control','no-store')
 resource(@Param('bindingId') bindingId:string,@Param('kind') kind:string,@Param('id') id:string,
  @Body() body:unknown,@Req() request:Request,@Res({passthrough:true}) response:Response) {
  return this.dispatch(bindingId,kind,id,body,request,response);
 }
 @All(':kind') @Header('Cache-Control','no-store')
 collection(@Param('bindingId') bindingId:string,@Param('kind') kind:string,
  @Body() body:unknown,@Req() request:Request,@Res({passthrough:true}) response:Response) {
  return this.dispatch(bindingId,kind,undefined,body,request,response);
 }
 private async dispatch(bindingId:string,kind:string,id:string|undefined,body:unknown,request:Request,response:Response) {
  response.setHeader('Content-Type','application/scim+json');
  try {
   if(!['Users','Groups'].includes(kind))throw new EnterpriseAccessError('SCIM_NOT_FOUND');
   // This bounded profile refuses unsupported filters/pagination rather than silently ignoring them.
   if(new URL(request.url,'https://fixture.invalid').search)throw new EnterpriseAccessError('INVALID_ACCESS_INPUT');
   if(request.method==='POST'&&id!==undefined)throw new EnterpriseAccessError('INVALID_ACCESS_INPUT');
   const match=request.headers['if-match'];
   if(match!==undefined&&!/^W\/"[1-9][0-9]*"$/u.test(match))throw new EnterpriseAccessError('INVALID_ACCESS_INPUT');
   const result=await this.application().scim(request.headers.authorization,{version:'scim2-request.v1',bindingId,kind,
    method:request.method,...(id?{id}:{}),...(request.headers['x-request-id']?{eventId:request.headers['x-request-id']}:{}),
    ...(match?{expectedRevision:Number(match.slice(3,-1))}:{}),...(['POST','PUT','PATCH'].includes(request.method)?{body}:{})});
   if(result&&typeof result==='object'&&'meta' in result) {
    const meta=result.meta;
    if(meta&&typeof meta==='object'&&'version' in meta&&typeof meta.version==='string')response.setHeader('ETag',meta.version);
   }
   response.status(request.method==='POST'?201:request.method==='DELETE'?204:200);
   return request.method==='DELETE'?undefined:result;
  }catch(error) {
   const code=error instanceof EnterpriseAccessError?error.code:'ACCESS_UNAVAILABLE';
   const status=code==='SCIM_NOT_FOUND'?404:code==='INVALID_ACCESS_INPUT'?400:code==='SCIM_STALE'?412:code==='SCIM_CONFLICT'?409:code==='ACCESS_REFUSED'?403:503;
   throw new HttpException({schemas:['urn:ietf:params:scim:api:messages:2.0:Error'],status:String(status),detail:code},status);
  }
 }
}
