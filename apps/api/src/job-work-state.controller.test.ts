import { describe,expect,it } from "vitest";
import { jobWorkStateFailure } from "./job-work-state.errors.js";
import { JobWorkStateError, LINKED_JOB_COPY } from "@jobguard/core";
describe("CH-4 typed error mapping",()=>{
 it("CH4-A13 CH4-A23 post-lock refusal uses a separate 422 with the exact linked-job copy",()=>{
  expect(jobWorkStateFailure(new JobWorkStateError("POST_LOCK_WORK_REQUIRES_LINKED_JOB"))).toEqual({status:422,body:{code:"POST_LOCK_WORK_REQUIRES_LINKED_JOB",message:LINKED_JOB_COPY,environment:"synthetic_demo",realExternalActions:0}});
 });
 it("CH4-A20 CH4-A23 invalid authority returns only a stable refusal",()=>{
  expect(jobWorkStateFailure(new JobWorkStateError("WORK_STATE_FORBIDDEN"))).toEqual({status:404,body:{code:"NOT_FOUND",environment:"synthetic_demo",realExternalActions:0}});
  expect(jobWorkStateFailure(new Error("unrecognized provider content"))).toBeNull();
 });
});
