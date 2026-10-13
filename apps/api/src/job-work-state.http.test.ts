import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import { Pool as PoolProvider } from "pg";
import type { Pool } from "pg";
import { describe,expect,it,vi } from "vitest";
import { JobWorkStateController } from "./job-work-state.controller.js";
import { JobWorkStateApplication } from "./job-work-state.application.js";
import { AppModule } from "./app.module.js";
import { configureOpenApi } from "./bootstrap.js";
describe("CH-4 Nest read adapter (no socket)",()=>{
 it("CH4-A23 real AppModule mounts GET /jobs/:id/work-state and documents it",async()=>{
  const result={version:"job-work-state-read.v1",jobId:randomUUID(),events:[],links:[],lock:null,environment:"synthetic_demo",realExternalActions:0};
  const read=vi.spyOn(JobWorkStateApplication.prototype,"get").mockResolvedValue(result as Awaited<ReturnType<JobWorkStateApplication["get"]>>);
  vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
  const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(PoolProvider).useValue({}).compile();
  const app=module.createNestApplication();
  const registerGet=vi.spyOn(app.getHttpAdapter(),"get");
  try{
   await app.init();
   expect(app.get(JobWorkStateController)).toBeInstanceOf(JobWorkStateController);
   expect(registerGet).toHaveBeenCalledWith("/jobs/:id/work-state",expect.any(Function));
   const registration=registerGet.mock.calls.find(([path])=>path==="/jobs/:id/work-state")!;
   // Dispatch Nest's registered handler, including its guard and headers, without a socket.
   const response={status:vi.fn().mockReturnThis(),json:vi.fn(),set:vi.fn(),getHeader:vi.fn()};
   await registration[1]({path:`/jobs/${result.jobId}/work-state`,params:{id:result.jobId},headers:{cookie:`jg_session=${randomUUID()}`},query:{}},response,vi.fn());
   expect(read).toHaveBeenCalledWith(result.jobId,{});
   expect(response.status).toHaveBeenCalledWith(200);
   expect(response.json).toHaveBeenCalledWith(result);
   expect(response.set).toHaveBeenCalledWith("Cache-Control","no-store");
   const document=configureOpenApi(app) as {paths:Record<string,{get?:unknown}>};
   expect(document.paths["/jobs/{id}/work-state"]?.get).toBeDefined();
  }finally{
   await app.close();registerGet.mockRestore();read.mockRestore();vi.unstubAllEnvs();
  }
 });
 it("CH4-A23 controller delegates persisted reads and carries no-store; exposes no held writes",async()=>{
  const result={version:"job-work-state-read.v1",jobId:randomUUID(),events:[],links:[],lock:null,environment:"synthetic_demo",realExternalActions:0};
  const spy=vi.spyOn(JobWorkStateApplication.prototype,"get").mockResolvedValue(result as Awaited<ReturnType<JobWorkStateApplication["get"]>>);
  process.env.JOBGUARD_ENV="synthetic_demo";
  expect(await new JobWorkStateController({} as Pool).get(result.jobId,`jg_session=${randomUUID()}`)).toEqual(result);
  expect(Reflect.getMetadata("__headers__",JobWorkStateController.prototype.get)).toEqual([{name:"Cache-Control",value:"no-store"}]);
  expect(Object.getOwnPropertyNames(JobWorkStateController.prototype)).toEqual(["constructor","get"]);spy.mockRestore();
 });
});

const nextRead=vi.hoisted(()=>({get:vi.fn(),cookie:vi.fn()}));
vi.mock("next/headers",()=>({cookies:async()=>({get:nextRead.cookie})}));
vi.mock("../../web/app/lib/workspace-server",()=>({workspaceApplication:async()=>({workState:{get:nextRead.get,failure:()=>null}})}));
vi.mock("../../web/app/lib/synthetic-server",()=>({hasSyntheticSession:()=>true,practiceFailure:()=>null}));
it("CH4-A23 Next read adapter preserves exact timestamps and no-store (scripted service boundary)",async()=>{
 const id=randomUUID(),sourceId=randomUUID(),view={version:"job-work-state-read.v1",jobId:id,events:[{version:"job-work-state-event.v1",id:sourceId,jobId:id,sequence:1,kind:"first_site_evidence",factAt:"2026-10-13T10:00:00.000001Z",recordedAt:"2026-10-14T10:00:00.000002Z",sourceReceiptId:sourceId,commandId:null,predecessorId:null,closeReason:null,closeNote:null}],links:[],lock:null,environment:"synthetic_demo",realExternalActions:0};
 nextRead.get.mockResolvedValue(view);nextRead.cookie.mockReturnValue({value:randomUUID()});
 const modulePath=new URL("../../web/app/api/jobs/[id]/work-state/route.ts",import.meta.url).href;
 const route=await import(modulePath);
 const request=new Request(`https://synthetic.invalid/api/jobs/${id}/work-state`),params={params:Promise.resolve({id})};
 const first=await route.GET(request,params),second=await route.GET(request,params);
 expect(first.headers.get("Cache-Control")).toBe("no-store");expect(await first.text()).toBe(await second.text());expect(nextRead.get).toHaveBeenCalledWith(id,{});
});
