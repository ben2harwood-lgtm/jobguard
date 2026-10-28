import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { beforeEach,describe,expect,it,vi } from "vitest";
import { JobSourceApplication } from "./job-source.application.js";
const { job,read,intake }=vi.hoisted(()=>({job:vi.fn(),read:vi.fn(),intake:vi.fn()}));
vi.mock("./practice-access.js",()=>({PracticeAccess:class{job=job;}}));
vi.mock("@jobguard/db",async original=>({...await original<Record<string,unknown>>(),JobSourceRepository:class{read=read;intake=intake;}}));
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("JOBGUARD_ENV","synthetic_demo")});
describe("SV-7A shared read application (scripted boundary tests)",()=>{
 it("SV7A-07 SV7A-17 SV7A-23 authority comes first and a denied read makes no source query",async()=>{
  job.mockRejectedValue(new Error("NOT_FOUND"));await expect(new JobSourceApplication({} as Pool).diary(randomUUID(),{tenantId:randomUUID()})).rejects.toThrow("NOT_FOUND");expect(read).not.toHaveBeenCalled();
 });
 it("SV7A-02 SV7A-18 SV7A-24 reads use genuine per-call context after exit from live and no signal inputs",async()=>{
  const context=Object.freeze({tenantId:randomUUID()}),id=randomUUID(),result={entries:[],notice:"constant"};job.mockResolvedValue({context,digest:"a".repeat(64)});read.mockResolvedValue(result);
  for(let n=0;n<2;n++)expect(await new JobSourceApplication({} as Pool).diary(id)).toBe(result);
  expect(read.mock.calls).toEqual([[context,id,"a".repeat(64),"diary"],[context,id,"a".repeat(64),"diary"]]);
 });
 it("SV7A-23 query authority fields are rejected after access and before reads",async()=>{
  job.mockResolvedValue({context:{},digest:"a".repeat(64)});await expect(new JobSourceApplication({} as Pool).messages(randomUUID(),{actorMembershipId:randomUUID()})).rejects.toThrow("INVALID_JOB_SOURCE_INPUT");expect(read).not.toHaveBeenCalled();
 });
 it("SV7A-21 SV7A-22 real use stays off and cannot be enabled by a request",()=>{
  for(const mode of ["production","pilot_no_charge",""]){vi.stubEnv("JOBGUARD_ENV",mode);expect(()=>new JobSourceApplication({} as Pool)).toThrow("SYNTHETIC_MODE_REQUIRED")}
 });
 it("SV7A-23 Q4 named fictional customer and actual tester remain distinct in read results",async()=>{
  const id=randomUUID(),actor=randomUUID(),context=Object.freeze({tenantId:randomUUID()});job.mockResolvedValue({context,digest:"a".repeat(64)});
  const result={messages:[{fictionalCustomer:{kind:"named_fictional_customer",name:"Fictional Alex"},actualTesterMembershipId:actor}]};read.mockResolvedValue(result);
  expect(await new JobSourceApplication({} as Pool).messages(id)).toBe(result);expect(read).toHaveBeenCalledWith(context,id,"a".repeat(64),"customer_message");
 });
});

it.each(["diary","customer_message"] as const)("SV-7A %s intake binds the server session digest and rejects injected authority",async kind=>{
 const id=randomUUID(),context=Object.freeze({tenantId:randomUUID()}),digest="b".repeat(64);
 job.mockResolvedValue({context,digest});intake.mockResolvedValue({saved:true});
 const body=kind==="diary"?{version:"job-diary-input.v1",commandId:randomUUID(),entryMode:"typed",onSite:false,text:"Fitted outside tap."}:{version:"customer-message-input.v1",commandId:randomUUID(),fictionalCustomer:{kind:"named_fictional_customer",name:"Fictional Alex"},text:"Please fit an outside tap."};
 const app=new JobSourceApplication({} as Pool);
 await app.intake(id,kind,body);
 expect(intake).toHaveBeenCalledExactlyOnceWith(context,id,digest,kind,body);
 for(const injected of [{tenantId:randomUUID()},{sessionDigest:"0".repeat(64)},{amountPence:100},{finalAccountRevisionId:randomUUID()}])await expect(app.intake(id,kind,{...body,...injected})).rejects.toThrow("INVALID_JOB_SOURCE_INPUT");
 expect(intake).toHaveBeenCalledTimes(1);
 job.mockRejectedValue(new Error("NOT_FOUND"));
 await expect(app.intake(id,kind,body)).rejects.toThrow("NOT_FOUND");
 expect(intake).toHaveBeenCalledTimes(1);
});
