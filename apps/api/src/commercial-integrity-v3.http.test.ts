import "reflect-metadata";
import { createHash, randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Pool } from "pg";
import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { authenticatePracticeSession, issuePracticeSession } from "@jobguard/db";
import { AppModule } from "./app.module.js";
import { CommercialIntegrityV3Application } from "./commercial-integrity-v3.application.js";
// CI ONLY: real PostgreSQL 16, runtime role, real AppModule/guard and HTTP server.
// URL import keeps database test infrastructure outside the API compilation root.
const fixtureModule = await import(new URL("../../../packages/db/test/commercial-integrity-v3-fixtures.ts",import.meta.url).href);
type Fixture = { admin:Pool; runtime:Pool; auth:Awaited<ReturnType<typeof authenticatePracticeSession>>; close():Promise<void> };
let fixture:Fixture,app:INestApplication;
let token:string,job:string,otherToken:string;
const prefix=()=>`/jobs/${job}/commercial-integrity`;
const cookie=()=>`jg_session=${token}`;
beforeAll(async()=>{
 fixture=await fixtureModule.createIntegrityFixture();
 token=await issuePracticeSession(fixture.runtime);fixture.auth=await authenticatePracticeSession(fixture.runtime,token);
 otherToken=await issuePracticeSession(fixture.runtime);
 job=(await fixtureModule.seedIntegrityJob(fixture)).job;
 const module=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(Pool).useValue(fixture.runtime).compile();
 app=module.createNestApplication();await app.init();
},120000);
afterAll(async()=>{await app?.close();await fixture?.close();});
// Vitest runs this even if a timed-out test never reaches its finally block.
afterEach(()=>{vi.restoreAllMocks();});
describe.sequential("CI-A07 real current authority at HTTP boundary",()=>{
 it("family and view equal the real application; no authority metadata or legacy fee fields",async()=>{
  const family=await request(app.getHttpServer()).get(`${prefix()}/family`).set("Cookie",cookie()).expect(200);
  expect(family.headers["cache-control"]).toBe("no-store");expect(family.body.family).toBe("v3");
  const view=await request(app.getHttpServer()).get(`${prefix()}/v3`).set("Cookie",cookie()).expect(200);
  expect(view.headers["cache-control"]).toBe("no-store");expect(view.body.realExternalActions).toBe(0);
  expect(view.body.result.findings.length).toBeGreaterThan(0);expect(JSON.stringify(view.body)).not.toMatch(/sessionDigest|identityUserId|acceptedCap|planCredit/);
  const application=new CommercialIntegrityV3Application(fixture.runtime);
  expect(family.body).toEqual(await application.family(token,job));
  const direct=await application.view(token,job,{});
  // Display time is server-generated on each read; all persisted output must match.
  expect(view.body.result.evaluatedAt).toEqual(expect.any(String));
  expect(view.body).toEqual({...direct,result:{...direct.result,evaluatedAt:view.body.result.evaluatedAt}});
 });
 it("unknown/wrong-session jobs refuse before forged body details and source lookups",async()=>{
  for(const id of [job,randomUUID()]) {
   const read=await request(app.getHttpServer()).get(`/jobs/${id}/commercial-integrity/v3?tenantId=forged`).set("Cookie",`jg_session=${otherToken}`).expect(404);
   const write=await request(app.getHttpServer()).post(`/jobs/${id}/commercial-integrity/v3/reviews`).set("Cookie",`jg_session=${otherToken}`).send({tenantId:"forged"}).expect(404);
   expect(read.body).toEqual({code:"NOT_FOUND"});expect(write.body).toEqual(read.body);expect(write.headers["cache-control"]).toBe("no-store");
  }
 });
 it("zero/many hidden candidates leave HTTP bodies, headers, query paths and failed reviews unchanged",async()=>{
  const queries:string[]=[],original=fixture.runtime.connect.bind(fixture.runtime);
  const connect=vi.spyOn(fixture.runtime,"connect").mockImplementation(((callback?:Parameters<Pool["connect"]>[0])=>{
   // Pool.query uses the callback overload; only explicit promise connections
   // are wrapped for the tenant-transaction query trace below.
   if(typeof callback==="function")return original(callback);
   return (async()=>{const db=await original(),query=db.query.bind(db);return new Proxy(db,{get(target,key){if(key==="query")return async(sql:string,values?:unknown[])=>{queries.push(sql);return query(sql,values);};const value=Reflect.get(target,key);return typeof value==="function"?value.bind(target):value;}});})();
  }) as Pool["connect"]);
  const collect=async()=>{
   const read=await request(app.getHttpServer()).get(`${prefix()}/v3`).set("Cookie",cookie()).expect(200);
   const failure=await request(app.getHttpServer()).post(`${prefix()}/v3/reviews`).set("Cookie",cookie()).send({version:"commercial-integrity-review.v3",commandId:"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",findingKey:"missing",findingSnapshotHash:"a".repeat(64),outcome:"dismissed_false_positive",explanation:"Fictional stale source."}).expect(409);
   const sequence=queries.splice(0);return {read,failure,sequence};
  };
  try {
   const before=await fixtureModule.protectedFacts(fixture);
   const zero=await collect();
   await fixtureModule.transaction(fixture.admin,async(db:{query(sql:string,args:unknown[]):Promise<unknown>})=>{
    for(let n=0;n<25;n++){const id=randomUUID();await db.query(`INSERT INTO app.shadow_commercial_signal(tenant_id,job_id,id,work_id,signal_type,detector_kind,detector_version,evidence_cutoff_at,description,confidence_band,state)
     VALUES($1,$2,$3,$3,'possible_extra','deterministic','synthetic.ch6',clock_timestamp(),'Fictional hidden work','low','held_for_final_check')`,[fixture.auth.context.tenantId,job,id]);}
   });
   const many=await collect();expect(many.sequence).toEqual(zero.sequence);expect(zero.sequence.length).toBeGreaterThan(5);expect(zero.sequence.join("\n")).not.toMatch(/shadow_|reveal_shadow/iu);
   many.read.body.result.evaluatedAt=zero.read.body.result.evaluatedAt;
   expect(many.read.body).toEqual(zero.read.body);expect(many.failure.body).toEqual(zero.failure.body);
   for(const pair of [zero,many]){expect(pair.read.headers["cache-control"]).toBe("no-store");expect(pair.failure.headers["cache-control"]).toBe("no-store");}
   expect(await fixtureModule.protectedFacts(fixture)).toEqual(before);
  }finally{connect.mockRestore();}
 });
 it("current membership expiry/revocation blocks every sensitive read and review",async()=>{
  const args=[fixture.auth.context.tenantId,fixture.auth.membershipId];
  const previous=(await fixture.admin.query("SELECT revoked_at,expires_at FROM app.membership WHERE tenant_id=$1 AND id=$2",args)).rows[0];
  try {
   for(const assignment of ["expires_at=clock_timestamp()-interval '1 second'","expires_at=NULL,revoked_at=clock_timestamp()"]){
    await fixture.admin.query(`UPDATE app.membership SET ${assignment} WHERE tenant_id=$1 AND id=$2`,args);
    for(const route of ["family","v3"]){const result=await request(app.getHttpServer()).get(`${prefix()}/${route}`).set("Cookie",cookie()).expect(401);expect(result.headers["cache-control"]).toBe("no-store");}
    await request(app.getHttpServer()).post(`${prefix()}/v3/reviews`).set("Cookie",cookie()).send({tenantId:"forged"}).expect(401);
   }
  }finally{await fixture.admin.query("UPDATE app.membership SET revoked_at=$3,expires_at=$4 WHERE tenant_id=$1 AND id=$2",[...args,previous.revoked_at,previous.expires_at]);}
 });
 it("persists exact feedback, rejects a wrong-job snapshot and rechecks expired/revoked session on replay",async()=>{
  const application=new CommercialIntegrityV3Application(fixture.runtime),view=await application.view(token,job,{}),finding=view.result.findings[0]!;
  const { canonicalCommercialIntegritySnapshot }=await import(new URL("../../../packages/core/dist/commercial-integrity-v3.js",import.meta.url).href);
  const review={version:"commercial-integrity-review.v3",commandId:randomUUID(),findingKey:finding.key,findingSnapshotHash:createHash("sha256").update(canonicalCommercialIntegritySnapshot(finding.sourceSnapshot)).digest("hex"),outcome:"dismissed_false_positive",explanation:"Fictional interim invoice."};
  const first=await request(app.getHttpServer()).post(`${prefix()}/v3/reviews`).set("Cookie",cookie()).send(review).expect(200);
  const replay=await request(app.getHttpServer()).post(`${prefix()}/v3/reviews`).set("Cookie",cookie()).send(review).expect(200);expect(replay.body).toEqual(first.body);
  const otherJob=(await fixtureModule.seedIntegrityJob(fixture)).job;
  await request(app.getHttpServer()).post(`/jobs/${otherJob}/commercial-integrity/v3/reviews`).set("Cookie",cookie()).send({...review,commandId:randomUUID()}).expect(409);
  const digest=createHash("sha256").update(token).digest("hex");
  for(const assignment of ["expires_at=clock_timestamp()-interval '1 second'","expires_at=clock_timestamp()+interval '1 day',revoked_at=clock_timestamp()"]){
   await fixture.admin.query(`UPDATE control_plane.practice_session SET ${assignment} WHERE token_digest=$1`,[digest]);
   for(const method of ["get","post"] as const){
    const result=method==="get"?await request(app.getHttpServer()).get(`${prefix()}/v3`).set("Cookie",cookie()):await request(app.getHttpServer()).post(`${prefix()}/v3/reviews`).set("Cookie",cookie()).send(review);
    expect(result.status).toBe(401);expect(result.body).toEqual({code:"UNAUTHENTICATED"});expect(result.headers["cache-control"]).toBe("no-store");
   }
  }
 });
});
