import "reflect-metadata";
import { readFile } from "node:fs/promises";
import { Test } from "@nestjs/testing";
import { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { CommercialIntegrityV3Application } from "./commercial-integrity-v3.application.js";
import { CommercialIntegrityV3Controller } from "./commercial-integrity-v3.controller.js";
import { IntegrityV3Error } from "./commercial-integrity-v3.contracts.js";
import { createWorkspaceApplication } from "./workspace/application.js";
import { AppModule } from "./app.module.js";
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
it("Nest forwards only job/cookie/input and emits no-store on success and bounded errors",async()=>{
 const controller=new CommercialIntegrityV3Controller({} as Pool),id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",cookie="jg_session=token";
 const response={setHeader:vi.fn(),status:vi.fn().mockReturnThis(),json:vi.fn()};
 for(const action of ["family","view","review"] as const) {
  const call=vi.spyOn(CommercialIntegrityV3Application.prototype,action).mockResolvedValue({version:"saved"} as never);
  const run=()=>action==="family"?controller.family(id,cookie,response):action==="view"?controller.view(id,cookie,{},response):controller.review(id,cookie,{},response);
  await run();expect(response.status).toHaveBeenLastCalledWith(200);expect(response.json).toHaveBeenLastCalledWith({version:"saved"});
  for(const [code,status] of [["UNAUTHENTICATED",401],["NOT_FOUND",404],["INVALID_INTEGRITY_REVIEW",400],["IDEMPOTENCY_CONFLICT",409],["INTEGRITY_FAMILY_UNAVAILABLE",503]] as const){
   call.mockRejectedValue(new IntegrityV3Error(code));await run();expect(response.status).toHaveBeenLastCalledWith(status);expect(response.json).toHaveBeenLastCalledWith({code});
  }
  expect(response.setHeader).toHaveBeenCalledWith("Cache-Control","no-store");call.mockRestore();
 }
});
it("real Nest module registers all three additive handlers (no socket; scripted boundary)",async()=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
 const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(Pool).useValue({}).compile();
 const app=module.createNestApplication(),get=vi.spyOn(app.getHttpAdapter(),"get"),post=vi.spyOn(app.getHttpAdapter(),"post");
 try {await app.init();expect(app.get(CommercialIntegrityV3Controller)).toBeInstanceOf(CommercialIntegrityV3Controller);
 for(const path of ["/jobs/:id/commercial-integrity/family","/jobs/:id/commercial-integrity/v3"])expect(get).toHaveBeenCalledWith(path,expect.any(Function));
 expect(post).toHaveBeenCalledWith("/jobs/:id/commercial-integrity/v3/reviews",expect.any(Function));
 }finally{await app.close();}
});
it("builder boundary has no hidden reads, money/meter/command/provider consumer or evaluator",async()=>{
 for(const path of ["commercial-integrity-v3.application.ts","commercial-integrity-v3.controller.ts"]){
  const source=await readFile(new URL(path,import.meta.url),"utf8");
  expect(source).not.toMatch(/shadow_signal|shadow_candidate|evaluateCommercial|fee-repository|meter-|CommandDispatcher|fetch\(|stripe|gocardless|acceptedCap|planCredit/u);
 }
 const source=await readFile(new URL("commercial-integrity-v3.application.ts",import.meta.url),"utf8");
 expect(source).toContain("r.read(");expect(source).toContain("r.review(");expect(source).toContain("r.readFamily(");
});

it("workspace composes all CH-6 methods with only its request session authority",async()=>{
 const sessionId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",jobId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
 const query={},body={version:"commercial-integrity-review.v3"};
 const family=vi.spyOn(CommercialIntegrityV3Application.prototype,"family").mockResolvedValue({family:"v3"} as never);
 const view=vi.spyOn(CommercialIntegrityV3Application.prototype,"view").mockResolvedValue({version:"saved-view"} as never);
 const review=vi.spyOn(CommercialIntegrityV3Application.prototype,"review").mockResolvedValue({version:"saved-review"} as never);
 const workspace=createWorkspaceApplication({pool:{} as Pool,sessionId});
 expect(await workspace.commercialIntegrityV3.family(jobId)).toEqual({family:"v3"});
 expect(await workspace.commercialIntegrityV3.view(jobId,query)).toEqual({version:"saved-view"});
 expect(await workspace.commercialIntegrityV3.review(jobId,body)).toEqual({version:"saved-review"});
 expect(family).toHaveBeenCalledWith(sessionId,jobId);
 expect(view).toHaveBeenCalledWith(sessionId,jobId,query);
 expect(review).toHaveBeenCalledWith(sessionId,jobId,body);
 const anonymous=createWorkspaceApplication({pool:{} as Pool});
 await anonymous.commercialIntegrityV3.family(jobId);
 expect(family).toHaveBeenLastCalledWith(undefined,jobId);
});
