import "reflect-metadata";
import { describe,expect,it,vi } from "vitest";
import type { Pool } from "pg";
const {diary,messages,intake}=vi.hoisted(()=>({diary:vi.fn(),messages:vi.fn(),intake:vi.fn()}));
vi.mock("./workspace/application.js",()=>({createWorkspaceApplication:()=>({jobSources:{diary,messages,intake}})}));
import { JobSourceController } from "./job-source.controller.js";
import { jobSourceFailure } from "./job-source.errors.js";
import { JobSourceError, JobWorkStateError } from "@jobguard/core";
import { WatchdogError } from "@jobguard/db";
describe("SV-7A Nest read adapter",()=>{
 it("SV7A-23 forwards path/query to the same shared application and exposes no held mutation",async()=>{
  diary.mockResolvedValue({notice:"constant"});messages.mockResolvedValue({messages:[]});const controller=new JobSourceController({} as Pool);
  expect(await controller.diary("job","jg_session=fictional",{})).toEqual({notice:"constant"});expect(await controller.messages("job","jg_session=fictional",{})).toEqual({messages:[]});
  expect(diary).toHaveBeenCalledWith("job",{});expect(messages).toHaveBeenCalledWith("job",{});expect("post" in controller).toBe(false);
 });
 it("SV7A-07 SV7A-23 typed refusal does not expose job state or internal details",()=>{
  expect(jobSourceFailure(new JobSourceError("JOB_SOURCE_FORBIDDEN"))).toEqual({status:404,body:{version:"job-source-error.v1",code:"NOT_FOUND",environment:"synthetic_demo",realExternalActions:0}});
  expect(jobSourceFailure(new Error("invalid stored detail"))).toEqual({status:503,body:{version:"job-source-error.v1",code:"JOB_SOURCE_UNAVAILABLE",environment:"synthetic_demo",realExternalActions:0}});
 });
 it("intake forwards each kind to the shared checked application",async()=>{
  intake.mockResolvedValue({version:"job-source-intake-receipt.v1"});const controller=new JobSourceController({} as Pool);
  expect(await controller.recordDiary("job",{text:"x"},"jg_session=fictional")).toEqual({version:"job-source-intake-receipt.v1"});
  expect(await controller.recordMessage("job",{text:"y"},"jg_session=fictional")).toEqual({version:"job-source-intake-receipt.v1"});
  expect(intake.mock.calls).toEqual([["job","diary",{text:"x"}],["job","customer_message",{text:"y"}]]);
 });
 it("intake refusals share the live-only 409 and the post-lock linked-job 422",()=>{
  expect(jobSourceFailure(new WatchdogError("JOB_NOT_LIVE"))).toEqual({status:409,body:{code:"JOB_NOT_LIVE"}});
  expect(jobSourceFailure(new WatchdogError("IDEMPOTENCY_CONFLICT"))).toEqual({status:409,body:{code:"IDEMPOTENCY_CONFLICT"}});
  expect(jobSourceFailure(new JobWorkStateError("POST_LOCK_WORK_REQUIRES_LINKED_JOB"))).toMatchObject({status:422,body:{code:"POST_LOCK_WORK_REQUIRES_LINKED_JOB",message:"Start a linked job for this customer and site"}});
  expect(jobSourceFailure(new JobSourceError("JOB_SOURCE_UNAVAILABLE")).status).toBe(503);
 });
 it.each(["METER_UPGRADE_REQUIRED","METER_PROJECTION_MISMATCH","JOB_WORK_CLOSED"] as const)("on-site %s refusal is a typed conflict",code=>{
  expect(jobSourceFailure(new JobWorkStateError(code))).toMatchObject({status:409,body:{environment:"synthetic_demo",realExternalActions:0}});
  if(code!=="JOB_WORK_CLOSED")expect(jobSourceFailure(new JobWorkStateError(code)).body.code).toBe(code);
 });

});
