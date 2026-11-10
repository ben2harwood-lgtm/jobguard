import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config, proxy } from "./proxy";

const portalActions = ["issue", "revoke", "signin", "signout", "read", "messages", "quote", "quote-accept", "stages", "stage-acknowledge", "variations/read", "variation-approvals", "extra-approvals", "practice-pay-now"];
const request = (path: string, cookie?: string, method = "GET") => new NextRequest(`https://jobguard.example.invalid${path}`, {
  method,
  headers: cookie === undefined ? {} : { cookie },
});

describe("Next 16 proxy retains the customer-cookie API boundary", () => {
  it.each(["/api/jobs", "/api/auth/session", "/api/session", "/api/customer-portal/read", "/api/customer-portal/variations/read"])("matches %s", path => {
    // The Next 16 testing helper retains its middleware name.
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: path })).toBe(true);
  });

  it.each(["/", "/jobs", "/customer-portal", "/apiary", "/_next/static/chunk.js"])("does not intercept %s", path => {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig: {}, url: path })).toBe(false);
  });

  it.each(portalActions)("preserves the exact portal exception %s", action => {
    const response = proxy(request(`/api/customer-portal/${action}`, "jobguard_customer=fictional"));
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.has("set-cookie")).toBe(false);
  });

  it.each([
    "/api/jobs", "/api/auth/session", "/api/session", "/api/pay-now-attempts",
    "/api/contractor/site/jobs", "/api/customer-portal",
    "/api/customer-portal/practice-pay-now/", "/api/customer-portal/practice-pay-now/extra",
    "/api/customer-portal/read/", "/api/customer-portal/read/extra",
    "/api/customer-portal/extra-approvals/", "/api/customer-portal/extra-approvals/extra",
    "/api/customer-portal/EXTRA-APPROVALS", "/api/customer-portal/unknown", "/api/customer-portal/READ",
    "/api/customer-portal/variations", "/api/customer-portal/variation-approvals/extra",
  ])("denies customer access to %s even alongside builder cookies", async path => {
    for (const cookie of ["jobguard_customer=fictional", "jobguard_customer=", "jobguard_customer=fictional; jg_session=legacy; jobguard_session=builder"]) {
      for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
        const response = proxy(request(path, cookie, method));
        expect(response.status).toBe(401);
        expect(await response.json()).toEqual({ code: "UNAUTHENTICATED" });
        expect(response.headers.get("cache-control")).toBe("no-store");
        expect(response.headers.has("x-middleware-next")).toBe(false);
        expect(response.headers.has("set-cookie")).toBe(false);
      }
    }
  });

  it.each([undefined, "jg_session=legacy", "jobguard_session=builder"])("leaves builder authentication to the route for %s", cookie => {
    expect(proxy(request("/api/jobs", cookie)).headers.get("x-middleware-next")).toBe("1");
  });
});
