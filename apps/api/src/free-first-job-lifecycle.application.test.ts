import { randomUUID } from "node:crypto";
import { afterEach,describe,it,expect,vi } from "vitest";
import { FreeFirstJobLifecycleRepository,FreeFirstJobEligibilityRepository,FreeFirstJobCardRepository,verifiedTenantContextForQueuedJob } from "@jobguard/db";
import { FreeFirstJobLifecycleApplication } from "./free-first-job-lifecycle.application.js";
import type { IdentityApplication } from "./auth/identity.application.js";
import type { Pool } from "pg";
const tenant=randomUUID(),job=randomUUID(),actor=randomUUID();
function setup(role='owner'){
 const identity={context:vi.fn(async()=>verifiedTenantContextForQueuedJob(tenant)),principal:vi.fn(async()=>({identityUserId:randomUUID()})),provider:{findMembership:vi.fn(async()=>({id:actor,role})),digest:vi.fn(()=>"a".repeat(64))}} as unknown as IdentityApplication;
 return {identity,app:new FreeFirstJobLifecycleApplication({} as Pool,identity)};
}
const old=process.env.JOBGUARD_ENV;afterEach(()=>{vi.restoreAllMocks();if(old===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=old;});
describe('MON-3 application normal-company authority',()=>{
 it('refuses non-synthetic and non-owner calls before reading any job facts',async()=>{
  const read=vi.spyOn(FreeFirstJobLifecycleRepository.prototype,'read');const {identity,app}=setup('admin');
  process.env.JOBGUARD_ENV='production';await expect(app.read({},job)).rejects.toThrow('FREE_FIRST_JOB_SYNTHETIC_ONLY');expect(identity.context).not.toHaveBeenCalled();
  process.env.JOBGUARD_ENV='synthetic_demo';await expect(app.read({},job)).rejects.toThrow('FREE_FIRST_JOB_ACCESS_DENIED');expect(read).not.toHaveBeenCalled();
 });
 it('rechecks current authority on every read and command; caller cannot supply completion or tenant facts',async()=>{
  process.env.JOBGUARD_ENV='synthetic_demo';const {identity,app}=setup();
  vi.spyOn(FreeFirstJobLifecycleRepository.prototype,'read').mockResolvedValue({tenantId:tenant,jobId:job} as never);
  vi.spyOn(FreeFirstJobEligibilityRepository.prototype,'read').mockResolvedValue({offerSkip:true} as never);
  const request=vi.spyOn(FreeFirstJobCardRepository.prototype,'request').mockResolvedValue({status:'requested'} as never);
  const credential={sessionToken:'fictional-token'};
  expect((await app.read(credential,job)).version).toBe('trial-screen.v1');
  await expect(app.command(credential,job,{version:'trial-screen-command.v1',kind:'request_card',commandId:randomUUID(),tenantId:randomUUID()})).rejects.toThrow();expect(request).not.toHaveBeenCalled();
  await app.command(credential,job,{version:'trial-screen-command.v1',kind:'request_card',commandId:randomUUID()});expect(identity.context).toHaveBeenCalledTimes(3);
  expect(request.mock.calls[0]?.[1]).toBe('a'.repeat(64));
 });
 it('binds activation to the route job and rejects forged card or trial overrides',async()=>{
  process.env.JOBGUARD_ENV='synthetic_demo';const {app}=setup();
  vi.spyOn(FreeFirstJobLifecycleRepository.prototype,'read').mockResolvedValue({tenantId:tenant,jobId:job} as never);
  const activate=vi.spyOn(FreeFirstJobLifecycleRepository.prototype,'activate').mockResolvedValue({state:'live'});
  const input={version:'trial-switch-live.v1',commandId:randomUUID(),acceptedDocumentId:randomUUID(),acceptedDocumentVersion:1,acceptedDocumentHash:'b'.repeat(64),expectedJobRevision:3};
  await expect(app.activate({},job,{...input,skipCard:true})).rejects.toThrow();expect(activate).not.toHaveBeenCalled();
  await app.activate({},job,input);expect(activate.mock.calls[0]?.[2]).toBe(actor);expect(activate.mock.calls[0]?.[3]).toEqual({...input,jobId:job});
 });
});
