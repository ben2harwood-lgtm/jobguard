import { randomUUID } from "node:crypto";
import { HttpException } from "@nestjs/common";
import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { RecoveryCaseApplication } from "./recovery-case.application.js";
import { RecoveryCaseController } from "./recovery-case.controller.js";

afterEach(() => vi.restoreAllMocks());
it.each(["ELIGIBILITY_STALE_REVISION", "ELIGIBILITY_REVIEW_REQUIRED"])("maps %s to the re-review conflict", async code => {
 vi.spyOn(RecoveryCaseApplication.prototype, "eligibility").mockRejectedValue(new Error(code));
 const controller = new RecoveryCaseController({} as Pool);
 try {
  await controller.eligibility(randomUUID(), {}, { headers: { cookie: `jg_session=${randomUUID()}` } });
  expect.fail("Expected rejection");
 } catch (error) {
  expect(error).toBeInstanceOf(HttpException);
  expect((error as HttpException).getStatus()).toBe(409);
  expect((error as HttpException).getResponse()).toEqual({ code, message: "Review the changed evidence before approving" });
 }
});
it("passes only the session cookie to the shared application boundary", async () => {
 const execute = vi.spyOn(RecoveryCaseApplication.prototype, "eligibility").mockResolvedValue({ version: "recovery-case-workbench.v1", environment: "synthetic_demo", realExternalActions: 0, cases: [], affectedCaseId: randomUUID() });
 const session = randomUUID(), job = randomUUID(), body = { action: "review" };
 await new RecoveryCaseController({} as Pool).eligibility(job, body, { headers: { cookie: `unrelated=value; jg_session=${session}` } });
 expect(execute).toHaveBeenCalledWith(job, body, session);
});

it.each(["post", "eligibility"] as const)("%s keeps unexpected/uncertain write failures on the 5xx unknown path", async method => {
 vi.spyOn(RecoveryCaseApplication.prototype, method === "post" ? "command" : "eligibility").mockRejectedValue(new Error("connection lost during COMMIT"));
 const controller = new RecoveryCaseController({} as Pool);
 try {
  if (method === "post") await controller.post(randomUUID(), {});
  else await controller.eligibility(randomUUID(), {}, { headers: { cookie: `jg_session=${randomUUID()}` } });
  expect.fail("Expected unknown outcome");
 } catch (error) {
  expect(error).toBeInstanceOf(HttpException);
  expect((error as HttpException).getStatus()).toBe(503);
  expect((error as HttpException).getResponse()).toMatchObject({ version: "recovery-command-error.v1", code: "RECOVERY_COMMAND_OUTCOME_UNKNOWN", outcome: "unknown" });
 }
});

// Repair 18: exercise each Nest handler through real PracticeAccess and the existing filter, without a socket.
it.each([
 ["list",undefined], ["open",{action:"open"}], ["amend_claim",{action:"amend_claim"}],
 ...["assemble_evidence","start_pursuit","start_negotiation","resume_pursuit","record_landing","close_recovered","close_no_recovery","write_off","dispute","reverse_landing","prevent"].map(event=>[event,{action:"transition",eventType:event}] as const),
 ...["review","approve","supersede"].map(action=>[`eligibility ${action}`,{action}] as const),
] as const)("%s returns 401 for missing sessions and identical 404s for a stranger and a nonexistent job",async(name,body)=>{
 vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
 try {
  const {RecoveryCaseRepository}=await import("@jobguard/db");
  const {PracticeErrorsFilter}=await import("./practice-errors.filter.js");
  const repository=[vi.spyOn(RecoveryCaseRepository.prototype,"command"),vi.spyOn(RecoveryCaseRepository.prototype,"eligibilityCommand"),vi.spyOn(RecoveryCaseRepository.prototype,"listForMember")];
  for(const scenario of ["missing","stranger","nonexistent"]){
   const query=vi.fn(async(sql:string)=>({rows:scenario!=="missing"&&sql.includes("authenticate_practice_session")?[{tenant_id:randomUUID(),membership_id:randomUUID(),identity_user_id:randomUUID()}]:[]}));
   const connect=vi.fn(async()=>({query,release:vi.fn()}));
   const controller=new RecoveryCaseController({query,connect} as unknown as Pool);
   const cookie=scenario==="missing"?undefined:`jg_session=${randomUUID()}`;
   let error:unknown;
   try {
    if(name==="list")await controller.get(randomUUID(),cookie);
    else if(name.startsWith("eligibility"))await controller.eligibility(randomUUID(),body,{headers:{...(cookie?{cookie}:{})}});
    else await controller.post(randomUUID(),body,cookie);
   }catch(cause){error=cause}
   expect(error).toBeTruthy();
   const json=vi.fn(),status=vi.fn(()=>({json}));
   new PracticeErrorsFilter().catch(error as never,{switchToHttp:()=>({getResponse:()=>({status})})} as never);
   expect(status).toHaveBeenCalledWith(scenario==="missing"?401:404);
   expect(json).toHaveBeenCalledWith({code:scenario==="missing"?"UNAUTHENTICATED":"NOT_FOUND"});
   for(const call of repository)expect(call).not.toHaveBeenCalled();
   if(scenario==="missing"){expect(query).not.toHaveBeenCalled();expect(connect).not.toHaveBeenCalled()}
  }
 }finally{vi.unstubAllEnvs()}
});
