import {beforeEach,describe,expect,it,vi} from "vitest";
const {list,save,event,photo,cookie,failure,snagFailure,constructed}=vi.hoisted(()=>({list:vi.fn(),save:vi.fn(),event:vi.fn(),photo:vi.fn(),cookie:vi.fn(),failure:vi.fn(),snagFailure:vi.fn(),constructed:vi.fn()}));
vi.mock("next/headers",()=>({cookies:async()=>({get:cookie})}));
vi.mock("../../../../lib/synthetic-server",()=>({hasSyntheticSession:(value:unknown)=>!!value,syntheticPool:()=>"pool"}));
vi.mock("../../../../../lib/synthetic-server",()=>({hasSyntheticSession:(value:unknown)=>!!value,syntheticPool:()=>"pool"}));
vi.mock("../../../../../../lib/synthetic-server",()=>({hasSyntheticSession:(value:unknown)=>!!value,syntheticPool:()=>"pool"}));
vi.mock("@jobguard/api/workspace",()=>({jobSourceFailure:failure,snagFailure,SnagApplication:class{constructor(...args:unknown[]){constructed(...args)}list=list;save=save;event=event;photo=photo}}));
import * as snags from "./route";
import * as events from "./[snagId]/events/route";
import * as photos from "./[snagId]/photos/route";
const params={params:Promise.resolve({id:"job"})},snagParams={params:Promise.resolve({id:"job",snagId:"snag"})};
const post=(body:unknown)=>new Request("https://fictional.invalid/",{method:"POST",body:JSON.stringify(body)});
beforeEach(()=>{for(const mock of [list,save,event,photo,failure,constructed])mock.mockReset();snagFailure.mockReset().mockReturnValue(null);cookie.mockReturnValue({value:"session"});vi.stubEnv("JOBGUARD_ENV","synthetic_demo")});
describe("QW-4 snag routes",()=>{
 it("reads and saves with the caller's session, no-store",async()=>{
  list.mockResolvedValue({version:"snag-list.v1"});save.mockResolvedValue({version:"snag-list.v1",saved:true});
  const read=await snags.GET(new Request("https://fictional.invalid/"),params);
  expect(await read.json()).toEqual({version:"snag-list.v1"});expect(read.headers.get("cache-control")).toBe("no-store");
  expect(constructed).toHaveBeenCalledWith("pool","session");expect(list).toHaveBeenCalledWith("job");
  expect(await (await snags.POST(post({version:"snag.v1"}),params)).json()).toEqual({version:"snag-list.v1",saved:true});
  expect(save).toHaveBeenCalledWith("job",{version:"snag.v1"});
 });
 it("passes events and photos to the job's snag",async()=>{
  event.mockResolvedValue({version:"snag-list.v1"});photo.mockResolvedValue({version:"snag-photo-result.v1"});
  expect((await events.POST(post({action:"mark_fixed"}),snagParams)).status).toBe(200);
  expect(event).toHaveBeenCalledWith("job","snag",{action:"mark_fixed"});
  expect(await (await photos.POST(post({action:"begin"}),snagParams)).json()).toEqual({version:"snag-photo-result.v1"});
  expect(photo).toHaveBeenCalledWith("job","snag",{action:"begin"});
 });
 it("refuses without a session, and in pilot mode, before constructing anything",async()=>{
  cookie.mockReturnValue(undefined);failure.mockReturnValue({status:401,body:{code:"UNAUTHENTICATED"}});
  for(const response of [await snags.GET(new Request("https://fictional.invalid/"),params),await snags.POST(post({}),params),await events.POST(post({}),snagParams),await photos.POST(post({}),snagParams)])expect(response.status).toBe(401);
  cookie.mockReturnValue({value:"session"});vi.stubEnv("JOBGUARD_ENV","pilot_no_charge");failure.mockReturnValue({status:403,body:{code:"SYNTHETIC_MODE_REQUIRED"}});
  for(const response of [await snags.GET(new Request("https://fictional.invalid/"),params),await snags.POST(post({}),params),await events.POST(post({}),snagParams),await photos.POST(post({}),snagParams)])expect(response.status).toBe(403);
  expect(constructed).not.toHaveBeenCalled();
 });
 it("maps snag refusals first, then falls back to the job-source mapping",async()=>{
  const refused=new Error("SNAG_TRANSITION_REFUSED");event.mockRejectedValueOnce(refused);snagFailure.mockReturnValueOnce({status:409,body:{code:"SNAG_TRANSITION_REFUSED"}});
  const answer=await events.POST(post({}),snagParams);
  expect(answer.status).toBe(409);expect(await answer.json()).toEqual({code:"SNAG_TRANSITION_REFUSED"});expect(snagFailure).toHaveBeenCalledWith(refused);
  const other=new Error("other");list.mockRejectedValueOnce(other);failure.mockReturnValue({status:404,body:{code:"NOT_FOUND"}});
  expect(await (await snags.GET(new Request("https://fictional.invalid/"),params)).json()).toEqual({code:"NOT_FOUND"});expect(failure).toHaveBeenCalledWith(other);
 });
});
