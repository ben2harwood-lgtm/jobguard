/** LATER-B28 PostgreSQL proofs. NOT RUN here: dispatcher forbids sockets/PostgreSQL in this sandbox. */
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ActionExecutor, appendOutboundAction, EnterpriseIdentityRepository, withTenant, type OutboundAction, type OutboundAdapter } from "../src/index.js";
import { PersistedAuthProvider } from "../../../apps/api/src/auth/persisted-auth-provider.js";
import { IdentityRepository } from "../src/identity-repository.js";
import { SsoApplication } from "../../../apps/api/src/auth/sso/sso.application.js";
import { createScimHarness, fixture, origin, sha256, type ScimHarness, type ScimFixture } from "./scim-fixtures.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

let h: ScimHarness;
beforeAll(async () => { h = await createScimHarness("jg-later-b28-"); }, 120_000);
afterAll(async () => { if (h) await h.close(); });
afterEach(() => vi.restoreAllMocks());

async function approvedAction(f: ScimFixture) {
  const tenantId = f.principal.tenantId, memberId = f.principal.membershipId;
  const decisionId = randomUUID(), resolutionId = randomUUID(), authorizationId = randomUUID();
  const content = "Fictional owner-approved document", contentHash = sha256(content);
  // Control-role seed of exact synthetic authorization; no runtime grants are introduced.
  await h.admin.query("INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,'quote','fictional-document','send_quote')", [decisionId, tenantId]);
  await h.admin.query("INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'approved',$4)", [resolutionId, tenantId, decisionId, memberId]);
  const expiresAt = new Date(Date.now() + 600_000);
  await h.admin.query("INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,policy_version,expires_at) VALUES($1,$2,$3,$4,$5,'send_quote','customer@fixture.invalid',$6,1,'synthetic.v1',$7)", [authorizationId, tenantId, decisionId, resolutionId, memberId, contentHash, expiresAt]);
  const action: OutboundAction = { version: "outbound-action.v1", id: randomUUID(), authorizationId, adapter: "fake_capture", providerEffectKey: randomUUID(), actionType: "send_quote", recipient: "customer@fixture.invalid", contentHash, immutableContent: content, aggregateRevision: 1, amountPence: null, currency: null, policyVersion: "synthetic.v1", authorizationExpiresAt: expiresAt };
  const context = testTenantContext(tenantId);
  await withTenant(h.runtime, context, db => appendOutboundAction(db, tenantId, action));
  const deliver = vi.fn(async () => ({ kind: "succeeded" as const, providerReference: `synthetic:${randomUUID()}` }));
  const adapter: OutboundAdapter = { name: "fake_capture", supportsProviderDeduplication: false, deliver, reconcile: async () => "unknown" };
  const execute = () => new ActionExecutor(h.runtime, new Map([[adapter.name, adapter]]), { emit: () => undefined }).execute(context, action.id);
  const attempts = async () => (await h.admin.query<{ n: number }>("SELECT count(*)::integer n FROM app.action_attempt WHERE tenant_id=$1 AND action_id=$2", [tenantId, action.id])).rows[0]!.n;
  return { action, deliver, execute, attempts };
}

describe("LATER-B28 actual PostgreSQL boundaries", () => {
  it("FL52 36 hyphens preserves INVALID_SSO_INPUT and records the bootstrap refusal", async () => {
    const before = (await h.admin.query("SELECT count(*)::int n FROM identity.sso_refusal_event")).rows[0].n;
    await expect(h.sso.start("-".repeat(36), {}, {})).rejects.toMatchObject({ code: "INVALID_SSO_INPUT" });
    expect((await h.admin.query("SELECT count(*)::int n FROM identity.sso_refusal_event WHERE route_hash=$1 AND code='INVALID_SSO_INPUT'", [sha256("-".repeat(36))])).rows[0].n).toBeGreaterThan(0);
    expect((await h.admin.query("SELECT count(*)::int n FROM identity.sso_refusal_event")).rows[0].n).toBe(before + 1);
  });
  it("FL63 expiry uses database clock and remains within the existing lifetime at 900 seconds", async () => {
    const f = await fixture(h, true, false);
    const request = await f.app.start(f.connectionId, { version: "sso-start.v1", action: "signin" }, f.ordinary);
    const response = f.idp.response({ connection: f.connection, requestId: request.requestId, subject: randomUUID(), email: `new@${f.domain}`, groups: ["admin"] });
    const before = (await h.admin.query<{ time: Date }>("SELECT clock_timestamp() time")).rows[0]!.time;
    const result = await f.app.callback(f.connectionId, { version: "sso-callback.v1", SAMLResponse: response, relayState: request.relayState }, request.relayState);
    const row = (await h.admin.query<{ expires_at: Date; bounded: boolean }>("SELECT expires_at,expires_at<=clock_timestamp()+interval '900 seconds' bounded FROM identity.session WHERE token_digest=$1", [h.provider.digest(`session:${result.sessionToken}`)])).rows[0]!;
    expect(row.bounded).toBe(true);
    expect(row.expires_at.getTime()).toBeGreaterThanOrEqual(before.getTime() + 900_000 - 1);
  });
  it("FL64 four concurrent link starts do not exhaust the four-client pool", async () => {
    const f = await fixture(h, true, false);
    const login = `b28_${randomUUID().replaceAll("-", "")}`, credential = randomUUID();
    await h.admin.query(`CREATE ROLE ${login} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${credential}'; GRANT jobguard_identity TO ${login}`);
    const pool = new Pool({ ...h.identity.options, user: login, password: credential, max: 4, connectionTimeoutMillis: 3000 });
    try {
      const provider = new PersistedAuthProvider(new IdentityRepository(pool), "s".repeat(40));
      // Use the original digest authority with the bounded pool; no synthetic session is reissued.
      vi.spyOn(provider, "digest").mockImplementation(value => h.provider.digest(value));
      const app = new SsoApplication(provider, new EnterpriseIdentityRepository(pool), origin);
      const results = await Promise.all(Array.from({ length: 4 }, () => app.start(f.connectionId, { version: "sso-start.v1", action: "signin", linkExisting: true }, f.ordinary)));
      expect(new Set(results.map(result => result.requestId)).size).toBe(4);
      expect((await h.admin.query("SELECT count(*)::int n FROM identity.sso_request WHERE tenant_id=$1 AND connection_id=$2 AND link_session_id=$3", [f.principal.tenantId, f.connectionId, f.sessionId])).rows[0].n).toBe(4);
      expect(pool.waitingCount).toBe(0);
    } finally { await pool.end(); }
  });
  it("FL64 contractor revocation during the authentication/write gap refuses without a request", async () => {
    const f = await fixture(h, true, false);
    const original = f.app.provider.authenticate.bind(f.app.provider);
    let authenticated = 0;
    vi.spyOn(f.app.provider, "authenticate").mockImplementation(async value => {
      const principal = await original(value);
      if (++authenticated === 2) {
        const view = await f.contractor.query(f.principal, { version: "contractor-query.v1", resource: "organisation", tenantId: f.principal.tenantId });
        await f.contractor.command(f.principal, { version: "contractor-command.v1", environment: "synthetic_demo", commandId: randomUUID(), id: randomUUID(), expectedRevision: view.revision, kind: "membership.revoke", membershipId: f.principal.membershipId });
      }
      return principal;
    });
    await expect(f.app.start(f.connectionId, { version: "sso-start.v1", action: "signin", linkExisting: true }, f.ordinary)).rejects.toMatchObject({ code: "LINK_FORBIDDEN" });
    expect((await h.admin.query("SELECT count(*)::int n FROM identity.sso_request WHERE tenant_id=$1 AND connection_id=$2", [f.principal.tenantId, f.connectionId])).rows[0].n).toBe(0);
  });
  it("L054 active SSO-linked owner control actually executes an approved action", async () => {
    const f = await fixture(h);
    expect((await h.provider.authenticate(f.bound!.sessionToken))?.identityUserId).toBe(f.principal.identityUserId);
    const queued = await approvedAction(f);
    await queued.execute();
    expect(queued.deliver).toHaveBeenCalledOnce(); expect(await queued.attempts()).toBe(1);
    expect((await h.admin.query("SELECT status FROM app.action_outbox WHERE tenant_id=$1 AND id=$2", [f.principal.tenantId, queued.action.id])).rows[0].status).toBe("succeeded");
  });
  it("M5-7 SSO owner cannot broaden an exact Decision's recipient, document, revision, amount or policy", async () => {
    const f = await fixture(h), queued = await approvedAction(f);
    const context = testTenantContext(f.principal.tenantId);
    const deliver = vi.fn(async () => ({ kind: "succeeded" as const, providerReference: "synthetic:unexpected" }));
    const adapter: OutboundAdapter = { name: "fake_capture", supportsProviderDeduplication: false, deliver, reconcile: async () => "unknown" };
    const executor = new ActionExecutor(h.runtime, new Map([[adapter.name, adapter]]), { emit: () => undefined });
    const content = "Different fictional document";
    const patches: Partial<OutboundAction>[] = [
      { recipient: "other@fixture.invalid" },
      { immutableContent: content, contentHash: sha256(content) },
      { aggregateRevision: queued.action.aggregateRevision + 1 },
      { amountPence: 1, currency: "GBP" },
      { policyVersion: "different.synthetic.v1" },
      { actionType: "send_order" },
    ];
    for (const patch of patches) {
      const action = { ...queued.action, ...patch, id: randomUUID(), providerEffectKey: randomUUID() };
      await withTenant(h.runtime, context, db => appendOutboundAction(db, f.principal.tenantId, action));
      await executor.execute(context, action.id);
      expect(deliver).not.toHaveBeenCalled();
      expect((await h.admin.query("SELECT count(*)::int n FROM app.action_attempt WHERE tenant_id=$1 AND action_id=$2", [f.principal.tenantId, action.id])).rows[0].n).toBe(0);
    }
    // A genuine exact approval still works, once, and another tenant cannot execute it.
    await executor.execute(testTenantContext(randomUUID()), queued.action.id);
    expect(deliver).not.toHaveBeenCalled();
    await queued.execute(); await queued.execute();
    expect(queued.deliver).toHaveBeenCalledOnce(); expect(await queued.attempts()).toBe(1);
  });
  it("M5-7 revoking the exact approval prevents a previously queued SSO owner action", async () => {
    const f = await fixture(h), queued = await approvedAction(f);
    await h.admin.query("UPDATE app.action_authorization SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [f.principal.tenantId, queued.action.authorizationId]);
    await queued.execute();
    expect(queued.deliver).not.toHaveBeenCalled(); expect(await queued.attempts()).toBe(0);
  });
  describe("L054 queued owner after contractor command revocation", () => {
    let observed: { calls: number; attempts: number; status: string };
    // Fixture/command/SQL failures must fail this suite normally.
    beforeAll(async () => {
      const f = await fixture(h), queued = await approvedAction(f);
      const view = await f.contractor.query(f.principal, { version: "contractor-query.v1", resource: "organisation", tenantId: f.principal.tenantId });
      await f.contractor.command(f.principal, { version: "contractor-command.v1", environment: "synthetic_demo", commandId: randomUUID(), id: randomUUID(), expectedRevision: view.revision, kind: "membership.revoke", membershipId: f.principal.membershipId });
      expect((await h.admin.query("SELECT count(*)::int n FROM app.contractor_membership_revocation WHERE tenant_id=$1 AND membership_id=$2", [f.principal.tenantId, f.principal.membershipId])).rows[0].n).toBe(1);
      await queued.execute();
      observed = { calls: queued.deliver.mock.calls.length, attempts: await queued.attempts(), status: (await h.admin.query("SELECT status FROM app.action_outbox WHERE tenant_id=$1 AND id=$2", [f.principal.tenantId, queued.action.id])).rows[0].status };
    });
    it("L054 actually authorised owner is cancelled after the actual SSO revocation mechanism", () => {
      expect(observed).toEqual({ calls: 0, attempts: 0, status: "cancelled" });
    });
  });
});
