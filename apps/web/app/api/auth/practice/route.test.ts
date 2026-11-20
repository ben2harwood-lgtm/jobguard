import { randomUUID } from "node:crypto";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const f = vi.hoisted(()=>({jar:new Map<string,string>(),enter:vi.fn(),session:vi.fn(),pool:{kind:"identity"}}));
vi.mock("server-only",()=>({}));
vi.mock("next/headers",()=>({cookies:async()=>({get:(key:string)=>f.jar.has(key)?{value:f.jar.get(key)!}:undefined})}));
vi.mock("@jobguard/db",async original=>({...await original<typeof import("@jobguard/db")>(),enterLinkedPracticeCompany:f.enter}));
vi.mock("../../../lib/identity-server",()=>({identityApplication:()=>({allowedOrigin:"https://practice.invalid",session:f.session,requireOrigin:(origin:string)=>{if(origin!=="https://practice.invalid")throw new AuthError("ORIGIN_FORBIDDEN");},provider:{repository:{pool:f.pool}}}),
 identityCredentials:async(request:Request)=>({sessionToken:f.jar.get("jobguard_session"),origin:request.headers.get("origin"),csrfToken:request.headers.get("x-csrf-token"),tenantHeader:request.headers.get("x-tenant-id")})}));
import { AuthError } from "@jobguard/api/identity";
import { PracticeAccessError, RequestBindingRefusedError } from "@jobguard/db";
import { pairingCookie, practicePairReceipt } from "../../../lib/linked-practice-entry";
import { POST } from "./route";
const secret="fictional-linked-practice-secret-over-32-characters", parent="fictional-parent", csrf="fictional-csrf";
const command={version:"linked-practice-company.v1",action:"enter"};
const request=(body:unknown=command,origin:string|null="https://practice.invalid",csrfToken:string|null=csrf)=>new Request("https://practice.invalid/api/auth/practice",{method:"POST",headers:{...(origin?{origin}:{}),...(csrfToken?{"x-csrf-token":csrfToken}:{}),"content-type":"application/json"},body:JSON.stringify(body)});
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("JOBGUARD_ENV","synthetic_demo");vi.stubEnv("AUTH_CODE_SECRET",secret);f.jar.clear();f.jar.set("jobguard_session",parent);f.enter.mockResolvedValue(randomUUID());f.session.mockResolvedValue({csrfToken:csrf,memberships:[{role:"owner"}]});});
afterEach(()=>vi.unstubAllEnvs());
it("enters through the identity pool and sets opaque credentials only in HttpOnly cookies after success",async()=>{
  f.jar.set("jg_session",randomUUID());
  const response=await POST(request());
  expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toBe("no-store");
  expect(f.enter).toHaveBeenCalledWith(f.pool,parent,secret,command);
  expect(await response.json()).toEqual({version:"linked-practice-company.v1",ok:true});
  const cookie=response.headers.get("set-cookie")!;
  expect(cookie).toContain("jg_session=");expect(cookie).toContain(`${pairingCookie}=v1.`);expect(cookie).toContain("HttpOnly");expect(cookie).toContain("Secure");expect(cookie).toContain("SameSite=strict");
  for (const name of ["jg_session", pairingCookie]) {
    expect(response.headers.getSetCookie().find(cookie => cookie.startsWith(`${name}=`))).toContain("Max-Age=604740");
  }
});
it("reset supplies only the exact paired browser credential",async()=>{
  const token=randomUUID();f.jar.set("jg_session",token);f.jar.set(pairingCookie,practicePairReceipt(parent,token,secret));
  const reset={...command,action:"reset"};expect((await POST(request(reset))).status).toBe(200);
  expect(f.enter).toHaveBeenCalledWith(f.pool,parent,secret,reset,token);
});
it.each([[null,csrf],["https://foreign.invalid",csrf],["https://practice.invalid",null],["https://practice.invalid","wrong"]])("refuses origin/CSRF %s %s before mutation",async(origin,token)=>{
  expect((await POST(request(command,origin,token))).status).toBe(403);expect(f.enter).not.toHaveBeenCalled();
});
it.each([[],[{role:"foreman"}],[{role:"owner"},{role:"owner"}]])("refuses an ineligible membership set %j",async(...memberships)=>{
  f.session.mockResolvedValue({csrfToken:csrf,memberships});
  expect((await POST(request())).status).toBe(401);expect(f.enter).not.toHaveBeenCalled();
});
it("rejects extra selectors, query input and malformed commands before mutation",async()=>{
  for(const body of [{...command,tenantId:randomUUID()},{...command,credential:randomUUID()},null])expect((await POST(request(body))).status).toBe(400);
  expect(f.enter).not.toHaveBeenCalled();
});
it.each([new PracticeAccessError("UNAUTHENTICATED"),new RequestBindingRefusedError("practice"),new Error("private-storage-error")])("does not set any cookies on refusal or storage failure",async error=>{
  f.enter.mockRejectedValue(error);const response=await POST(request());expect(response.status).toBe(error instanceof Error&&error.message==="private-storage-error"?503:401);expect(response.headers.get("set-cookie")).toBeNull();expect(await response.text()).not.toContain("private-storage-error");
});
it("refuses missing/forged reset pairing without mutation",async()=>{
  f.jar.set("jg_session",randomUUID());for(const receipt of ["","v1."+"a".repeat(64)]){f.jar.set(pairingCookie,receipt);expect((await POST(request({...command,action:"reset"}))).status).toBe(401);}expect(f.enter).not.toHaveBeenCalled();
});
