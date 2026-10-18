import 'reflect-metadata';
import { afterEach, expect, it, vi } from 'vitest';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants.js';
import { JobWorkStateController } from './job-work-state.controller.js';
import { JobWorkStateApplication } from './job-work-state.application.js';
import { jobWorkStateFailure } from './job-work-state.errors.js';
import { JobWorkStateError } from '@jobguard/core';
import type { Pool } from 'pg';
afterEach(()=>vi.unstubAllEnvs());
it('mounted mutations',()=>{
 expect(Reflect.getMetadata(PATH_METADATA,JobWorkStateController)).toBe('jobs/:id/work-state');
 expect(Reflect.getMetadata(METHOD_METADATA,JobWorkStateController.prototype.post)).toBe(1);
});
it('synthetic-only',()=>{vi.stubEnv('JOBGUARD_ENV','production');expect(()=>new JobWorkStateApplication({} as Pool)).toThrow('SYNTHETIC_MODE_REQUIRED');});
it('session ownership precedes command writes',async()=>{vi.stubEnv('JOBGUARD_ENV','synthetic_demo');await expect(new JobWorkStateApplication({} as Pool).command('11111111-1111-4111-8111-111111111111',{})).rejects.toThrow('UNAUTHENTICATED');});
it('typed refusal',()=>{expect(jobWorkStateFailure(new JobWorkStateError('WORK_STATE_CONFLICT'))?.status).toBe(409);expect(jobWorkStateFailure(new JobWorkStateError('CAPACITY_ADMISSION_UNAVAILABLE'))?.status).toBe(409);});
import { JobWorkStateRepository } from '@jobguard/db';
import { jobWorkStateMutationV1 } from './job-work-state.contracts.js';
it('strict input rejects client authority before opening transaction',async()=>{
 const pool={connect:vi.fn()} as unknown as Pool;
 const repo=new JobWorkStateRepository(pool);
 for(const field of ['actor','tenantId','factAt','policyVersion']){
  const input={version:'job-work-state-command.v1',action:'finish',commandId:'11111111-1111-4111-8111-111111111111',expectedRevision:0,[field]:'injected'};
  expect(jobWorkStateMutationV1.safeParse(input).success).toBe(false);
  await expect(repo.command({} as never,'11111111-1111-4111-8111-111111111111','a'.repeat(64),input)).rejects.toThrow('INVALID_WORK_STATE_INPUT');
 }
 expect(pool.connect).not.toHaveBeenCalled();
});
it('unchanged source-response contracts',()=>{expect(jobWorkStateFailure(new JobWorkStateError('POST_LOCK_WORK_REQUIRES_LINKED_JOB'))).toEqual({status:422,body:{code:'POST_LOCK_WORK_REQUIRES_LINKED_JOB',message:'Start a linked job for this customer and site',environment:'synthetic_demo',realExternalActions:0}});});
import { JobWorkStateExceptionFilter } from './job-work-state.errors.js';
it('no-store typed refusal',()=>{
 const json=vi.fn(),status=vi.fn(()=>({json})),setHeader=vi.fn();
 const host={switchToHttp:()=>({getResponse:()=>({status,setHeader})})};
 new JobWorkStateExceptionFilter().catch(new JobWorkStateError('JOB_WORK_CLOSED'),host as never);
 expect(setHeader).toHaveBeenCalledWith('Cache-Control','no-store');expect(status).toHaveBeenCalledWith(409);expect(json).toHaveBeenCalledWith({code:'JOB_WORK_CLOSED',environment:'synthetic_demo',realExternalActions:0});
});

it('missing-session controller refusal carries no-store before the identity filter',async()=>{
 vi.stubEnv('JOBGUARD_ENV','synthetic_demo');const response={setHeader:vi.fn()};
 await expect(new JobWorkStateController({} as Pool).post('11111111-1111-4111-8111-111111111111',{},undefined,response)).rejects.toThrow('UNAUTHENTICATED');
 expect(response.setHeader).toHaveBeenCalledWith('Cache-Control','no-store');
});
