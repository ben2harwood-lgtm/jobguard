import {afterEach,beforeEach,expect,it,vi} from "vitest";
import type {Pool} from "pg";
const {job,save,history}=vi.hoisted(()=>({job:vi.fn(),save:vi.fn(),history:vi.fn()}));
vi.mock("./practice-access.js",()=>({PracticeAccess:class{job=job;}}));
vi.mock("@jobguard/db",async original=>({...await original<Record<string,unknown>>(),importLateSource:save,readLateSources:history}));
import {JobSourceApplication} from "./job-source.application.js";
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("JOBGUARD_ENV","synthetic_demo");job.mockResolvedValue({context:{tenantId:"trusted"},digest:"server-session"});});
afterEach(()=>vi.unstubAllEnvs());
it("uses the separate historical command with server-selected tenant and session",async()=>{
 save.mockResolvedValue({evidenceAfterLock:true});
 const raw={version:"late-source-import.v1"};
 expect(await new JobSourceApplication({} as Pool).importHistorical("job",raw)).toEqual({evidenceAfterLock:true});
 expect(save).toHaveBeenCalledWith({}, {tenantId:"trusted"},"job","server-session",raw);
});
it("refuses real mode and foreign jobs before invoking evidence import",async()=>{
 vi.stubEnv("JOBGUARD_ENV","pilot_no_charge");expect(()=>new JobSourceApplication({} as Pool)).toThrow("SYNTHETIC_MODE_REQUIRED");
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");job.mockRejectedValue(new Error("NOT_FOUND"));
 await expect(new JobSourceApplication({} as Pool).importHistorical("foreign",{})).rejects.toThrow("NOT_FOUND");
 expect(save).not.toHaveBeenCalled();
});

it("historical originals are read only after job ownership is checked",async()=>{
 history.mockResolvedValue([]);expect(await new JobSourceApplication({} as Pool).historical("job")).toEqual([]);
 expect(history).toHaveBeenCalledWith({}, {tenantId:"trusted"},"job");
 job.mockRejectedValue(new Error("NOT_FOUND"));await expect(new JobSourceApplication({} as Pool).historical("foreign")).rejects.toThrow("NOT_FOUND");
 expect(history).toHaveBeenCalledTimes(1);
});
