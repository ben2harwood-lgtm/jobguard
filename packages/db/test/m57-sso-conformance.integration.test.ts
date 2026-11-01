/** ENT-10 / M5-7: dark synthetic conformance. PostgreSQL execution belongs to CI. */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { contractorPermissions, contractorPermits, type ContractorRole } from "@jobguard/core";
import { IdentityController } from "../../../apps/api/src/auth/identity.controller.js";
import { SsoController } from "../../../apps/api/src/auth/sso/sso.controller.js";
import { withTenant } from "../src/index.js";
import { canonicalRows, createScimHarness, deactivate, fixture, origin, person, type ScimFixture, type ScimHarness, type ScimPerson } from "./scim-fixtures.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

let h: ScimHarness;
beforeAll(async () => { h = await createScimHarness("jg-m57-conformance-"); }, 120000);
afterAll(async () => { if (h) await h.close(); });
const protectedTables = ["app.decision_resolution", "app.action_authorization", "app.action_outbox", "app.journal", "app.journal_line", "app.evidence_object"];
const protectedRows = () => Promise.all(protectedTables.map(table => canonicalRows(h, table)));
const headers = (p: ScimPerson) => ({ cookie: `jobguard_session=${p.bound.sessionToken}`, origin, "x-csrf-token": p.bound.csrfToken });
async function queued(f: ScimFixture, p: ScimPerson, permission = "statement.read") {
  const context = await h.identityApp.context({ ...p.bound, requestedTenantId: f.principal.tenantId });
  const input = { version: "sso-worker-action.v1", connectionId: f.connectionId, sessionId: p.sessionId, membershipId: p.membershipId, permission, scopeId: f.principal.tenantId };
  await f.app.checkWorkerAction(context, input);
  return { context, input };
}
async function assertion(f: ScimFixture, email: string, subject = randomUUID(), assertionId = `_${randomUUID()}`) {
  const request = await f.app.start(f.connectionId, { version: "sso-start.v1", action: "signin" }, f.ordinary);
  return { request, body: { version: "sso-callback.v1", relayState: request.relayState, SAMLResponse: f.idp.response({ connection: f.connection, requestId: request.requestId, email, subject, assertionId, groups: ["finance"] }) } };
}
async function refusedCallback(f: ScimFixture, r: Awaited<ReturnType<typeof assertion>>, code: string) {
  const controller = new SsoController(() => f.app), cookie = vi.fn(), clearCookie = vi.fn();
  const sessions = await canonicalRows(h, "identity.session"), business = await protectedRows();
  await expect(controller.callback(f.connectionId, r.body, { headers: { origin, cookie: `jobguard_sso_state=${r.request.relayState}` } }, { cookie, clearCookie })).rejects.toMatchObject({ response: { code } });
  expect(cookie).not.toHaveBeenCalled(); expect(clearCookie).not.toHaveBeenCalled();
  expect(await canonicalRows(h, "identity.session")).toEqual(sessions);
  expect(await protectedRows()).toEqual(business);
  // A refused callback cannot manufacture a session for work that bypasses the browser.
  const p = await person(f), work = await queued(f, p);
  await expect(f.app.checkWorkerAction(work.context, { ...work.input, sessionId: randomUUID() })).rejects.toHaveProperty("code", "SSO_FORBIDDEN");
  expect(await protectedRows()).toEqual(business);
}

describe("ENT-10 / M5-7 web and background conformance", () => {
  it("identity collision refuses the web callback without issuing a cookie or worker identity", async () => {
    const f = await fixture(h, true, false); await f.map("finance");
    await refusedCallback(f, await assertion(f, f.email), "LINK_REQUIRED");
  });

  it("domain takeover and cross-tenant linking preserve both tenants' authority", async () => {
    const a = await fixture(h), b = await fixture(h);
    const tables = ["identity.verified_domain", "identity.sso_subject", "identity.sso_session_binding", "app.role_grant"];
    const before = await Promise.all(tables.map(table => canonicalRows(h, table)));
    const controller = new SsoController(() => b.app), cookie = vi.fn(), clearCookie = vi.fn();
    const request = { headers: { cookie: `jobguard_session=${b.ordinary.sessionToken}`, origin, "x-csrf-token": b.ordinary.csrfToken } };
    await expect(controller.start(b.connectionId, { version: "sso-admin.v1", action: "domain.verify", requested_tenant_id: b.principal.tenantId, connectionId: b.connectionId, domain: a.domain, proof: `synthetic-domain:${b.connectionId}:${a.domain}` }, request, { cookie, clearCookie })).rejects.toMatchObject({ response: { code: "DOMAIN_CLAIMED" } });
    await expect(controller.start(a.connectionId, { version: "sso-start.v1", action: "signin", linkExisting: true }, request, { cookie, clearCookie })).rejects.toMatchObject({ response: { code: "SSO_FORBIDDEN" } });
    expect(cookie).not.toHaveBeenCalled();
    expect(await Promise.all(tables.map(table => canonicalRows(h, table)))).toEqual(before);
    const p = await person(a), work = await queued(a, p);
    await expect(a.app.checkWorkerAction(testTenantContext(b.principal.tenantId), work.input)).rejects.toHaveProperty("code", "SSO_FORBIDDEN");
    await expect(a.app.checkWorkerAction(work.context, { ...work.input, connectionId: b.connectionId, membershipId: b.principal.membershipId })).rejects.toHaveProperty("code", "SSO_FORBIDDEN");
  });

  it("assertion replay against a fresh request cannot mint another web or background identity", async () => {
    const f = await fixture(h); await f.map("finance");
    const subject = randomUUID(), email = `${subject}@${f.domain}`, assertionId = `_${randomUUID()}`;
    const first = await assertion(f, email, subject, assertionId);
    await f.app.callback(f.connectionId, first.body, first.request.relayState);
    const used = await canonicalRows(h, "identity.sso_assertion_use");
    await refusedCallback(f, await assertion(f, email, subject, assertionId), "ASSERTION_REPLAY");
    // The helper's positive-control person signs in once with a different assertion.
    expect((await canonicalRows(h, "identity.sso_assertion_use")).filter(row => used.includes(row))).toEqual(used);
  });

  for (const scenario of ["membership revocation", "role downgrade", "SCIM deactivation"] as const) {
    it(`${scenario} invalidates a cached web session and already queued background authority`, async () => {
      const f = await fixture(h), p = await person(f), work = await queued(f, p);
      const web = new IdentityController(() => h.identityApp);
      expect((await web.session({ headers: headers(p) })).memberships.map(m => m.tenantId)).toContain(f.principal.tenantId);
      const before = await protectedRows();
      if (scenario === "membership revocation") {
        const view = await f.contractor.query(f.principal, { version: "contractor-query.v1", tenantId: f.principal.tenantId, resource: "organisation" });
        await f.contractor.command(f.principal, { version: "contractor-command.v1", environment: "synthetic_demo", commandId: randomUUID(), id: randomUUID(), expectedRevision: view.revision, kind: "membership.revoke", membershipId: p.membershipId });
      } else if (scenario === "role downgrade") {
        await f.app.admin({ version: "sso-admin.v1", action: "mapping.set", requested_tenant_id: f.principal.tenantId, connectionId: f.connectionId, group: "finance", role: "read_only", scope: { kind: "tenant", id: f.principal.tenantId }, enabled: true, expectedRevision: 1 }, f.ordinary);
        const lower = await f.signin(p.email, p.subject, false, ["finance"]);
        const context = await h.identityApp.context({ ...lower, requestedTenantId: f.principal.tenantId });
        const principal = (await h.provider.authenticate(lower.sessionToken))!;
        await f.app.checkWorkerAction(context, { ...work.input, sessionId: principal.sessionId, permission: "job.read" });
        await expect(f.app.checkWorkerAction(context, { ...work.input, sessionId: principal.sessionId })).rejects.toHaveProperty("code", "SSO_FORBIDDEN");
      } else {
        const eventId = randomUUID();
        await deactivate(f, p, eventId);
        const revocations = await canonicalRows(h, "app.contractor_membership_revocation");
        await deactivate(f, p, eventId); // duplicate provider delivery is idempotent
        expect(await canonicalRows(h, "app.contractor_membership_revocation")).toEqual(revocations);
      }
      await expect(web.session({ headers: headers(p) })).rejects.toMatchObject({ response: { code: "UNAUTHENTICATED" } });
      await expect(f.app.checkWorkerAction(work.context, work.input)).rejects.toHaveProperty("code", "SSO_FORBIDDEN");
      expect(await protectedRows()).toEqual(before);
    });
  }

  for (const role of ["admin", "finance", "commercial_manager", "read_only"] as const) {
    it(`${role}: SSO grants match unchanged permission policy, including export and finance boundaries`, async () => {
      const f = await fixture(h), p = await person(f, role), tenantId = f.principal.tenantId;
      const context = await h.identityApp.context({ ...p.bound, requestedTenantId: tenantId });
      const before = await protectedRows();
      for (const permission of contractorPermissions) {
        const expected = contractorPermits([{ role: role as ContractorRole, scope: { kind: "tenant", id: tenantId } }], permission, { tenantId, assigned: false });
        const allowed = (await withTenant(h.runtime, context, db => db.$client.query<{ allowed: boolean }>("SELECT app.contractor_allowed($1,$2,$3) allowed", [p.membershipId, permission, tenantId]))).rows[0]!.allowed;
        expect(allowed, permission).toBe(expected);
        const input = { version: "sso-worker-action.v1", connectionId: f.connectionId, sessionId: p.sessionId, membershipId: p.membershipId, permission, scopeId: tenantId };
        if (expected) await expect(f.app.checkWorkerAction(context, input)).resolves.toBeUndefined();
        else await expect(f.app.checkWorkerAction(context, input)).rejects.toHaveProperty("code", "SSO_FORBIDDEN");
      }
      // Permission checks confer no exact Decision, send, money, or evidence-writing authority.
      expect(await protectedRows()).toEqual(before);
    });
  }
});
