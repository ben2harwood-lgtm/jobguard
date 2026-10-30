import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import { Pool } from "pg";
import { afterEach,expect,it,vi } from "vitest";
import { SuccessFeeError } from "@jobguard/core";
import { AppModule } from "./app.module.js";
import { SuccessFeeApplication } from "./success-fee.application.js";
import { configureOpenApi } from "./bootstrap.js";
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
it("SF-24 registered Nest pipeline delegates with no-store (no sockets or persistence proof)",async()=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
 const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(Pool).useValue({}).compile();
 const app=module.createNestApplication(),adapter=app.getHttpAdapter(),get=vi.spyOn(adapter,"get"),post=vi.spyOn(adapter,"post");
 const id=randomUUID(),result={version:"success-fee-availability.v1" as const,jobId:id,environment:"synthetic_demo" as const,state:"dependency_bound" as const,dependency:"accepted_attribution_source_adapter" as const,productionEnabled:false as const,realExternalActions:0 as const};
 const read=vi.spyOn(SuccessFeeApplication.prototype,"view").mockResolvedValue(result);
 const write=vi.spyOn(SuccessFeeApplication.prototype,"command").mockRejectedValue(new SuccessFeeError("SUCCESS_FEE_DEPENDENCY_BOUND"));
 try{
  await app.init();const path="/jobs/:id/success-fees",route=get.mock.calls.find(([p])=>p===path)!,writeRoute=post.mock.calls.find(([p])=>p===path)!;
  expect(route).toBeDefined();expect(writeRoute).toBeDefined();
  const request={path:`/jobs/${id}/success-fees`,params:{id},headers:{cookie:`jg_session=${randomUUID()}`},query:{},body:{}};
  const response=()=>({status:vi.fn().mockReturnThis(),json:vi.fn(),set:vi.fn(),getHeader:vi.fn()});
  const r=response();await route[1](request,r,vi.fn());expect(r.json).toHaveBeenCalledWith(result);expect(r.set).toHaveBeenCalledWith("Cache-Control","no-store");expect(read).toHaveBeenCalledWith(id,{},false);
  const w=response();await writeRoute[1](request,w,vi.fn());expect(w.status).toHaveBeenCalledWith(503);expect(w.json).toHaveBeenCalledWith({code:"SUCCESS_FEE_DEPENDENCY_BOUND"});expect(w.set).toHaveBeenCalledWith("Cache-Control","no-store");expect(write).toHaveBeenCalledWith(id,{}, {},false);
  const doc=configureOpenApi(app) as {paths:Record<string,{get?:unknown;post?:unknown}>};expect(doc.paths["/jobs/{id}/success-fees"]?.get).toBeDefined();expect(doc.paths["/jobs/{id}/success-fees"]?.post).toBeDefined();
 }finally{await app.close();}
});
