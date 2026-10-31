import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { IdentityController } from "./identity.controller.js";
import { IdentityApplication } from "./identity.application.js";
import type { PersistedAuthProvider } from "./persisted-auth-provider.js";
import type { IdentityHttpRequest } from "./identity-http.js";

const tenant=randomUUID(), target=randomUUID(), user=randomUUID(), actor=randomUUID();
function fixture() {
  const query=vi.fn().mockResolvedValue({rows:[{result:{version:"member-administration-result.v1",membershipId:target,auditId:randomUUID()}}]});
  const authenticate=vi.fn().mockResolvedValue({identityUserId:user,sessionId:randomUUID(),csrfToken:"fictional-csrf-token-1234567890"});
  const findMembership=vi.fn().mockResolvedValue({id:actor,identityUserId:user,tenantId:tenant,role:"owner"});
  const digest=vi.fn(()=>"a".repeat(64));
  const app=new IdentityApplication({authenticate,findMembership,digest,repository:{pool:{query}}} as unknown as PersistedAuthProvider,"https://jobguard.invalid");
  const controller=new IdentityController(()=>app);
  const request:IdentityHttpRequest={headers:{cookie:"jobguard_session=fictional-session-token-1234567890","x-csrf-token":"fictional-csrf-token-1234567890",origin:"https://jobguard.invalid"}};
  const body={version:"member-administration.v1",action:"remove",requested_tenant_id:tenant,membershipId:target};
  return {query,authenticate,findMembership,digest,controller,request,body};
}
it("passes only a session digest, selected tenant and target to identity SQL for both commands",async()=>{
  const f=fixture();
  await expect(f.controller.administerMember(f.body,f.request)).resolves.toHaveProperty("membershipId",target);
  expect(f.digest).toHaveBeenCalledWith("session:fictional-session-token-1234567890");
  expect(f.query).toHaveBeenLastCalledWith("SELECT identity.member_remove($1,$2,$3) result",["a".repeat(64),tenant,target]);
  await f.controller.administerMember({...f.body,action:"change_role",role:"finance"},f.request);
  expect(f.query).toHaveBeenLastCalledWith("SELECT identity.member_change_role($1,$2,$3,$4) result",["a".repeat(64),tenant,target,"finance"]);
});
it.each(["missing cookie","bad origin","bad csrf","wrong tenant header","invalid session","removed membership"])("refuses %s before mutation",async kind=>{
  const f=fixture();
  if(kind==="missing cookie")delete f.request.headers.cookie;
  if(kind==="bad origin")f.request.headers.origin="https://other.invalid";
  if(kind==="bad csrf")f.request.headers["x-csrf-token"]="forged";
  if(kind==="wrong tenant header")f.request.headers["x-tenant-id"]=randomUUID();
  if(kind==="invalid session")f.authenticate.mockResolvedValue(undefined);
  if(kind==="removed membership")f.findMembership.mockResolvedValue(undefined);
  await expect(f.controller.administerMember(f.body,f.request)).rejects.toHaveProperty("status");
  expect(f.query).not.toHaveBeenCalled();
});
it("refuses role/actor injection, owner creation and invalid action-specific bodies",async()=>{
  const f=fixture();
  for(const body of [{...f.body,actorMembershipId:actor},{...f.body,role:"finance"},
    {...f.body,action:"change_role"},{...f.body,action:"change_role",role:"owner"}]) {
    await expect(f.controller.administerMember(body,f.request)).rejects.toMatchObject({status:400});
  }
  expect(f.query).not.toHaveBeenCalled();
});
it("maps live database owner/last-owner refusal without exposing database details",async()=>{
  const f=fixture();f.query.mockRejectedValue(Object.assign(new Error("MEMBER_ADMIN_REFUSED"),{code:"42501"}));
  await expect(f.controller.administerMember(f.body,f.request)).rejects.toMatchObject({status:403,response:{code:"TENANT_FORBIDDEN"}});
});
