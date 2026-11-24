import {beforeEach,describe,expect,it,vi} from "vitest";
const {read,pdf,cookie,failure,registerFailure,constructed}=vi.hoisted(()=>({read:vi.fn(),pdf:vi.fn(),cookie:vi.fn(),failure:vi.fn(),registerFailure:vi.fn(),constructed:vi.fn()}));
vi.mock("next/headers",()=>({cookies:async()=>({get:cookie})}));
vi.mock("../../lib/synthetic-server",()=>({hasSyntheticSession:(value:unknown)=>!!value,syntheticPool:()=>"pool"}));
vi.mock("@jobguard/api/workspace",()=>({jobSourceFailure:failure,variationRegisterFailure:registerFailure,VariationRegisterApplication:class{constructor(...args:unknown[]){constructed(...args)}read=read;pdf=pdf}}));
import * as json from "./route";
import * as file from "./pdf/route";
beforeEach(()=>{read.mockReset();pdf.mockReset();failure.mockReset();registerFailure.mockReset().mockReturnValue(null);constructed.mockReset();cookie.mockReturnValue({value:"session"});vi.stubEnv("JOBGUARD_ENV","synthetic_demo")});
describe("QW-3 variation register routes",()=>{
 it("reads JSON with the caller's session and week query, no-store",async()=>{
  read.mockResolvedValue({version:"variation-register.v1"});
  const response=await json.GET(new Request("https://fictional.invalid/api/variation-register?week=2026-11-20"));
  expect(await response.json()).toEqual({version:"variation-register.v1"});expect(response.headers.get("cache-control")).toBe("no-store");
  expect(constructed).toHaveBeenCalledWith("pool","session");expect(read).toHaveBeenCalledWith({week:"2026-11-20"});
 });
 it("returns the PDF bytes as application/pdf, no-store, named by the week",async()=>{
  pdf.mockResolvedValue({register:{week:{friday:"2026-11-20"}},bytes:new TextEncoder().encode("%PDF-1.4\n%%EOF")});
  const response=await file.GET(new Request("https://fictional.invalid/api/variation-register/pdf"));
  expect(response.status).toBe(200);expect(response.headers.get("content-type")).toBe("application/pdf");expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("content-disposition")).toBe('attachment; filename="extras-register-2026-11-20.pdf"');
  expect(new TextDecoder().decode(await response.arrayBuffer())).toBe("%PDF-1.4\n%%EOF");expect(pdf).toHaveBeenCalledWith({});
 });
 it("refuses without a session, and in pilot mode, before reading",async()=>{
  for(const route of [json,file]){
   cookie.mockReturnValue(undefined);failure.mockReturnValue({status:401,body:{code:"UNAUTHENTICATED"}});
   expect((await route.GET(new Request("https://fictional.invalid/"))).status).toBe(401);
   cookie.mockReturnValue({value:"session"});vi.stubEnv("JOBGUARD_ENV","pilot_no_charge");failure.mockReturnValue({status:403,body:{code:"SYNTHETIC_MODE_REQUIRED"}});
   expect((await route.GET(new Request("https://fictional.invalid/"))).status).toBe(403);vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
  }
  expect(constructed).not.toHaveBeenCalled();
 });
 it("maps an open week, then falls back to the job-source mapping",async()=>{
  const open=new Error("REGISTER_WEEK_NOT_CLOSED");pdf.mockRejectedValueOnce(open);registerFailure.mockReturnValueOnce({status:404,body:{code:"REGISTER_WEEK_NOT_CLOSED"}});
  expect((await file.GET(new Request("https://fictional.invalid/"))).status).toBe(404);expect(registerFailure).toHaveBeenCalledWith(open);
  const other=new Error("other");read.mockRejectedValueOnce(other);failure.mockReturnValue({status:503,body:{code:"JOB_SOURCE_UNAVAILABLE"}});
  expect(await (await json.GET(new Request("https://fictional.invalid/"))).json()).toEqual({code:"JOB_SOURCE_UNAVAILABLE"});expect(failure).toHaveBeenCalledWith(other);
 });
});
