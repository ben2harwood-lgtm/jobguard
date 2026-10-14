import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { beforeEach,describe,expect,it,vi } from "vitest";
import { JobWorkStateApplication } from "./job-work-state.application.js";
const { job,read }=vi.hoisted(()=>({job:vi.fn(),read:vi.fn()}));
vi.mock("./practice-access.js",()=>({PracticeAccess:class{job=job;}}));
vi.mock("@jobguard/db",async importOriginal=>({...await importOriginal<Record<string,unknown>>(),JobWorkStateRepository:class{read=read;}}));
describe("CH-4 shared read application mapping (scripted boundary tests)",()=>{
 beforeEach(()=>{vi.clearAllMocks();process.env.JOBGUARD_ENV="synthetic_demo"});
 it("CH4-A20 authority is checked before any work-state query",async()=>{
  job.mockRejectedValue(new Error("NOT_FOUND"));await expect(new JobWorkStateApplication({} as Pool).get(randomUUID())).rejects.toThrow("NOT_FOUND");expect(read).not.toHaveBeenCalled();
 });
 it("CH4-A23 fresh services forward the existing stamped context per request and preserve exact timestamps",async()=>{
  const context=Object.freeze({tenantId:randomUUID()}),id=randomUUID();job.mockResolvedValue({context,digest:"a".repeat(64)});
  const response={version:"job-work-state-read.v1",jobId:id,events:[],links:[],lock:null,environment:"synthetic_demo",realExternalActions:0};read.mockResolvedValue(response);
  expect(await new JobWorkStateApplication({} as Pool).get(id)).toEqual(response);expect(await new JobWorkStateApplication({} as Pool).get(id)).toEqual(response);
  expect(read).toHaveBeenCalledWith(context,id,"a".repeat(64));
 });
 it("CH4-A01 CH4-A27 production and pilot initialization fail closed; no body mode can override it",()=>{
  for(const mode of ["production","pilot_no_charge",undefined]){if(mode)process.env.JOBGUARD_ENV=mode;else delete process.env.JOBGUARD_ENV;expect(()=>new JobWorkStateApplication({} as Pool)).toThrow("SYNTHETIC_MODE_REQUIRED");}
 });
});

it("CH4-A01 query authority fields are rejected after access and before persisted reads",async()=>{
 process.env.JOBGUARD_ENV="synthetic_demo";vi.clearAllMocks();job.mockResolvedValue({context:{tenantId:randomUUID()},digest:"a".repeat(64)});
 await expect(new JobWorkStateApplication({} as Pool).get(randomUUID(),{tenantId:randomUUID()})).rejects.toThrow("INVALID_WORK_STATE_INPUT");expect(read).not.toHaveBeenCalled();
});
