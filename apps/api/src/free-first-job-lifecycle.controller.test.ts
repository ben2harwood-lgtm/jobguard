import "reflect-metadata";
import { QuoteController } from "./quote/quote.controller.js";
import { Test } from "@nestjs/testing";
import { IDENTITY_APPLICATION } from "./auth/identity-http.js";
import { describe,it,expect,vi,afterEach } from "vitest";
import type { ExecutionContext } from "@nestjs/common";
import { ApplicationAuthGuard } from "./auth/application-auth.guard.js";
import { FreeFirstJobLifecycleController } from "./free-first-job-lifecycle.controller.js";
import { FreeFirstJobLifecycleApplication } from "./free-first-job-lifecycle.application.js";
import { FreeFirstJobPersistenceError } from "@jobguard/db";
import type { IdentityApplication } from "./auth/identity.application.js";
import { Pool } from "pg";
const old=process.env.JOBGUARD_ENV;afterEach(()=>{vi.restoreAllMocks();if(old===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=old;});
function context(path:string){return {switchToHttp:()=>({getRequest:()=>({path,headers:{cookie:'jobguard_session=fictional',origin:'https://fixture.invalid','x-tenant-id':'company','x-csrf-token':'csrf'}})})} as unknown as ExecutionContext;}
describe('MON-3 HTTP boundary',()=>{
 it('boots the trial controller through Nest injection without emitted type metadata',async()=>{
  const module=await Test.createTestingModule({controllers:[FreeFirstJobLifecycleController,QuoteController],providers:[{provide:Pool,useValue:{}},{provide:IDENTITY_APPLICATION,useValue:()=>({})}]}).compile();
  try{expect(module.get(FreeFirstJobLifecycleController)).toBeInstanceOf(FreeFirstJobLifecycleController);expect(module.get(QuoteController)).toBeInstanceOf(QuoteController);}
  finally{await module.close();}
 });
 it('permits only the new normal-session trial and activation paths after authenticating the principal',async()=>{
  process.env.JOBGUARD_ENV='synthetic_demo';const identity={context:vi.fn(async()=>({}))} as unknown as IdentityApplication;
  const guard=new ApplicationAuthGuard(()=>identity);
  for(const path of ['/jobs/fictional/trial','/jobs/fictional/quotes/activation'])expect(await guard.canActivate(context(path))).toBe(true);
  await expect(guard.canActivate(context('/jobs/fictional/quotes'))).rejects.toThrow();
  vi.mocked(identity.context).mockRejectedValue(new Error('revoked'));
  await expect(guard.canActivate(context('/jobs/fictional/trial'))).rejects.toThrow();
 });
 it('maps missing-card and missing-capacity failures to a clean 409, including Add a card',async()=>{
  const controller=new FreeFirstJobLifecycleController({} as Pool,()=>({} as IdentityApplication)),request={headers:{cookie:'jobguard_session=fictional',origin:'https://fixture.invalid','x-tenant-id':'company','x-csrf-token':'csrf'}};
  const run=vi.spyOn(FreeFirstJobLifecycleApplication.prototype,'activate');
  run.mockRejectedValue(new FreeFirstJobPersistenceError('TRIAL_COMPLETED_CARD_REQUIRED'));
  await expect(controller.activate('job',request,{})).rejects.toMatchObject({status:409,response:{code:'TRIAL_COMPLETED_CARD_REQUIRED',action:'Add a card',realExternalActions:0}});
  run.mockRejectedValue(new FreeFirstJobPersistenceError('CAPACITY_ADMISSION_UNAVAILABLE'));
  await expect(controller.activate('job',request,{})).rejects.toMatchObject({status:409,response:{code:'CAPACITY_ADMISSION_UNAVAILABLE',realExternalActions:0}});
 });
});
