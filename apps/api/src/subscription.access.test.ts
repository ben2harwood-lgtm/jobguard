import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import type { ExecutionContext } from "@nestjs/common";
import { SubscriptionPersistenceError } from "@jobguard/db";
import { ApplicationAuthGuard } from "./auth/application-auth.guard.js";
import { SubscriptionController } from "./subscription.controller.js";
import { subscriptionAuthority, subscriptionHttpStatus } from "./subscription.authority.js";
import type { IdentityApplication } from "./auth/identity.application.js";

const practice = "jg_session=b690f3c7-0d23-4c83-bca2-5f60ce9a0f19";
const contextFor = (request: Record<string, unknown>) => ({ switchToHttp: () => ({ getRequest: () => request }) }) as ExecutionContext;
function identity(context: () => Promise<unknown>) {
  return { context: vi.fn(context), allowedOrigin: "http://127.0.0.1:3000", provider: { digest: (value: string) => `digest(${value})` } } as unknown as IdentityApplication & { context: ReturnType<typeof vi.fn> };
}
describe("MON-2A exact-path subscription access (Ben, 28 Oct)", () => {
  it("a practice cookie never reaches the subscription paths, even in synthetic mode", async () => {
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
    const app = identity(async () => { throw new Error("no real session"); }), guard = new ApplicationAuthGuard(() => app);
    for (const [method, path] of [["GET", "/subscriptions/current"], ["POST", "/subscriptions/commands"]])
      await expect(guard.canActivate(contextFor({ method, path, headers: { cookie: practice } }))).rejects.toMatchObject({ status: 401 });
    vi.unstubAllEnvs();
  });
  it("a real company session with Origin/CSRF is checked first and admitted only on the exact paths", async () => {
    vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
    const app = identity(async () => ({ tenantId: "t" })), guard = new ApplicationAuthGuard(() => app);
    const headers = { cookie: "jobguard_session=real", "x-csrf-token": "csrf", origin: "http://127.0.0.1:3000" };
    expect(await guard.canActivate(contextFor({ method: "POST", path: "/subscriptions/commands", headers }))).toBe(true);
    expect(app.context).toHaveBeenCalledWith(expect.objectContaining({ csrfToken: "csrf", origin: "http://127.0.0.1:3000" }));
    // Other money paths keep refusing real principals, and a wrong method gets no exception.
    for (const [method, path] of [["POST", "/jobs/x/final-check/dispositions"], ["DELETE", "/subscriptions/current"]])
      await expect(guard.canActivate(contextFor({ method, path, headers }))).rejects.toMatchObject({ status: 403 });
    vi.unstubAllEnvs();
  });
  it("the authority passes credentials through and digests only the real session token", async () => {
    const authority = subscriptionAuthority(identity(async () => ({})));
    expect(await authority.resolve({ sessionToken: "real", origin: "o" })).toEqual({ credentials: { sessionToken: "real", origin: "o" }, digest: "digest(session:real)" });
    await expect(authority.resolve({})).rejects.toBeInstanceOf(SubscriptionPersistenceError);
    expect(["INVALID_SUBSCRIPTION_INPUT", "SUBSCRIPTION_FORBIDDEN", "SUBSCRIPTION_PROJECTION_MISMATCH", "SUBSCRIPTION_UNAVAILABLE"].map(subscriptionHttpStatus)).toEqual([400, 403, 409, 503]);
  });
  it("the controller forwards exact credentials and refuses a malformed envelope before the application", async () => {
    const application = { read: vi.fn(async () => ({ version: "subscription-persisted-read.v1" })), command: vi.fn(async () => ({ ok: true })) };
    const controller = new SubscriptionController(() => application as never, () => identity(async () => ({})));
    const request = { headers: { cookie: "jobguard_session=real", "x-csrf-token": "csrf", origin: "o" } } as never;
    expect(await controller.read(request)).toEqual({ version: "subscription-persisted-read.v1" });
    expect(application.read).toHaveBeenCalledWith(expect.objectContaining({ sessionToken: "real", csrfToken: "csrf", origin: "o" }));
    await expect(controller.command({ version: "nope" }, request)).rejects.toMatchObject({ status: 400 });
    expect(application.command).not.toHaveBeenCalled();
    const id = "00000000-0000-4000-8000-000000000001";
    expect(await controller.command({ version: "subscription-http-command.v1", commandId: id, command: { kind: "x" } }, request)).toEqual({ ok: true });
    expect(application.command).toHaveBeenCalledWith(expect.objectContaining({ sessionToken: "real" }), id, { kind: "x" });
  });
});
