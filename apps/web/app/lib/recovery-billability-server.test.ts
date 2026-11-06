import { createHash } from "node:crypto";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
const f = vi.hoisted(() => ({ read: vi.fn(), command: vi.fn(), practice: vi.fn(), session: vi.fn(), context: vi.fn(), jar: new Map<string,string>(), pool: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@jobguard/api/identity", () => ({ resolveVerifiedTenantContext: f.context }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (key:string) => f.jar.has(key) ? { value:f.jar.get(key) } : undefined }) }));
vi.mock("./synthetic-server", () => ({ syntheticPool: f.pool }));
vi.mock("./identity-server", () => ({ identityApplication: () => ({ session:f.session, allowedOrigin:"http://example.invalid", provider:{digest:()=>"identity-digest"} }) }));
vi.mock("@jobguard/db", async () => {
 const { persistedBillabilityCommandV1 } = await import("../../../../packages/db/src/recovery-billability-repository.js");
 return { persistedBillabilityCommandV1, authenticatePracticeSession:f.practice, RecoveryBillabilityRepository:class { read=f.read; command=f.command; } };
});
import { billabilityFailure, recoveryBillabilityRequest } from "./recovery-billability-server";
const priorEnvironment=process.env.JOBGUARD_ENV, priorOrigin=process.env.AUTH_ALLOWED_ORIGIN, priorTrusted=process.env.JOBGUARD_ALLOWED_ORIGINS;
afterAll(()=>{if(priorTrusted===undefined)delete process.env.JOBGUARD_ALLOWED_ORIGINS;else process.env.JOBGUARD_ALLOWED_ORIGINS=priorTrusted;if(priorEnvironment===undefined)delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=priorEnvironment;if(priorOrigin===undefined)delete process.env.AUTH_ALLOWED_ORIGIN;else process.env.AUTH_ALLOWED_ORIGIN=priorOrigin;});
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const body={version:"recovery-billability-command.v1",action:"review",commandId:id(1),caseId:id(2),workId:id(3),lineId:id(4),expectedCaseRevision:2,claimedEligiblePrincipalPence:80000,reasons:"Fictional evidence reviewed"};
const request=(raw:unknown=body, origin="http://example.invalid")=>new Request("http://example.invalid/api/review",{method:"POST",headers:{origin,"x-csrf-token":f.jar.has("jobguard_session") ? "csrf" : createHash("sha256").update("billability-csrf.v1:practice-digest").digest("hex"),"content-type":"application/json"},body:JSON.stringify(raw)});
beforeEach(()=>{
 vi.clearAllMocks();process.env.JOBGUARD_ENV="synthetic_demo";process.env.AUTH_ALLOWED_ORIGIN="http://example.invalid";process.env.JOBGUARD_ALLOWED_ORIGINS="http://example.invalid";
 f.jar.clear();f.jar.set("jg_session","practice-token");
 f.practice.mockResolvedValue({context:{tenantId:id(8)},digest:"practice-digest"});
 f.context.mockResolvedValue({tenantId:id(8)});f.session.mockResolvedValue({csrfToken:"csrf",memberships:[{tenantId:id(8),role:"owner"}]});
 f.read.mockResolvedValue({version:"recovery-billability-view.v1",caseId:id(2),caseRevision:2,lines:[],reviews:[]});f.command.mockResolvedValue({version:"recovery-billability-approval.v1",command:{commandId:id(1)},productionEnabled:false});
});
it("delegates unchanged strict commands using only the authenticated practice context",async()=>{
 await recoveryBillabilityRequest(request(),id(9),id(2));
 expect(f.command).toHaveBeenCalledWith({tenantId:id(8)},id(9),"practice-digest",body);
});
it.each(["lockId","actor","tenant","status","fee"])("refuses injected %s before repository execution",async key=>{
 await expect(recoveryBillabilityRequest(request({...body,[key]:id(7)}),id(9),id(2))).rejects.toThrow("INVALID_BILLABILITY_INPUT");
 expect(f.command).not.toHaveBeenCalled();
});
it("origin and environment gates precede session and source access",async()=>{
 await expect(recoveryBillabilityRequest(request(body,"https://hostile.invalid"),id(9),id(2))).rejects.toThrow("BILLABILITY_NOT_FOUND");
 process.env.JOBGUARD_ENV="pilot_no_charge";
 await expect(recoveryBillabilityRequest(request(),id(9),id(2))).rejects.toThrow("BILLABILITY_NOT_FOUND");
 expect(f.pool).not.toHaveBeenCalled();expect(f.practice).not.toHaveBeenCalled();
});
it.each(["pending cash","ordinary payment","duplicate claim","unapplied credit","prevented spend","manual receipt","builder capture","early disclosure","reversal"])("shows the repository refusal for %s without substituting client facts",async()=>{
 f.command.mockRejectedValue(new Error("BILLABILITY_NOT_APPROVABLE"));
 const error=await recoveryBillabilityRequest(request(),id(9),id(2)).catch(e=>e);
 expect(billabilityFailure(error)).toMatchObject({status:422,code:"BILLABILITY_NOT_APPROVABLE"});
});
it("approval uses the second owner's identity session and never the practice digest",async()=>{
 const {claimedEligiblePrincipalPence:_amount,reasons:_reasons,...base}=body;
 f.jar.set("jobguard_session","second-person-token");
 await recoveryBillabilityRequest(request({...base,action:"approve",reviewCommandId:id(6)}),id(9),id(2));
 expect(f.practice).not.toHaveBeenCalled();
 expect(f.command.mock.calls[0]?.[2]).toBe("identity-digest");
 expect(f.context).toHaveBeenCalledWith(expect.anything(), {sessionToken:"second-person-token",requestedTenantId:id(8),csrfToken:"csrf",origin:"http://example.invalid"}, "http://example.invalid");
});
it.each(["BILLABILITY_FORBIDDEN","BILLABILITY_NOT_FOUND"])("role, self-approval, other tenant and unknown cases share not-found: %s",async code=>{
 f.read.mockRejectedValue(new Error(code));
 const error=await recoveryBillabilityRequest(request(),id(9),id(2)).catch(e=>e);
 expect(billabilityFailure(error)).toEqual({status:404,code:"BILLABILITY_NOT_FOUND",message:"This review is unavailable for this session."});
 expect(f.command).not.toHaveBeenCalled();
});
it("stale revisions remain a typed conflict; exact retry payloads are delegated unchanged",async()=>{
 f.command.mockRejectedValueOnce(new Error("BILLABILITY_STALE"));
 expect(billabilityFailure(await recoveryBillabilityRequest(request(),id(9),id(2)).catch(e=>e))).toMatchObject({status:409,code:"BILLABILITY_STALE"});
 await recoveryBillabilityRequest(request(),id(9),id(2));await recoveryBillabilityRequest(request(),id(9),id(2));
 expect(f.command.mock.calls.map(c=>c[3])).toEqual([body,body,body]);
});

it("requires the browser CSRF header for identity mutations",async()=>{
 f.jar.set("jobguard_session","owner-token");
 f.context.mockImplementation(async (_provider, credentials) => {
  if(credentials.csrfToken !== "csrf") throw new Error("ORIGIN_FORBIDDEN");
  return {tenantId:id(8)};
 });
 const {claimedEligiblePrincipalPence:_amount,reasons:_reasons,...base}=body;
 const req=request({...base,action:"approve",reviewCommandId:id(6)});req.headers.delete("x-csrf-token");
 await expect(recoveryBillabilityRequest(req,id(9),id(2))).rejects.toThrow("ORIGIN_FORBIDDEN");
 expect(f.command).not.toHaveBeenCalled();
});
it("requires a session-bound CSRF token for practice mutations",async()=>{
 const req=request();req.headers.set("x-csrf-token","wrong");
 await expect(recoveryBillabilityRequest(req,id(9),id(2))).rejects.toThrow("ORIGIN_FORBIDDEN");
 expect(f.command).not.toHaveBeenCalled();
});
it("projects stored reviews and command results without reviewer identities or the full source snapshot",async()=>{
 const review={version:"recovery-billability-review.v1",productionEnabled:false,
  command:{commandId:id(1),claimedEligiblePrincipalPence:80000,reasons:"Fictional reason",actorMembershipId:"private-reviewer"},
  snapshot:{caseType:"supplier_overcharge",builderCaptured:false,disclosedBeforeLock:false,privateSource:"private-snapshot"},
  assessment:{classification:"eligible_for_review",exclusions:[]},reviewer:{actorMembershipId:"private-reviewer",identityUserId:"private-reviewer-user"}};
 f.read.mockResolvedValue({version:"recovery-billability-view.v1",caseId:id(2),caseRevision:2,lines:[],reviews:[{workId:id(3),lineId:id(4),review,approved:false}]});
 const view=await recoveryBillabilityRequest(new Request("http://example.invalid/review"),id(9),id(2));
 expect(JSON.stringify(view)).not.toContain("private-");
 f.command.mockResolvedValue(review);
 expect(JSON.stringify(await recoveryBillabilityRequest(request(),id(9),id(2)))).not.toContain("private-");
});

it("takes its origin gate from trusted origins even when AUTH_ALLOWED_ORIGIN differs",async()=>{
 process.env.AUTH_ALLOWED_ORIGIN="https://unused.invalid";
 await recoveryBillabilityRequest(request(),id(9),id(2));
 expect(f.command).toHaveBeenCalledOnce();
});
