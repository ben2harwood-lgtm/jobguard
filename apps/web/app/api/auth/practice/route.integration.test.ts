import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { NextResponse } from "next/server";
import { cluster, seedHomeOwner, type Cluster } from "../../../../../../packages/db/test/contractor-practice-session-fixtures.js";
import { authenticatePracticeSession, authorizePracticeJob, withTenant } from "@jobguard/db";
const plumbing=vi.hoisted(()=>({jar:new Map<string,string>(),headers:new Headers()}));
vi.mock("server-only",()=>({}));
vi.mock("next/headers",()=>({cookies:async()=>({get:(key:string)=>plumbing.jar.has(key)?{value:plumbing.jar.get(key)!}:undefined}),headers:async()=>plumbing.headers}));
// Actual Next handlers, actual identity application/provider and restricted pools.
// Only Next's request-local cookie/header plumbing is replaced.
import { POST } from "./route";
import { POST as verify } from "../verify/route";
import { POST as signout } from "../signout/route";
import { GET as sessionRoute } from "../../session/route";
import { POST as anonymousEntry } from "../../practice-company/route";
import { identityApplication, closeIdentityApplication } from "../../../lib/identity-server";
import { syntheticWorkspace, closeSyntheticPool } from "../../../lib/synthetic-server";
import { pairingCookie, practicePairReceipt } from "../../../lib/linked-practice-entry";
const origin="https://linked-route.practice.invalid",secret="fictional-linked-route-key-over-32-characters";
const enter={version:"linked-practice-company.v1",action:"enter"},reset={...enter,action:"reset"};
let c:Cluster;
const digest=(token:string)=>createHash("sha256").update(token).digest("hex");
function request(path:string,body:unknown=enter,csrf?:string,from:string|null=origin) {
  plumbing.headers=new Headers({... (csrf?{"x-csrf-token":csrf}:{}),...(from?{origin:from}:{})});
  return new Request(`${origin}${path}`,{method:"POST",headers:plumbing.headers,body:JSON.stringify(body)});
}
function accept(response:NextResponse) {for(const cookie of response.cookies.getAll()) {if(cookie.value)plumbing.jar.set(cookie.name,cookie.value);else plumbing.jar.delete(cookie.name);}}
async function owner(email=`${randomUUID()}@practice.invalid`,purpose:"signup"|"signin"="signup") {
  plumbing.jar.clear();const app=identityApplication();
  const challenge=await app.request({version:"identity-request.v1",email,purpose},randomUUID(),origin);
  const response=await verify(request("/api/auth/verify",{version:"identity-verify.v1",email,purpose,code:challenge.fixtureCode}));
  expect(response.status).toBe(200);accept(response);
  const parent=plumbing.jar.get("jobguard_session")!,session=await app.session(parent);
  const credentials={parent,session,email,csrf:session.csrfToken};
  return credentials;
}
async function entry(o:Awaited<ReturnType<typeof owner>>,body:unknown=enter) {
  return POST(request("/api/auth/practice",body,o.csrf));
}
async function linked(o:Awaited<ReturnType<typeof owner>>) {
  const response=await entry(o);expect(response.status).toBe(200);accept(response);
  const token=plumbing.jar.get("jg_session")!,jar=new Map(plumbing.jar);
  return {token,jar,auth:await authenticatePracticeSession(c.runtime,token)};
}
function use(jar:Map<string,string>) {plumbing.jar=new Map(jar);}
async function job(a:Awaited<ReturnType<typeof linked>>) {
  const id=randomUUID();
  await withTenant(c.runtime,a.auth.context,db=>db.$client.query("SELECT app.create_practice_sandbox_job($1,$2,$3,$4)",[a.auth.context.tenantId,id,a.auth.membershipId,a.auth.digest]));return id;
}
async function noJobs(a:Awaited<ReturnType<typeof linked>>) {
  expect((await c.admin.query("SELECT count(*)::int n FROM app.job WHERE practice_session_digest=$1",[a.auth.digest])).rows[0].n).toBe(0);
}
async function counts() {return (await c.admin.query("SELECT (SELECT count(*) FROM control_plane.practice_session)::int credentials,(SELECT count(*) FROM control_plane.identity_practice_namespace)::int namespaces")).rows[0];}
async function refused(o:Awaited<ReturnType<typeof owner>>,body:unknown=enter,status=401) {
  const before=await counts(),cookies=new Map(plumbing.jar),response=await entry(o,body);
  expect(response.status).toBe(status);expect(response.headers.get("set-cookie")).toBeNull();expect(await counts()).toEqual(before);expect(plumbing.jar).toEqual(cookies);
}
beforeAll(async()=>{
  vi.stubEnv("JOBGUARD_ENV","synthetic_demo");vi.stubEnv("AUTH_CODE_SECRET",secret);vi.stubEnv("AUTH_ALLOWED_ORIGIN",origin);vi.stubEnv("JOBGUARD_ALLOWED_ORIGINS",origin);
  c=await cluster();await seedHomeOwner(c);
  await c.admin.query("ALTER ROLE jobguard_identity LOGIN PASSWORD 'synthetic'");
  vi.stubEnv("IDENTITY_DATABASE_URL",`postgresql://jobguard_identity:synthetic@127.0.0.1:${c.config.port}/jobguard_synthetic_demo`);
  // Actual web composition gets the fixture's restricted runtime login, never admin.
  vi.stubEnv("DATABASE_URL",`postgresql://ent4b_login:synthetic@127.0.0.1:${c.config.port}/jobguard_synthetic_demo`);
},300_000);
afterAll(async()=>{await closeIdentityApplication();await closeSyntheticPool();await c?.close();vi.unstubAllEnvs();});
it("first entry, lost entry reply, retry and second device seed zero jobs and recover one namespace",async()=>{
  const o=await owner(),first=await linked(o);await noJobs(first);
  const lost=await entry(o);expect(lost.status).toBe(200); // Deliberately do not apply Set-Cookie.
  const retry=await linked(o);await noJobs(retry);expect(retry.auth.digest).toBe(first.auth.digest);
  const secondOwner=await owner(o.email,"signin"),second=await linked(secondOwner);await noJobs(second);
  expect(second.token).not.toBe(first.token);expect(second.auth.digest).toBe(first.auth.digest);
  const id=await job(first);await expect(authorizePracticeJob(c.runtime,second.token,id)).resolves.toBeDefined();
  expect((await syntheticWorkspace()).blankCompany).toBe(true);
  await expect(authorizePracticeJob(c.runtime,second.token,id)).resolves.toBeDefined();
});
it("foreign cookies, wrong-parent same-firm credentials and missing/forged receipts cannot show linked jobs",async()=>{
  const o=await owner(),a=await linked(o),id=await job(a),other=await owner(),b=await linked(other);
  const before=await counts();
  for(const cookie of [a.token,b.token]) {
    use(a.jar);plumbing.jar.set("jg_session",cookie);plumbing.jar.set("jobguard_session",other.parent);
    await expect(syntheticWorkspace()).rejects.toThrow("UNAUTHENTICATED");expect((await sessionRoute()).status).toBe(401);
  }
  const device=await owner(o.email,"signin"),second=await linked(device);
  use(a.jar);plumbing.jar.set("jg_session",second.token);await expect(syntheticWorkspace()).rejects.toThrow("UNAUTHENTICATED");expect((await sessionRoute()).status).toBe(401);
  for(const receipt of [undefined,"v1."+"0".repeat(64)]) {use(a.jar);if(receipt)plumbing.jar.set(pairingCookie,receipt);else plumbing.jar.delete(pairingCookie);await expect(syntheticWorkspace()).rejects.toThrow("UNAUTHENTICATED");expect((await sessionRoute()).status).toBe(401);}
  expect(await counts()).toEqual(before);
  await expect(authorizePracticeJob(c.runtime,b.token,id)).rejects.toThrow("NOT_FOUND");
  // Explicit entry replaces unrelated cookies; it cannot adopt the unrelated jobs.
  plumbing.jar.set("jobguard_session",other.parent);plumbing.jar.set("jg_session",a.token);
  const replacement=await linked(other);expect(replacement.auth.digest).toBe(b.auth.digest);await expect(authorizePracticeJob(c.runtime,replacement.token,id)).rejects.toThrow("NOT_FOUND");
});
it.each(["missing","invalid"])("%s identity refuses entry and anonymous fallback without writes",async state=>{
  const o=await owner(),a=await linked(o);use(a.jar);if(state==="missing")plumbing.jar.delete("jobguard_session");else plumbing.jar.set("jobguard_session","invalid");
  await refused(o);await expect(syntheticWorkspace()).rejects.toThrow("UNAUTHENTICATED");expect((await sessionRoute()).status).toBe(401);
  const before=await counts();expect((await anonymousEntry(request("/api/practice-company",{version:"blank-practice-company.v1",action:"start"}))).status).toBe(401);expect(await counts()).toEqual(before);
});
it.each(["expired_parent","revoked_parent","expired_membership","removed_membership","zero_memberships","non_owner","multiple_memberships","expired_credential"])("%s fails live identity/database authority and cannot replace a namespace",async state=>{
  const o=await owner(),a=await linked(o),m=o.session.memberships[0]!,user=o.session.principal.id;
  if(state==="expired_parent")await c.admin.query("UPDATE identity.session SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[o.session.principal.sessionId]);
  if(state==="revoked_parent")await identityApplication().provider.revokeSession(o.parent);
  if(state==="expired_membership")await c.admin.query("UPDATE app.membership SET expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2",[m.tenantId,m.id]);
  if(state==="removed_membership"||state==="zero_memberships")await c.admin.query("DELETE FROM identity.membership_locator WHERE user_id=$1",[user]);
  if(state==="non_owner")await c.admin.query("UPDATE app.membership SET role='foreman' WHERE tenant_id=$1 AND id=$2",[m.tenantId,m.id]);
  if(state==="multiple_memberships") {
    const other=await owner(),n=other.session.memberships[0]!;use(a.jar);
    const account=(await c.admin.query("SELECT account_id FROM app.membership WHERE tenant_id=$1 AND id=$2",[n.tenantId,n.id])).rows[0].account_id;
    const member=randomUUID();await c.admin.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",[n.tenantId,member,account,user]);await c.admin.query("INSERT INTO identity.membership_locator VALUES($1,$2,$3)",[user,n.tenantId,member]);
  }
  if(state==="expired_credential")await c.admin.query("UPDATE control_plane.practice_session SET expires_at=clock_timestamp()-interval '1 second' WHERE token_digest=$1",[digest(a.token)]);
  await expect(authenticatePracticeSession(c.runtime,a.token)).rejects.toThrow("UNAUTHENTICATED");
  await expect(syntheticWorkspace()).rejects.toThrow("UNAUTHENTICATED");expect((await sessionRoute()).status).toBe(401);
  await refused(o,state==="expired_credential"?reset:enter);
});
it.each([[null,"valid"],["https://foreign.invalid","valid"],[origin,"missing"],[origin,"wrong"]])("Origin/CSRF refusal %s %s never mutates",async(from,csrf)=>{
  const o=await owner(),before=await counts();const response=await POST(request("/api/auth/practice",enter,csrf==="valid"?o.csrf:csrf==="missing"?undefined:csrf!,from));
  expect(response.status).toBe(403);expect(response.headers.get("set-cookie")).toBeNull();expect(await counts()).toEqual(before);
});
it("refuses extra command fields before SQL mutation",async()=>{const o=await owner();for(const field of ["tenantId","companyId","credential"])await refused(o,{...enter,[field]:randomUUID()},400);});
it("reset preserves history, refuses stale and other-device reset, and re-entry recovers a lost reset reply",async()=>{
  const o=await owner(),a=await linked(o),id=await job(a),d=await owner(o.email,"signin"),b=await linked(d);
  // Another device's credential paired with this parent is never reset authority.
  plumbing.jar.set("jg_session",a.token);plumbing.jar.set(pairingCookie,practicePairReceipt(d.parent,a.token,secret));await refused(d,reset);
  use(a.jar);const lost=await entry(o,reset);expect(lost.status).toBe(200); // Reply lost, browser keeps old cookie.
  await refused(o,reset);await expect(syntheticWorkspace()).rejects.toThrow("UNAUTHENTICATED");expect((await sessionRoute()).status).toBe(401);
  await expect(authenticatePracticeSession(c.runtime,b.token)).rejects.toThrow("UNAUTHENTICATED");
  const recovered=await linked(o);await noJobs(recovered);expect(recovered.auth.digest).not.toBe(a.auth.digest);
  await expect(authorizePracticeJob(c.runtime,recovered.token,id)).rejects.toThrow("NOT_FOUND");
  expect((await c.admin.query("SELECT practice_session_digest FROM app.job WHERE id=$1",[id])).rows[0].practice_session_digest).toBe(a.auth.digest);
  const success=await entry(o,reset);expect(success.status).toBe(200);accept(success);expect((await syntheticWorkspace()).jobs).toEqual([]);
});
it("sign-out failure retains credentials for retry; successful revocation invalidates a copied credential in SQL",async()=>{
  const o=await owner(),a=await linked(o),before=new Map(plumbing.jar);
  const denied=await signout(request("/api/auth/signout",{},"wrong"));expect(denied.status).toBe(403);expect(denied.headers.get("set-cookie")).toBeNull();expect(plumbing.jar).toEqual(before);
  await expect(authenticatePracticeSession(c.runtime,a.token)).resolves.toBeDefined();
  await c.admin.query("ALTER TABLE identity.security_event RENAME TO unavailable_security_event");
  try {
    const failed=await signout(request("/api/auth/signout",{},o.csrf));expect(failed.status).toBe(503);expect(failed.headers.get("set-cookie")).toBeNull();expect(plumbing.jar).toEqual(before);
    await expect(authenticatePracticeSession(c.runtime,a.token)).resolves.toBeDefined();
  } finally {await c.admin.query("ALTER TABLE identity.unavailable_security_event RENAME TO security_event");}
  const response=await signout(request("/api/auth/signout",{},o.csrf));expect(response.status).toBe(200);accept(response);expect(plumbing.jar.size).toBe(0);
  await expect(authenticatePracticeSession(c.runtime,a.token)).rejects.toThrow("UNAUTHENTICATED");
});
