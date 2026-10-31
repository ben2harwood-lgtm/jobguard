import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommercialIntegrityV3Application } from "./commercial-integrity-v3.application.js";
import { PracticeAccess } from "./practice-access.js";
import { PracticeAccessError, CommercialIntegrityV3Repository, CommercialIntegrityPersistenceError } from "@jobguard/db";
import { integrityV3Failure } from "./commercial-integrity-v3.contracts.js";
const job="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", session="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const context={tenantId:"cccccccc-cccc-4ccc-8ccc-cccccccccccc"};
const principal={context,membershipId:job,identityUserId:session,digest:"a".repeat(64)};
const input={version:"commercial-integrity-review.v3",commandId:job,findingKey:"ordinary",findingSnapshotHash:"a".repeat(64),outcome:"dismissed_false_positive",explanation:"An ordinary reason"};
const feedback={...input,jobId:job,...principal,sessionDigest:principal.digest,recordedAt:"2026-10-24T10:00:00.000000Z"};
const app=()=>new CommercialIntegrityV3Application({} as never);
beforeEach(()=>{vi.stubEnv("JOBGUARD_ENV","synthetic_demo");vi.spyOn(PracticeAccess.prototype,"job").mockResolvedValue(principal as never);});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();});
describe("CH6-A current authority and strict inputs",()=>{
 it("refuses wrong mode before constructing/querying authority",async()=>{
  vi.stubEnv("JOBGUARD_ENV","production");
  for(const run of [()=>app().family(session,job),()=>app().view(session,job,{}),()=>app().review(session,job,input)])await expect(run()).rejects.toMatchObject({code:"SYNTHETIC_MODE_REQUIRED"});
  expect(PracticeAccess.prototype.job).not.toHaveBeenCalled();
 });
 it("an explicit environment argument cannot enable a refused process route",async()=>{
  vi.stubEnv("JOBGUARD_ENV","production");
  await expect(new CommercialIntegrityV3Application({} as never,"synthetic_demo").family(session,job)).rejects.toMatchObject({code:"SYNTHETIC_MODE_REQUIRED"});
  vi.stubEnv("JOBGUARD_ENV","synthetic_demo");
  await expect(new CommercialIntegrityV3Application({} as never,"production").family(session,job)).rejects.toMatchObject({code:"SYNTHETIC_MODE_REQUIRED"});
  expect(PracticeAccess.prototype.job).not.toHaveBeenCalled();
 });
 it.each(["UNAUTHENTICATED","NOT_FOUND"] as const)("%s precedes schema and repository work, including replay",async code=>{
  vi.mocked(PracticeAccess.prototype.job).mockRejectedValue(new PracticeAccessError(code));
  const read=vi.spyOn(CommercialIntegrityV3Repository.prototype,"read"),review=vi.spyOn(CommercialIntegrityV3Repository.prototype,"review"),family=vi.spyOn(CommercialIntegrityV3Repository.prototype,"readFamily");
  for(const run of [()=>app().family(undefined,job),()=>app().view(undefined,job,{tenantId:"forged"}),()=>app().review(undefined,job,{...input,tenantId:"forged"})])await expect(run()).rejects.toMatchObject({code});
  expect(read).not.toHaveBeenCalled();expect(review).not.toHaveBeenCalled();expect(family).not.toHaveBeenCalled();
 });
 it.each(["tenantId","actor","evaluatedAt","profile","signal","scopeId","settlement","family","__proto__"])("rejects forged %s",async key=>{
  const read=vi.spyOn(CommercialIntegrityV3Repository.prototype,"read"),review=vi.spyOn(CommercialIntegrityV3Repository.prototype,"review");
  await expect(app().view(session,job,{[key]:"forged"})).rejects.toMatchObject({code:"INVALID_INTEGRITY_QUERY"});
  await expect(app().review(session,job,{...input,[key]:"forged"})).rejects.toMatchObject({code:"INVALID_INTEGRITY_REVIEW"});
  expect(read).not.toHaveBeenCalled();expect(review).not.toHaveBeenCalled();
 });
 it("delegates family with server context and canonical IDs",async()=>{
  const family=vi.spyOn(CommercialIntegrityV3Repository.prototype,"readFamily").mockResolvedValue({version:"commercial-integrity-family.v1",environment:"synthetic_demo",jobId:job,family:"v3",realExternalActions:0});
  expect((await app().family(session.toUpperCase(),job.toUpperCase())).family).toBe("v3");
  expect(family.mock.calls[0]?.[0]).toBe(context);
  expect(family).toHaveBeenCalledWith(context,{membershipId:job,identityUserId:session},principal.digest,job);
 });
 it("returns saved sources and feedback without authority metadata or fee fields",async()=>{
  const saved={version:"commercial-integrity-view.v3",advisory:true,result:{findings:[{sourceSnapshot:{exact:"persisted"}}]},feedback:[feedback],availability:["CI-H1"],published:null};
  vi.spyOn(CommercialIntegrityV3Repository.prototype,"read").mockResolvedValue(saved as never);
  const result=await app().view(session,job,{version:"commercial-integrity-query.v3"});
  expect(result.result).toEqual(saved.result);expect(result.realExternalActions).toBe(0);expect(result.decisionRecord.status).toBe("proposed");
  expect(JSON.stringify(result)).not.toMatch(/sessionDigest|identityUserId|membershipId|capPence|planCredit/);
  const review=vi.spyOn(CommercialIntegrityV3Repository.prototype,"review").mockResolvedValue(feedback as never);
  expect(await app().review(session,job,{...input,commandId:job.toUpperCase()})).toMatchObject({commandId:job});
  expect(review.mock.calls[0]?.[4]).toEqual(input);
 });
 it.each(["INTEGRITY_FAMILY_UNAVAILABLE","INTEGRITY_SOURCE_UNAVAILABLE","IDEMPOTENCY_CONFLICT","INTEGRITY_SOURCE_CHANGED","INTEGRITY_RETRY_REQUIRED"] as const)("maps %s identically for read and review",async code=>{
  vi.spyOn(CommercialIntegrityV3Repository.prototype,"read").mockRejectedValue(new CommercialIntegrityPersistenceError(code));
  vi.spyOn(CommercialIntegrityV3Repository.prototype,"review").mockRejectedValue(new CommercialIntegrityPersistenceError(code));
  for(const run of [()=>app().view(session,job,{}),()=>app().review(session,job,input)]) {
   const error=await run().catch(e=>e);expect(integrityV3Failure(error)).toEqual({status:code.includes("UNAVAILABLE")?503:409,body:{code}});
  }
 });
 it("never echoes raw database/provider errors",async()=>{
  vi.spyOn(CommercialIntegrityV3Repository.prototype,"read").mockRejectedValue(new Error("password=secret SQL detail"));
  expect(integrityV3Failure(await app().view(session,job,{}).catch(e=>e))).toEqual({status:503,body:{code:"INTEGRITY_UNAVAILABLE"}});
 });
});
