import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EnterpriseIdentityRepository, IdentityRepository, SsoRequiredRepository, verifiedTenantContextForQueuedJob } from "@jobguard/db";
import { PersistedAuthProvider } from "../persisted-auth-provider.js";
import { SsoApplication } from "./sso.application.js";
import { SsoRequiredApplication } from "./sso-required.application.js";
import { ScimApplication } from "./scim.application.js";
import { scimBearerFor } from "./scim.contracts.js";

const origin = "https://jobguard.invalid";
afterEach(() => vi.restoreAllMocks());

describe("ENT-10 / M5-7 dark server conformance", () => {
  it("queued identity checks cannot carry money, Decisions, locked-bill or shadow authority", async () => {
    const pool = {} as Pool, repository = new EnterpriseIdentityRepository(pool);
    vi.spyOn(repository, "refusal").mockResolvedValue(undefined);
    const allowed = vi.spyOn(repository, "allowed");
    const base = new PersistedAuthProvider(new IdentityRepository(pool), "s".repeat(40));
    const app = new SsoApplication(base, repository, origin, "synthetic_demo");
    const tenantId = randomUUID(), context = verifiedTenantContextForQueuedJob(tenantId);
    const input = { version: "sso-worker-action.v1", connectionId: randomUUID(), sessionId: randomUUID(), membershipId: randomUUID(), permission: "job.read", scopeId: tenantId };
    for (const patch of [
      { amountPence: 1 }, { allocationPence: 1 }, { decisionId: randomUUID() },
      { finalAccountLockId: randomUUID() }, { shadowSignalId: randomUUID() },
      { permission: "shadow.read" }, { permission: "journal.rewrite" },
    ]) await expect(app.checkWorkerAction(context, { ...input, ...patch })).rejects.toHaveProperty("code", "INVALID_SSO_INPUT");
    expect(allowed).not.toHaveBeenCalled();
  });

  for (const mode of ["pilot_no_charge", "provider_sandbox", "production_billing"] as const) {
    it(`${mode}: sign-in, linking, callback, administration and queued work refuse before identity access`, async () => {
      const query = vi.fn(async () => { throw new Error("identity access must stay dark"); });
      const connect = vi.fn(async () => { throw new Error("identity access must stay dark"); });
      const pool = { query, connect } as unknown as Pool;
      const repository = new EnterpriseIdentityRepository(pool);
      const refusal = vi.spyOn(repository, "refusal").mockResolvedValue(undefined);
      const base = new PersistedAuthProvider(new IdentityRepository(pool), "s".repeat(40));
      const app = new SsoApplication(base, repository, origin, mode);
      const connectionId = randomUUID(), tenantId = randomUUID(), membershipId = randomUUID();
      const context = verifiedTenantContextForQueuedJob(tenantId);
      const credentials = { origin, sessionToken: "t".repeat(43), csrfToken: "c".repeat(32) };
      const calls = [
        () => app.view(tenantId, credentials),
        () => app.admin({ version: "sso-admin.v1", requested_tenant_id: tenantId, action: "domain.verify", connectionId, domain: "fixture.invalid", proof: `synthetic-domain:${connectionId}:fixture.invalid` }, credentials),
        () => app.start(connectionId, { version: "sso-start.v1", action: "signin" }, credentials),
        () => app.start(connectionId, { version: "sso-start.v1", action: "signin", linkExisting: true }, credentials),
        () => app.callback(connectionId, { version: "sso-callback.v1", SAMLResponse: "YQ==", relayState: "r".repeat(43) }, "r".repeat(43)),
        () => app.checkWorkerAction(context, { version: "sso-worker-action.v1", connectionId, sessionId: randomUUID(), membershipId, permission: "data.export", scopeId: tenantId }),
      ];
      for (const call of calls) await expect(call()).rejects.toHaveProperty("code", "SSO_ROUTE_BLOCKED");
      expect(refusal).toHaveBeenCalledTimes(calls.length);
      expect(query).not.toHaveBeenCalled(); expect(connect).not.toHaveBeenCalled();
    });

    it(`${mode}: required-SSO controls and break-glass refuse before mailbox proof or writes`, async () => {
      const pool = {} as Pool;
      const base = new PersistedAuthProvider(new IdentityRepository(pool), "s".repeat(40));
      const mailbox = vi.spyOn(base, "proveEmergencyMailbox");
      const repository = new SsoRequiredRepository(pool);
      const refusal = vi.spyOn(repository, "refusal").mockResolvedValue(undefined);
      const emergency = vi.spyOn(repository, "emergency");
      const command = vi.spyOn(repository, "command");
      const app = new SsoRequiredApplication(base, repository, origin, mode);
      const tenantId = randomUUID();
      for (const call of [
        () => app.view({ version: "sso-required-view.v1", requested_tenant_id: tenantId }, {}),
        () => app.detail({ version: "sso-required-detail-view.v1", requested_tenant_id: tenantId }, {}),
        () => app.command({ version: "sso-required-command.v1", requested_tenant_id: tenantId, required: false, expectedRevision: 0, reason: "Synthetic administrator reason" }, {}),
      ]) await expect(call()).rejects.toHaveProperty("code");
      await expect(app.emergency({ version: "sso-emergency.v2", commandId: randomUUID(), requested_tenant_id: tenantId, email: "owner@fixture.invalid", code: "12345678", reason: "Synthetic IdP outage reason" }, origin)).rejects.toHaveProperty("code", "SSO_EMERGENCY_REFUSED");
      expect(refusal).toHaveBeenCalledTimes(4);
      expect(mailbox).not.toHaveBeenCalled(); expect(emergency).not.toHaveBeenCalled(); expect(command).not.toHaveBeenCalled();
    });

    it(`${mode}: even a correctly bound synthetic SCIM bearer cannot activate provisioning`, async () => {
      const connectionId = randomUUID(), seed = "s".repeat(43);
      const repository = { refusal: vi.fn(async () => undefined), deactivate: vi.fn() };
      const app = new ScimApplication(repository, mode, seed);
      await expect(app.deactivate(connectionId, `Bearer ${scimBearerFor(seed, connectionId)}`, { version: "scim-deactivation.v1", eventId: randomUUID(), subject: "fictional-person", active: false })).rejects.toHaveProperty("code", "SCIM_REFUSED");
      expect(repository.refusal).toHaveBeenCalledWith("scim", "SCIM_ROUTE_BLOCKED");
      expect(repository.deactivate).not.toHaveBeenCalled();
    });
  }
});
