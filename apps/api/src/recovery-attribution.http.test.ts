import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import { Pool } from "pg";
import { afterEach,expect,it,vi } from "vitest";
import { AppModule } from "./app.module.js";
import { RecoveryAttributionApplication } from "./recovery-attribution.application.js";
import { configureOpenApi } from "./bootstrap.js";
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
it("SV6-26 Nest registers authenticated GET and POST with the shared application (no socket boundary proof)",async()=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
 const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(Pool).useValue({}).compile();
 const app=module.createNestApplication(),adapter=app.getHttpAdapter();
 const get=vi.spyOn(adapter,"get"),post=vi.spyOn(adapter,"post");
 const result={version:"recovery-attribution-history.v1" as const,jobId:randomUUID(),environment:"synthetic_demo" as const,proposed:true as const,principalOnly:true as const,productionEnabled:false as const,realExternalActions:0 as const,qualification:"dependency_bound" as const,revisions:[]};
 const read=vi.spyOn(RecoveryAttributionApplication.prototype,"get").mockResolvedValue(result);
 try{
  await app.init();
  const path="/jobs/:id/success-fee-attribution";
  const route=get.mock.calls.find(([p])=>p===path)!;expect(route).toBeDefined();expect(post).toHaveBeenCalledWith(path,expect.any(Function));
  const response={status:vi.fn().mockReturnThis(),json:vi.fn(),set:vi.fn(),getHeader:vi.fn()};
  await route[1]({path:`/jobs/${result.jobId}/success-fee-attribution`,params:{id:result.jobId},headers:{cookie:`jg_session=${randomUUID()}`},query:{}},response,vi.fn());
  expect(response.json).toHaveBeenCalledWith(result);expect(read).toHaveBeenCalledWith(result.jobId,{});
  expect(response.set).toHaveBeenCalledWith("Cache-Control","no-store");
  const doc=configureOpenApi(app) as {paths:Record<string,{get?:unknown;post?:unknown}>};
  expect(doc.paths["/jobs/{id}/success-fee-attribution"]?.get).toBeDefined();expect(doc.paths["/jobs/{id}/success-fee-attribution"]?.post).toBeDefined();
 }finally{await app.close();}
});
const next=vi.hoisted(()=>({get:vi.fn(),command:vi.fn()}));
vi.mock("../../web/app/lib/workspace-server",()=>({workspaceApplication:async()=>({recoveryAttribution:next})}));
it("SV6-26 Next delegates GET and POST to the shared application (scripted transport)",async()=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
 const route=await import(new URL("../../web/app/api/jobs/[id]/success-fee-attribution/route.ts",import.meta.url).href);
 const id=randomUUID(),params={params:Promise.resolve({id})},url=`https://synthetic.invalid/api/jobs/${id}/success-fee-attribution`;
 next.get.mockResolvedValue({environment:"synthetic_demo",proposed:true,principalOnly:true,realExternalActions:0,revisions:[]});
 const result=await route.GET(new Request(url),params);expect(result.status).toBe(200);expect(result.headers.get("Cache-Control")).toBe("no-store");expect(next.get).toHaveBeenCalledWith(id,{});
 next.command.mockRejectedValue(new Error("RECOVERY_ATTRIBUTION_DEPENDENCY_BOUND"));
 const denied=await route.POST(new Request(url,{method:"POST",headers:{"Content-Type":"application/json"},body:"{}"}),params);
 expect(denied.status).toBe(503);expect(await denied.json()).toEqual({code:"RECOVERY_ATTRIBUTION_DEPENDENCY_BOUND"});
 vi.stubEnv("JOBGUARD_ENV","production");expect((await route.GET(new Request(url),params)).status).toBe(403);
});

it("SV6-26 PostgreSQL actual HTTP and fresh applications read the same stored history",async()=>{
 // Requires PostgreSQL and socket binding: run in reviewer/CI, not the dispatcher sandbox.
 const request=(await import("supertest")).default;
 const helpers=await import(new URL("../../../packages/db/test/recovery-attribution-fixture.ts",import.meta.url).href);
 const db=await import("@jobguard/db");
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
 const f=await helpers.createLockFixture();
 let app:import("@nestjs/common").INestApplication|undefined;
 try{
  const {DEMO_TENANT_ID:T,DEMO_ACCOUNT_ID:A,DEMO_IDENTITY_USER_ID:U,DEMO_MEMBERSHIP_ID:M}=db;
  await f.admin.query("INSERT INTO control_plane.tenant(id) VALUES($1) ON CONFLICT DO NOTHING",[T]);
  await f.admin.query("INSERT INTO identity.identity_user(id) VALUES($1) ON CONFLICT DO NOTHING",[U]);
  await f.admin.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional HTTP attribution') ON CONFLICT DO NOTHING",[A,T]);
  await f.admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner') ON CONFLICT DO NOTHING",[M,T,A,U]);
  const token=await db.issuePracticeSession(f.runtime),auth=await db.authenticatePracticeSession(f.runtime,token);
  const {p,document,command}=await helpers.storedAttributionFixture(f,T,auth.digest);
  await helpers.asFixtureTenant(f.owner,T,(client:any)=>client.query("SELECT app.append_recovery_attribution($1,$2,$3,null,null)",[document,helpers.LOCK_OWNER,command]));
  const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(Pool).useValue(f.runtime).compile();
  app=module.createNestApplication();await app.init();
  const url=`/jobs/${p.jobId}/success-fee-attribution`;
  const first=await request(app.getHttpServer()).get(url).set("Cookie",`jg_session=${token}`).expect(200);
  expect(first.body.revisions).toEqual([document]);
  expect(await new RecoveryAttributionApplication(f.runtime,token).get(p.jobId)).toEqual(first.body);
  next.get.mockImplementation((id,query)=>new RecoveryAttributionApplication(f.runtime,token).get(id,query));
  const route=await import(new URL("../../web/app/api/jobs/[id]/success-fee-attribution/route.ts",import.meta.url).href);
  expect(await (await route.GET(new Request(`https://synthetic.invalid${url}`),{params:Promise.resolve({id:p.jobId})})).json()).toEqual(first.body);
  await request(app.getHttpServer()).post(url).set("Cookie",`jg_session=${token}`).send({...command,action:"approve_review",assessmentId:document.assessmentId,expectedSourceHash:document.sourceHash,reviewArtifactHash:"b".repeat(64)}).expect(409).expect(({body})=>expect(body.code).toBe("RECOVERY_ATTRIBUTION_IDEMPOTENCY_CONFLICT"));
  const stranger=await db.issuePracticeSession(f.runtime);
  await request(app.getHttpServer()).get(url).set("Cookie",`jg_session=${stranger}`).expect(404);
  await f.admin.query("UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1",[auth.digest]);
  await request(app.getHttpServer()).get(url).set("Cookie",`jg_session=${token}`).expect(401);
 }finally{if(app)await app.close();await helpers.closeLockFixture(f);}
},90000);
