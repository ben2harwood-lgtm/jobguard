import { createHmac } from "node:crypto";
import { customerSigninLink } from "@jobguard/db";
import { customerApprovalMethodV1 } from "@jobguard/core";
import { variationCommandV1 } from "../variation/contracts.js";
import { BadRequestException, type ArgumentsHost } from "@nestjs/common";
import { OidcParseExceptionFilter } from "./sso/oidc.controller.js";
import { CustomerAuthGuard } from "./customer-auth.guard.js";
import { describe, it, expect, vi } from "vitest";
import type { IdentityApplication } from "./identity.application.js";
import { CustomerSigninApplication, CustomerRefused, customerHttp, customerCookieOptions } from "./customer-signin.js";
import { CustomerSigninController } from "./customer-signin.controller.js";
import { ApplicationAuthGuard } from "./application-auth.guard.js";
import type { ExecutionContext } from "@nestjs/common";
import { HttpException } from "@nestjs/common";
import { fileURLToPath } from "node:url";
const routeIdentity = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("../../../web/app/lib/identity-server", () => ({ identityApplication: () => routeIdentity.current }));
// API tests run before this package is built; exercise the real source behind the Next import.
vi.mock("@jobguard/api/identity", () => import("./customer-signin.js"));
const tenant = "10000000-0000-4000-8000-000000000001", job = "20000000-0000-4000-8000-000000000002", customer = "30000000-0000-4000-8000-000000000003";
const scope = { tenantId: tenant, jobId: job, customerId: customer };
const origin = "https://fixture.invalid", cookie = `${tenant}.${job}.${customer}.${"a".repeat(43)}`;
const headers = { origin, cookie: `jobguard_customer=${cookie}` };
function fixture(environment = "synthetic_demo") {
  const query = vi.fn().mockResolvedValue({ rows: [{ result: { version: "customer-session.v1", jobId: job } }] });
  const context = vi.fn().mockResolvedValue({});
  const digest = vi.fn((v: string) => createHmac("sha256", "fictional-test-secret").update(v).digest("hex"));
  const identity = { allowedOrigin: origin, context, provider: { digest, repository: { pool: { query } } } } as unknown as IdentityApplication;
  return { query, context, digest, identity, app: new CustomerSigninApplication(identity, environment) };
}
const request = (body: unknown, h = headers) => new Request(`${origin}/api/customer-portal/read`, { method: "POST", headers: { ...h, "Content-Type": "application/json" }, body: JSON.stringify(body) });
describe("MON-5 customer credential boundary (transport tests; PostgreSQL authority is tested separately)", () => {
  it.each(["production", "pilot_no_charge", "unknown"])("refuses %s before querying", async mode => {
    const f = fixture(mode); await expect(f.app.run("read", { version: "customer-read.v1", jobId: job }, { headers })).rejects.toBeInstanceOf(CustomerRefused); expect(f.query).not.toHaveBeenCalled();
  });
  it.each([undefined, "https://other.invalid"])("refuses absent/foreign Origin %s", async origin => {
    const f = fixture(); await expect(f.app.run("read", { version: "customer-read.v1", jobId: job }, { headers: { ...headers, origin } })).rejects.toBeInstanceOf(CustomerRefused); expect(f.query).not.toHaveBeenCalled();
  });
  it("never enumerates a requested foreign job, accepts tenant overrides or builder cookies as customers", async () => {
    for (const [body, h] of [
      [{ version: "customer-read.v1", jobId: customer }, headers],
      [{ version: "customer-read.v1", jobId: job, tenantId: tenant }, headers],
      [{ version: "customer-read.v1", jobId: job }, { origin, cookie: "jg_session=builder; jobguard_session=builder" }],
      [{ version: "customer-read.v1", jobId: job }, { ...headers, "x-tenant-id": tenant }],
    ] as const) {
      const f = fixture(); await expect(f.app.run("read", body, { headers: h })).rejects.toBeInstanceOf(CustomerRefused); expect(f.query).not.toHaveBeenCalled();
    }
  });
  it("generates the emailed credential on the server, never returns it, and requires builder Origin/CSRF auth", async () => {
    const f = fixture(); f.query.mockResolvedValue({ rows: [{ result: customer }] });
    const result = await f.app.run("issue", { version: "customer-link-issue.v1", ...scope }, { headers: { origin, cookie: "jobguard_session=builder", "x-csrf-token": "csrf" } });
    expect(result).toEqual({ body: { version: "customer-link-issued.v1", grantId: customer } });
    expect(f.context).toHaveBeenCalledWith({ sessionToken: "builder", requestedTenantId: tenant, origin, csrfToken: "csrf" });
    const args = f.query.mock.calls[0]![1] as string[];
    expect(args[5]).toMatch(new RegExp(`^customer-signin-reference\\.v1:${tenant}/${job}/${customer}/[A-Za-z0-9_-]{43}$`));
    const path = customerSigninLink(args[5]!, f.digest);
    expect(f.digest).toHaveBeenCalledWith(`customer-link:${path.split("/").at(-1)}`);
    expect(JSON.stringify(f.query.mock.calls)).not.toContain(path.split("/").at(-1)!);
    expect(JSON.stringify(result)).not.toContain(args[5]!);
  });
  it.each(["issue", "revoke"] as const)("rejects a customer cookie on %s even with builder credentials", async action => {
    const f = fixture(); await expect(f.app.run(action, {}, { headers: { ...headers, cookie: `${headers.cookie}; jobguard_session=builder` } })).rejects.toBeInstanceOf(CustomerRefused); expect(f.context).not.toHaveBeenCalled();
  });
  it("secure cookie has no persistent lifetime; only the HMAC reaches session SQL", async () => {
    const f = fixture();
    const response = await customerHttp(f.app, "signin", request({ version: "customer-signin.v1", ...scope, token: "a".repeat(43) }, { origin, cookie: "" }));
    expect(response.status).toBe(200);
    const set = response.headers.get("set-cookie")!;
    expect(set).toContain("HttpOnly; Secure; SameSite=Strict"); expect(set).not.toMatch(/Max-Age|Expires/iu);
    expect(customerCookieOptions).not.toHaveProperty("maxAge"); expect(customerCookieOptions).not.toHaveProperty("expires");
    expect(await response.json()).toEqual({ version: "customer-signed-in.v1" });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(f.query.mock.calls[0]![0]).toContain("'redeem'");
  });
  it.each(["read", "signin", "signout", "issue", "revoke"] as const)("Nest and Next share the same %s refusal, with no diagnostic or credential leak", async action => {
    const f = fixture(); f.query.mockRejectedValue({ code: "42501", message: "PRIVATE_DIAGNOSTIC" });
    const bodies = { read: { version: "customer-read.v1", jobId: job }, signin: { version: "customer-signin.v1", ...scope, token: "a".repeat(43) }, signout: { version: "customer-signout.v1" }, issue: { version: "customer-link-issue.v1", ...scope }, revoke: { version: "customer-link-revoke.v1", tenantId: tenant, jobId: job, grantId: customer } };
    const h = action === "issue" || action === "revoke" ? { origin, cookie: "jobguard_session=builder" } : headers;
    const response = await customerHttp(f.app, action, request(bodies[action], h));
    expect(response.status).toBe(401); expect(await response.json()).toEqual({ code: "CUSTOMER_REFUSED" });
    const controller = new CustomerSigninController(() => f.app), reply = { cookie: vi.fn(), setHeader: vi.fn() };
    const q = { headers: h }; Object.assign(q, { body: bodies[action] });
    const error = await (async () => {
      if (action === "read") await new CustomerAuthGuard(() => f.app).canActivate({ switchToHttp: () => ({ getRequest: () => q, getResponse: () => reply }) } as ExecutionContext);
      return controller[action](bodies[action], q, reply);
    })().catch(e => e);
    if (!(error instanceof HttpException)) throw error;
    expect(error.getStatus()).toBe(401); expect(error.getResponse()).toEqual({ code: "CUSTOMER_REFUSED" });
    expect(reply.cookie).not.toHaveBeenCalled(); if (action !== "read") expect(reply.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
  });
  it("customer cookies refuse builder paths in both transports before the legacy cookie shortcut", async () => {
    const { middleware } = await import(fileURLToPath(new URL("../../../web/middleware.ts", import.meta.url)));
    for (const builder of ["", "; jg_session=10000000-0000-4000-8000-000000000001; jobguard_session=builder"]) {
      const cookie = `${headers.cookie}${builder}`;
      const response = middleware({ cookies: { has: (name: string) => cookie.includes(`${name}=`) }, nextUrl: new URL(`${origin}/api/jobs`) })!;
      expect(response.status).toBe(401); expect(await response.json()).toEqual({ code: "UNAUTHENTICATED" });
      const guard = new ApplicationAuthGuard(() => { throw new Error("builder authentication must not run"); });
      const context = { switchToHttp: () => ({ getRequest: () => ({ path: "/jobs", method: "GET", headers: { cookie } }) }) } as ExecutionContext;
      await expect(guard.canActivate(context)).rejects.toMatchObject({ status: 401 });
    }
  });
  it.each(["issue", "revoke", "signin", "signout", "read"] as const)("production Next %s adapter preserves the SQL refusal", async action => {
    const f = fixture(); f.query.mockRejectedValue({ code: "42501" }); routeIdentity.current = f.identity;
    const previous = process.env.JOBGUARD_ENV; process.env.JOBGUARD_ENV = "synthetic_demo";
    try {
      const route = await import(fileURLToPath(new URL(`../../../web/app/api/customer-portal/${action}/route.ts`, import.meta.url)));
      const bodies = { issue: {version:"customer-link-issue.v1",...scope}, revoke: {version:"customer-link-revoke.v1",tenantId:tenant,jobId:job,grantId:customer}, signin:{version:"customer-signin.v1",...scope,token:"a".repeat(43)}, signout:{version:"customer-signout.v1"}, read:{version:"customer-read.v1",jobId:job} };
      const h = action === "issue" || action === "revoke" ? {origin,cookie:"jobguard_session=builder"} : headers;
      const result = await route.POST(request(bodies[action],h));
      expect(result.status).toBe(401); expect(await result.json()).toEqual({code:"CUSTOMER_REFUSED"});
      expect(f.query).toHaveBeenCalledOnce(); expect(result.headers.get("cache-control")).toBe("no-store");
    } finally { if(previous===undefined) delete process.env.JOBGUARD_ENV;else process.env.JOBGUARD_ENV=previous; }
  });
  it("malformed JSON gets the same generic refusal before Nest controllers or Next applications", async () => {
    const f=fixture();
    const next=await customerHttp(f.app,"signin",new Request(`${origin}/api/customer-portal/signin`,{method:"POST",headers:{origin,"Content-Type":"application/json"},body:"{"}));
    expect(next.status).toBe(401);expect(await next.json()).toEqual({code:"CUSTOMER_REFUSED"});expect(f.query).not.toHaveBeenCalled();
    const response={setHeader:vi.fn(),status:vi.fn().mockReturnThis(),json:vi.fn()};
    const filter=new OidcParseExceptionFilter(()=>{throw new Error("OIDC must not run");}, {} as never);
    await filter.catch(new BadRequestException(),{switchToHttp:()=>({getRequest:()=>({path:"/customer-portal/signin"}),getResponse:()=>response})} as ArgumentsHost);
    expect(response.status).toHaveBeenCalledWith(401);expect(response.json).toHaveBeenCalledWith({code:"CUSTOMER_REFUSED"});
    expect(response.setHeader).toHaveBeenCalledWith("Cache-Control","no-store");
  });
  it("the customer guard stamps only verified scope and refuses an unguarded controller invocation", async()=>{
    const f=fixture(),q={headers};Object.assign(q,{body:{version:"customer-read.v1",jobId:job}});
    const reply={cookie:vi.fn(),setHeader:vi.fn()},controller=new CustomerSigninController(()=>f.app);
    expect(()=>controller.read({},q,reply)).toThrow();
    await new CustomerAuthGuard(()=>f.app).canActivate({switchToHttp:()=>({getRequest:()=>q,getResponse:()=>reply})} as ExecutionContext);
    expect(controller.read({},q,reply)).toEqual({version:"customer-session.v1",jobId:job});
    expect(Object.getOwnPropertyDescriptor(q,"customerScope")).toMatchObject({writable:false,configurable:false});
  });

  it("names customer_authenticated without enabling a builder commercial approval by label",()=>{
    expect(customerApprovalMethodV1.parse("customer_authenticated")).toBe("customer_authenticated");
    expect(variationCommandV1.safeParse({version:"variation-command.v1",action:"approve",variationId:job,revisionId:job,approvalId:job,method:"customer_authenticated"}).success).toBe(false);
  });

  it("composition outages are redacted identically in Nest and Next",async()=>{
    const unavailable=()=>{throw new Error("private connection configuration");};
    const next=await customerHttp(unavailable,"signin",request({}));
    expect(next.status).toBe(503);expect(await next.json()).toEqual({code:"CUSTOMER_UNAVAILABLE"});
    const controller=new CustomerSigninController(unavailable);
    const error=await controller.signin({}, {headers}, {cookie:vi.fn(),setHeader:vi.fn()}).catch(e=>e);
    if (!(error instanceof HttpException)) throw error;
    expect(error.getStatus()).toBe(503);expect(error.getResponse()).toEqual({code:"CUSTOMER_UNAVAILABLE"});
  });

  it("malformed cookie UUIDs fail before SQL, and issued UUID paths are canonical",async()=>{
    const f=fixture();
    await expect(f.app.run("read",{version:"customer-read.v1",jobId:job},{headers:{...headers,cookie:`jobguard_customer=${"-".repeat(36)}.${job}.${customer}.${"a".repeat(43)}`}})).rejects.toBeInstanceOf(CustomerRefused);
    expect(f.query).not.toHaveBeenCalled();
    await f.app.run("issue",{version:"customer-link-issue.v1",...scope,tenantId:"ABCDEF00-0000-4000-8000-000000000001"},{headers:{origin,cookie:"jobguard_session=builder"}});
    expect(f.query.mock.calls[0]![1][0]).toBe("abcdef00-0000-4000-8000-000000000001");
    expect(f.query.mock.calls[0]![1][5]).toContain(":abcdef00-0000-4000-8000-000000000001/");
  });

});
