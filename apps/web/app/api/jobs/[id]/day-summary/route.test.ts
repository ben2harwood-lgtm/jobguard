import {beforeEach,describe,expect,it,vi} from "vitest";
const {read,cookie,failure,dayFailure,constructed}=vi.hoisted(()=>({read:vi.fn(),cookie:vi.fn(),failure:vi.fn(),dayFailure:vi.fn(),constructed:vi.fn()}));
vi.mock("next/headers",()=>({cookies:async()=>({get:cookie})}));
vi.mock("../../../../lib/synthetic-server",()=>({hasSyntheticSession:(value:unknown)=>!!value,syntheticPool:()=>"pool"}));
vi.mock("@jobguard/api/workspace",()=>({jobSourceFailure:failure,siteDaySummaryFailure:dayFailure,SiteDaySummaryApplication:class{constructor(...args:unknown[]){constructed(...args)}read=read}}));
import * as route from "./route";
const params={params:Promise.resolve({id:"job"})};
beforeEach(()=>{read.mockReset();failure.mockReset();dayFailure.mockReset().mockReturnValue(null);constructed.mockReset();cookie.mockReturnValue({value:"session"});vi.stubEnv("JOBGUARD_ENV","synthetic_demo")});
describe("QW-2 site day summary route",()=>{
 it("reads with the caller's session and the date query, no-store",async()=>{
  read.mockResolvedValue({version:"site-day-summary.v1"});
  const response=await route.GET(new Request("https://fictional.invalid/api/jobs/job/day-summary?date=2026-11-24"),params);
  expect(await response.json()).toEqual({version:"site-day-summary.v1"});expect(response.headers.get("cache-control")).toBe("no-store");
  expect(constructed).toHaveBeenCalledWith("pool","session");expect(read).toHaveBeenCalledWith("job",{date:"2026-11-24"});
 });
 it("refuses without a session, and in pilot mode, before reading",async()=>{
  cookie.mockReturnValue(undefined);failure.mockReturnValue({status:401,body:{code:"UNAUTHENTICATED"}});
  expect((await route.GET(new Request("https://fictional.invalid/"),params)).status).toBe(401);
  cookie.mockReturnValue({value:"session"});vi.stubEnv("JOBGUARD_ENV","pilot_no_charge");failure.mockReturnValue({status:403,body:{code:"SYNTHETIC_MODE_REQUIRED"}});
  expect((await route.GET(new Request("https://fictional.invalid/"),params)).status).toBe(403);
  expect(constructed).not.toHaveBeenCalled();expect(read).not.toHaveBeenCalled();
 });
 it("maps a day that has not started, then falls back to the job-source mapping",async()=>{
  const early=new Error("SITE_DAY_NOT_STARTED");read.mockRejectedValueOnce(early);dayFailure.mockReturnValueOnce({status:404,body:{code:"SITE_DAY_NOT_STARTED"}});
  expect((await route.GET(new Request("https://fictional.invalid/"),params)).status).toBe(404);expect(dayFailure).toHaveBeenCalledWith(early);
  const other=new Error("other");read.mockRejectedValueOnce(other);failure.mockReturnValue({status:404,body:{code:"NOT_FOUND"}});
  expect(await (await route.GET(new Request("https://fictional.invalid/"),params)).json()).toEqual({code:"NOT_FOUND"});expect(failure).toHaveBeenCalledWith(other);
 });
});
