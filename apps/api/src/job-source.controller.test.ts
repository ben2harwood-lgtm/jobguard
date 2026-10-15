import "reflect-metadata";
import { describe,expect,it,vi } from "vitest";
import type { Pool } from "pg";
const {diary,messages}=vi.hoisted(()=>({diary:vi.fn(),messages:vi.fn()}));
vi.mock("./workspace/application.js",()=>({createWorkspaceApplication:()=>({jobSources:{diary,messages}})}));
import { JobSourceController } from "./job-source.controller.js";
import { jobSourceFailure } from "./job-source.errors.js";
import { JobSourceError } from "@jobguard/core";
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
});
