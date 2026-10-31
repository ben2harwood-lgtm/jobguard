import type { ExecutionContext } from "@nestjs/common";
import { ApplicationAuthGuard } from "./auth/application-auth.guard.js";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { PrivacyOperationsApplication } from "./privacy-operations.application.js";
import { PrivacyOperationsController } from "./privacy-operations.controller.js";
import type { IdentityApplication } from "./auth/identity.application.js";
import { AuthError } from "./auth/auth-provider.js";
function setup(environment: string | undefined = "synthetic_demo", enabled: string | undefined = "true") {
  const tenant = randomUUID(), user = randomUUID(), member = randomUUID();
  const provider = { authenticate: vi.fn(async () => ({ identityUserId: user, sessionId: randomUUID(), csrfToken: "c".repeat(24) })),
    findMembership: vi.fn(async (_p: unknown, selected: string) => selected === tenant ? { id: member, identityUserId: user, tenantId: tenant, role: "owner", email: "fictional@example.invalid" } : undefined), digest: vi.fn(() => "a".repeat(64)) };
  const identity = { provider, allowedOrigin: "https://fictional.invalid" } as unknown as IdentityApplication;
  const repository = { command: vi.fn(async () => ({ state: "awaiting_instruction" })), read: vi.fn(async () => ({ document: null })) };
  const app = new PrivacyOperationsApplication(identity, repository, () => ({ environment, enabled }));
  const credentials = { sessionToken: "t".repeat(32), tenantHeader: tenant, csrfToken: "c".repeat(24), origin: identity.allowedOrigin };
  return { app, provider, repository, credentials, tenant };
}
describe("dark privacy route", () => {
  it("defaults off and refuses pilot/production even with the flag", async () => {
    for (const [environment, enabled] of [["synthetic_demo", ""], ["synthetic_demo", "false"], ["pilot_no_charge", "true"], ["production_billing", "true"], ["", "true"]]) {
      const f = setup(environment, enabled);
      await expect(f.app.invoke(f.credentials, "command", {})).rejects.toMatchObject({ code: "PRIVACY_DISABLED" });
      expect(f.repository.command).not.toHaveBeenCalled(); expect(f.provider.authenticate).not.toHaveBeenCalled();
    }
  });
  it("uses the verified context and persisted session digest", async () => {
    const f = setup(); await f.app.invoke(f.credentials, "command", { action: "open" });
    expect(f.repository.command).toHaveBeenCalledWith(expect.objectContaining({ tenantId: f.tenant }), "a".repeat(64), { action: "open" });
    expect(f.provider.digest).toHaveBeenCalledWith(`session:${"t".repeat(32)}`);
  });
  it("refuses cross-tenant selection, CSRF, origin and revoked sessions before persistence", async () => {
    for (const patch of [{ tenantHeader: randomUUID() }, { csrfToken: "wrong" }, { origin: "https://foreign.invalid" }, { sessionToken: undefined }]) {
      const f = setup(); await expect(f.app.invoke({ ...f.credentials, ...patch }, "read", {})).rejects.toMatchObject({ code: "PRIVACY_FORBIDDEN" });
      expect(f.repository.read).not.toHaveBeenCalled();
    }
    const f = setup(); f.provider.authenticate.mockRejectedValueOnce(new AuthError("UNAUTHENTICATED"));
    await expect(f.app.invoke(f.credentials, "command", {})).rejects.toMatchObject({ code: "PRIVACY_FORBIDDEN" });
  });
  it("does not admit a practice cookie through the global guard on either privacy path", async () => {
    const context = vi.fn().mockRejectedValue(new AuthError("UNAUTHENTICATED"));
    const guard = new ApplicationAuthGuard(() => ({ context }) as unknown as IdentityApplication);
    for (const path of ["/privacy-rehearsal/commands", "/privacy-rehearsal/read"]) {
      const execution = { switchToHttp: () => ({ getRequest: () => ({ method: "POST", path, headers: { cookie: `jg_session=${randomUUID()}` } }) }) } as unknown as ExecutionContext;
      await expect(guard.canActivate(execution)).rejects.toMatchObject({ status: 401 });
    }
    expect(context).toHaveBeenCalledTimes(2);
  });
  it("returns only a typed error, never database details", async () => {
    const f = setup(); f.repository.read.mockRejectedValueOnce(new Error("secret customer contact"));
    const controller = new PrivacyOperationsController(() => f.app);
    await expect(controller.read({ headers: { cookie: `jobguard_session=${"t".repeat(32)}`, "x-tenant-id": f.tenant, "x-csrf-token": "c".repeat(24), origin: f.credentials.origin } }, {})).rejects.toMatchObject({ response: { version: "privacy-error.v1", code: "PRIVACY_UNAVAILABLE" }, status: 503 });
  });
});
