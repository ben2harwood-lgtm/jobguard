import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { AuthError, MemoryAuthProvider, rolePermits } from "./auth-provider.js";
import { resolveVerifiedTenantContext } from "./principal-bridge.js";
import { TenantAuthGuard } from "./tenant-auth.guard.js";
import type { ExecutionContext } from "@nestjs/common";

const EMAIL = "builder@example.test";
const ORIGIN = "https://jobguard.example.test";

function fixture(now = 1_000_000) {
  const delivered: Array<{ email: string; code: string }> = [];
  let clock = now;
  const provider = new MemoryAuthProvider("fixture-hmac-key-not-a-real-secret", (email, code) => delivered.push({ email, code }), () => clock, () => "12345678");
  return { provider, delivered, advance: (milliseconds: number) => { clock += milliseconds; } };
}

async function signup() {
  const setup = fixture();
  await setup.provider.requestCode({ email: EMAIL, purpose: "signup", ip: "192.0.2.1" });
  const session = await setup.provider.verifyCode(EMAIL, "signup", setup.delivered[0]!.code);
  const membership = setup.provider.fixtureMemberships()[0]!;
  return { ...setup, session, membership };
}

describe("entered-code authentication", () => {
  it("atomically signs up a user as owner of exactly one tenant and issues an opaque session", async () => {
    const { provider, delivered, session } = await signup();
    expect(delivered).toEqual([{ email: EMAIL, code: "12345678" }]);
    expect(provider.fixtureMemberships()).toHaveLength(1);
    expect(provider.fixtureMemberships()[0]).toMatchObject({ email: EMAIL, role: "owner" });
    expect(session.sessionToken).not.toContain("12345678");
    await expect(provider.authenticate(session.sessionToken)).resolves.toMatchObject({ csrfToken: session.csrfToken });
  });

  it("enforces expiry, five attempts, resend cooldown and per-IP throttling", async () => {
    const expired = fixture();
    await expired.provider.requestCode({ email: EMAIL, purpose: "signup", ip: "192.0.2.1" });
    expired.advance(600_000);
    await expect(expired.provider.verifyCode(EMAIL, "signup", "12345678")).rejects.toMatchObject({ code: "INVALID_CODE" });

    const attempts = fixture();
    await attempts.provider.requestCode({ email: EMAIL, purpose: "signup", ip: "192.0.2.1" });
    for (let count = 0; count < 5; count += 1) await expect(attempts.provider.verifyCode(EMAIL, "signup", "00000000")).rejects.toBeInstanceOf(AuthError);
    await expect(attempts.provider.verifyCode(EMAIL, "signup", "12345678")).rejects.toMatchObject({ code: "INVALID_CODE" });
    await expect(attempts.provider.requestCode({ email: EMAIL, purpose: "signup", ip: "192.0.2.1" })).rejects.toMatchObject({ code: "RATE_LIMITED" });

    const throttle = fixture();
    for (let count = 0; count < 10; count += 1) {
      await throttle.provider.requestCode({ email: `user${count}@example.test`, purpose: "signup", ip: "192.0.2.9" });
    }
    await expect(throttle.provider.requestCode({ email: "eleven@example.test", purpose: "signup", ip: "192.0.2.9" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("consumes a code only once under concurrent submission", async () => {
    const setup = fixture();
    await setup.provider.requestCode({ email: EMAIL, purpose: "signup", ip: "192.0.2.1" });
    const results = await Promise.allSettled([
      setup.provider.verifyCode(EMAIL, "signup", "12345678"),
      setup.provider.verifyCode(EMAIL, "signup", "12345678"),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(setup.provider.fixtureMemberships()).toHaveLength(1);
  });

  it("binds invitations to their intended email, tenant and non-client-selected role", async () => {
    const setup = fixture();
    const tenantId = "10000000-0000-4000-8000-000000000001";
    setup.provider.invite("invitee@example.test", tenantId, "foreman");
    await setup.provider.requestCode({ email: "attacker@example.test", purpose: "invitation", ip: "192.0.2.1" });
    await expect(setup.provider.verifyCode("attacker@example.test", "invitation", "12345678")).rejects.toMatchObject({ code: "INVALID_CODE" });
    await setup.provider.requestCode({ email: "invitee@example.test", purpose: "invitation", ip: "192.0.2.2" });
    await setup.provider.verifyCode("invitee@example.test", "invitation", "12345678");
    expect(setup.provider.fixtureMemberships()[0]).toMatchObject({ tenantId, role: "foreman", email: "invitee@example.test" });
  });
});

describe("principal to tenant bridge", () => {
  it("rejects unauthenticated, wrong-tenant, conflicting-header, bad-CSRF and bad-origin requests", async () => {
    const { provider, session, membership } = await signup();
    const base = { sessionToken: session.sessionToken, csrfToken: session.csrfToken, origin: ORIGIN };
    await expect(resolveVerifiedTenantContext(provider, { requestedTenantId: membership.tenantId, origin: ORIGIN }, ORIGIN)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(resolveVerifiedTenantContext(provider, { ...base, requestedTenantId: "20000000-0000-4000-8000-000000000002" }, ORIGIN)).rejects.toMatchObject({ code: "TENANT_FORBIDDEN" });
    await expect(resolveVerifiedTenantContext(provider, { ...base, requestedTenantId: membership.tenantId, tenantHeader: "20000000-0000-4000-8000-000000000002" }, ORIGIN)).rejects.toMatchObject({ code: "TENANT_FORBIDDEN" });
    await expect(resolveVerifiedTenantContext(provider, { ...base, csrfToken: "wrong-csrf-token-000000000", requestedTenantId: membership.tenantId }, ORIGIN)).rejects.toMatchObject({ code: "ORIGIN_FORBIDDEN" });
    await expect(resolveVerifiedTenantContext(provider, { ...base, origin: "https://evil.example", requestedTenantId: membership.tenantId }, ORIGIN)).rejects.toMatchObject({ code: "ORIGIN_FORBIDDEN" });
  });

  it("derives context only from a current verified membership and rejects it after revocation", async () => {
    const { provider, session, membership } = await signup();
    const request = { sessionToken: session.sessionToken, csrfToken: session.csrfToken, origin: ORIGIN, requestedTenantId: membership.tenantId };
    await expect(resolveVerifiedTenantContext(provider, request, ORIGIN)).resolves.toEqual({ tenantId: membership.tenantId });
    provider.revoke(membership.id);
    await expect(resolveVerifiedTenantContext(provider, request, ORIGIN)).rejects.toMatchObject({ code: "TENANT_FORBIDDEN" });
  });

  it("keeps the db context constructor call confined to the principal bridge", async () => {
    const authDirectory = new URL(".", import.meta.url);
    const files = (await readdir(authDirectory)).filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"));
    const callers: string[] = [];
    for (const file of files) {
      const source = await readFile(join(authDirectory.pathname, file), "utf8");
      if (source.includes("verifiedTenantContextFromMembership")) callers.push(file);
    }
    expect(callers).toEqual(["principal-bridge.ts"]);
  });

  it("makes the Nest guard reject a bypassed web route without a session", async () => {
    const { provider, membership } = await signup();
    const request = { headers: { origin: ORIGIN, "x-tenant-id": membership.tenantId } };
    const context = { switchToHttp: () => ({ getRequest: () => request }) } as ExecutionContext;
    await expect(new TenantAuthGuard(provider, ORIGIN).canActivate(context)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});

describe("deny-by-default permission matrix", () => {
  it("keeps operative and finance authority explicit", () => {
    expect(rolePermits("operative", "job:update")).toBe(true);
    expect(rolePermits("operative", "commercial:approve")).toBe(false);
    expect(rolePermits("operative", "tenant:administer")).toBe(false);
    expect(rolePermits("finance", "finance:approve")).toBe(true);
    expect(rolePermits("foreman", "finance:approve")).toBe(false);
    expect(rolePermits("read_only", "quote:edit")).toBe(false);
  });
});
