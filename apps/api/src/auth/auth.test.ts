import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { withTenant, type VerifiedTenantContext } from "@jobguard/db";
import type { Pool } from "pg";
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

  it("freezes every minted context and throws on mutation in strict mode", async () => {
    const { provider, session, membership } = await signup();
    const context = await resolveVerifiedTenantContext(provider, {
      sessionToken: session.sessionToken, csrfToken: session.csrfToken,
      origin: ORIGIN, requestedTenantId: membership.tenantId,
    }, ORIGIN);
    expect(Object.isFrozen(context)).toBe(true);
    // ESM is strict; this mutable view exercises runtime protection rather than TypeScript's readonly check.
    const mutable: { tenantId: string } = context;
    expect(() => { mutable.tenantId = "20000000-0000-4000-8000-000000000002"; }).toThrow(TypeError);
    expect(context.tenantId).toBe(membership.tenantId);
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

  it("forwards the original context through a non-replaceable request getter", async () => {
    const { provider, session, membership } = await signup();
    const request = {
      cookies: { jobguard_session: session.sessionToken },
      headers: { origin: ORIGIN, "x-tenant-id": membership.tenantId, "x-csrf-token": session.csrfToken },
    };
    const execution = { switchToHttp: () => ({ getRequest: () => request }) } as ExecutionContext;
    await expect(new TenantAuthGuard(provider, ORIGIN).canActivate(execution)).resolves.toBe(true);
    const descriptor = Object.getOwnPropertyDescriptor(request, "verifiedTenantContext")!;
    const original = descriptor.get!();
    expect(original).toEqual({ tenantId: membership.tenantId });
    expect(Object.isFrozen(original)).toBe(true);
    expect(descriptor.get!()).toBe(original);
    expect(descriptor.set).toBeUndefined();
    expect(descriptor.configurable).toBe(false);
    expect(() => Object.assign(request, { verifiedTenantContext: { tenantId: "20000000-0000-4000-8000-000000000002" } })).toThrow(TypeError);
    expect(descriptor.get!()).toBe(original);
  });

  it("makes the Nest guard reject a bypassed web route without a session", async () => {
    const { provider, membership } = await signup();
    const request = { headers: { origin: ORIGIN, "x-tenant-id": membership.tenantId } };
    const context = { switchToHttp: () => ({ getRequest: () => request }) } as ExecutionContext;
    await expect(new TenantAuthGuard(provider, ORIGIN).canActivate(context)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("passes the principal bridge's stamped context to the same package module's database boundary", async () => {
    const { provider, session, membership } = await signup();
    const ctx = await resolveVerifiedTenantContext(provider, {
      sessionToken: session.sessionToken, csrfToken: session.csrfToken,
      requestedTenantId: membership.tenantId, origin: ORIGIN,
    }, ORIGIN);
    const query = vi.fn(async (_sql: string, _values?: unknown[]) => ({ rows: [] }));
    const connect = vi.fn(async () => ({ query, release: vi.fn() }));
    await withTenant({ connect } as unknown as Pool, ctx, async () => undefined);
    expect(connect).toHaveBeenCalledOnce();
    expect(query).toHaveBeenCalledWith("SELECT set_config('app.tenant_id', $1, true)", [membership.tenantId]);
  });

  it.each(["O11 Promise.resolve", "R8 Promise.all", "R10 generic patch"])("refuses a substituted context after %s before connecting", async form => {
    const { provider, session, membership } = await signup();
    const context = await resolveVerifiedTenantContext(provider, {
      sessionToken: session.sessionToken, csrfToken: session.csrfToken,
      requestedTenantId: membership.tenantId, origin: ORIGIN,
    }, ORIGIN);
    const tenantId = "20000000-0000-4000-8000-000000000002";
    // This opaque generic signature models R10's imported helper; no context-specific type or mutation is needed.
    const patch = <T extends object>(value: T, change: Partial<T>): T => ({ ...value, ...change });
    let substituted: VerifiedTenantContext;
    if (form === "O11 Promise.resolve") {
      const copy = await Promise.resolve(context);
      substituted = { ...copy, tenantId };
    } else if (form === "R8 Promise.all") {
      const [copy] = await Promise.all([Promise.resolve(context)]);
      substituted = { ...copy, tenantId };
    } else {
      substituted = patch(context, { tenantId });
    }
    expect(substituted.tenantId).toBe(tenantId);
    expect(context.tenantId).toBe(membership.tenantId);
    const connect = vi.fn();
    const work = vi.fn();
    await expect(withTenant({ connect } as unknown as Pool, substituted, work)).rejects.toMatchObject({ code: "INVALID_TENANT_CONTEXT" });
    expect(connect).not.toHaveBeenCalled();
    expect(work).not.toHaveBeenCalled();
  });

  it("allows only the worker to call the queued-system-job context constructor", async () => {
    const root = new URL("../../../../", import.meta.url);
    const callers: string[] = [];
    async function inspect(directory: string): Promise<void> {
      for (const entry of await readdir(join(root.pathname, directory), { withFileTypes: true })) {
        if (["node_modules", "dist", ".next"].includes(entry.name)) continue;
        const path = `${directory}/${entry.name}`;
        if (entry.isDirectory()) await inspect(path);
        else if (/\.(?:[cm]?[jt]s|tsx)$/u.test(entry.name) && !/\.(?:test|spec)\./u.test(entry.name)) {
          // The definition and public re-export are not constructor callers.
          if (["packages/db/src/tenant-context.ts", "packages/db/src/index.ts"].includes(path)) continue;
          if ((await readFile(join(root.pathname, path), "utf8")).includes("verifiedTenantContextForQueuedJob")) callers.push(path);
        }
      }
    }
    for (const directory of ["apps", "packages", "tools"]) await inspect(directory);
    expect(callers.sort()).toEqual(["apps/api/src/worker.ts"]);
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
