import {beforeEach,describe,expect,it,vi} from "vitest";
const {read,cookie,failure,constructed}=vi.hoisted(()=>({read:vi.fn(),cookie:vi.fn(),failure:vi.fn(),constructed:vi.fn()}));
vi.mock("next/headers",()=>({cookies:async()=>({get:cookie})}));
vi.mock("../../../../../../lib/synthetic-server",()=>({hasSyntheticSession:(value:unknown)=>!!value,syntheticPool:()=>"pool"}));
vi.mock("@jobguard/api/workspace",()=>({jobSourceFailure:failure,QuoteLinePacksApplication:class{constructor(...args:unknown[]){constructed(...args)}read=read}}));
import * as route from "./route";
const params={params:Promise.resolve({id:"job",lineId:"line"})};
beforeEach(()=>{read.mockReset();failure.mockReset();constructed.mockReset();cookie.mockReturnValue({value:"session"});vi.stubEnv("JOBGUARD_ENV","synthetic_demo")});
describe("QW-6 quote line pack count route",()=>{
 it("reads with the caller's session, the line and the query, no-store",async()=>{
  read.mockResolvedValue({version:"pack-count.v1",status:"calculated",grossPacks:"6",packsOnSiteUsed:"1",packsToOrder:"5"});
  const response=await route.GET(new Request("https://fictional.invalid/api/jobs/job/quote-lines/line/packs?packSize=1.2&packUnit=m%C2%B2&wastage=1.10&onSite=1"),params);
  expect(await response.json()).toMatchObject({version:"pack-count.v1",packsToOrder:"5"});expect(response.headers.get("cache-control")).toBe("no-store");
  expect(constructed).toHaveBeenCalledWith("pool","session");expect(read).toHaveBeenCalledWith("job","line",{packSize:"1.2",packUnit:"m²",wastage:"1.10",onSite:"1"});
 });
 it("refuses without a session, and in pilot mode, before reading",async()=>{
  cookie.mockReturnValue(undefined);failure.mockReturnValue({status:401,body:{code:"UNAUTHENTICATED"}});
  expect((await route.GET(new Request("https://fictional.invalid/"),params)).status).toBe(401);
  cookie.mockReturnValue({value:"session"});vi.stubEnv("JOBGUARD_ENV","pilot_no_charge");failure.mockReturnValue({status:403,body:{code:"SYNTHETIC_MODE_REQUIRED"}});
  expect((await route.GET(new Request("https://fictional.invalid/"),params)).status).toBe(403);
  expect(constructed).not.toHaveBeenCalled();expect(read).not.toHaveBeenCalled();
 });
 it("maps read failures through the job-source mapping",async()=>{
  const missing=new Error("NOT_FOUND");read.mockRejectedValueOnce(missing);failure.mockReturnValue({status:404,body:{code:"NOT_FOUND"}});
  const response=await route.GET(new Request("https://fictional.invalid/"),params);
  expect(response.status).toBe(404);expect(await response.json()).toEqual({code:"NOT_FOUND"});expect(failure).toHaveBeenCalledWith(missing);
 });
});
