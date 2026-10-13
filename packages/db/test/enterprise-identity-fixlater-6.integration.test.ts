/** FIXLATER-6: real PostgreSQL proofs; NOT RUN in the socket-restricted builder sandbox. */
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EnterpriseIdentityRepository, withTenant } from "../src/index.js";
import { resolveVerifiedTenantContext } from "../../../apps/api/src/auth/principal-bridge.js";
import type { TestResponseOptions } from "../../../apps/api/src/auth/sso/test-identity-provider.js";
import { auditRows, canonicalRows, createScimHarness, fixture, origin, sha256,
  type ScimFixture, type ScimHarness } from "./scim-fixtures.js";
import { testTenantContext } from "./tenant-context-test-utils.js";

let h: ScimHarness;
beforeAll(async () => { h = await createScimHarness("jg-fixlater-6-"); });
afterAll(async () => { if (h) await h.close(); });

// Snapshots cover every tenant and ordinary session, distinguishing fixture rows from new success effects.
async function successRows() {
  const result: Record<string, string[]> = {};
  for (const table of ["app.membership", "app.role_grant", "identity.identity_user", "identity.user_email",
    "identity.sso_subject", "identity.sso_assertion_use", "identity.sso_session_binding", "identity.sso_grant", "identity.session"]) {
    result[table] = await canonicalRows(h, table);
  }
  return result;
}
async function refused(f: ScimFixture, work: () => Promise<unknown>, code: string,
  eventType = "sso.refused") {
  const before = await successRows(), auditBefore = await auditRows(h, f.principal.tenantId);
  const bootstrapBefore = await canonicalRows(h, "identity.sso_refusal_event");
  await expect(work()).rejects.toHaveProperty("code", code);
  expect(await successRows()).toEqual(before);
  const events = (await auditRows(h, f.principal.tenantId)).slice(auditBefore.length);
  expect(events.some(e => e.event_type === eventType && e.payload.references.code === code)).toBe(true);
  expect((await canonicalRows(h, "identity.sso_refusal_event")).length).toBe(bootstrapBefore.length + 1);
  const stored = (await h.admin.query("SELECT code FROM identity.sso_refusal_event WHERE route_hash=$1 ORDER BY created_at DESC", [sha256(f.connectionId)])).rows;
  expect(stored[0].code).toBe(code);
}
async function response(f: ScimFixture, overrides: Partial<TestResponseOptions> = {}) {
  const request = await f.app.start(f.connectionId, { version: "sso-start.v1", action: "signin" }, f.ordinary);
  const subject = randomUUID(), email = `${subject}@${f.domain}`, assertionId = `_${randomUUID()}`;
  const payload = { version: "sso-callback.v1", relayState: request.relayState,
    SAMLResponse: f.idp.response({ connection: f.connection, requestId: request.requestId,
      subject, email, assertionId, groups: ["admin"], ...overrides }) };
  return { request, payload, subject, email, assertionId };
}
async function callback(f: ScimFixture, r: Awaited<ReturnType<typeof response>>) {
  return f.app.callback(f.connectionId, r.payload, r.request.relayState);
}
async function freshTwin(f: ScimFixture) {
  const twin = await response(f), result = await callback(f, twin);
  const principal = await h.provider.authenticate(result.sessionToken);
  expect(principal).toBeDefined();
  expect(result.tenantId).toBe(f.principal.tenantId);
  const rows = (await h.admin.query("SELECT request_id FROM identity.sso_assertion_use WHERE tenant_id=$1 AND request_id=$2", [f.principal.tenantId, twin.request.requestId])).rows;
  expect(rows).toEqual([{ request_id: twin.request.requestId }]);
  return twin;
}

const invalidClaims: Array<[string, Partial<TestResponseOptions>]> = [
  ["wrong issuer", { issuer: "urn:fixture:wrong" }], ["wrong audience", { audience: "urn:fixture:wrong" }],
  ["wrong recipient", { recipient: `${origin}/wrong` }], ["unsigned assertion", { signAssertion: false }],
  ["unsigned response", { signResponse: false }], ["both unsigned", { signAssertion: false, signResponse: false }],
  ["expired conditions", { notOnOrAfter: new Date(Date.now() - 60_000).toISOString() }],
  ["missing NotBefore", { notBefore: null }], ["missing NotOnOrAfter", { notOnOrAfter: null }],
  ["missing confirmation request", { confirmationRequestId: null }],
  ["weak assertion signature", { assertionSignatureAlgorithm: "sha1" }],
  ["weak assertion digest", { assertionDigestAlgorithm: "sha1" }],
  ["weak response signature", { responseSignatureAlgorithm: "sha1" }],
  ["weak response digest", { responseDigestAlgorithm: "sha1" }],
];
describe("FIXLATER-6 exact existing refusals", () => {
  it.each(invalidClaims)("F6-SSO-1 F6-A08 F6-A12 F6-A13 callback refusals preserve their exact codes: %s", async (_name, claims) => {
    const f = await fixture(h, true, false), r = await response(f, claims);
    await refused(f, () => callback(f, r), "SAML_REFUSED", "sso.signin.refused");
    await freshTwin(f);
  });
  it("F6-SSO-1 F6-A08 F6-A12 F6-A13 callback refusals preserve their exact codes: browser state", async () => {
    const f = await fixture(h, true, false), r = await response(f);
    await refused(f, () => f.app.callback(f.connectionId, r.payload, "B".repeat(43)), "REQUEST_REFUSED");
    await freshTwin(f);
  });
  it("F6-SSO-1 F6-A08 F6-A12 F6-A13 callback refusals preserve their exact codes: tampered claims", async () => {
    const f = await fixture(h, true, false), r = await response(f);
    const xml = Buffer.from(r.payload.SAMLResponse, "base64").toString();
    expect(xml).toContain(r.email);
    r.payload.SAMLResponse = Buffer.from(xml.replaceAll(r.email, `substituted@${f.domain}`)).toString("base64");
    await refused(f, () => callback(f, r), "SAML_REFUSED", "sso.signin.refused");
    await freshTwin(f);
  });
  it("F6-SSO-1 F6-A08 F6-A12 F6-A13 F6-A14 callback refusals preserve their exact codes: cross connection and unsolicited", async () => {
    const a = await fixture(h, true, false), b = await fixture(h, false, false);
    // Both connections trust the same synthetic signer: routing, audience and request binding must still refuse.
    b.idp = a.idp; b.connection.idpCert = a.idp.idpCert;
    await b.app.admin({ version: "sso-admin.v1", requested_tenant_id: b.principal.tenantId,
      action: "connection.create", id: b.connectionId, idpCert: b.idp.idpCert }, b.ordinary);
    await b.app.admin({ version: "sso-admin.v1", requested_tenant_id: b.principal.tenantId,
      action: "domain.verify", connectionId: b.connectionId, domain: b.domain,
      proof: `synthetic-domain:${b.connectionId}:${b.domain}` }, b.ordinary);
    await b.map("admin");
    const r = await response(a);
    await refused(b, () => b.app.callback(b.connectionId, r.payload, r.request.relayState), "SAML_REFUSED", "sso.signin.refused");
    const borrowed = { ...r.payload, SAMLResponse: b.idp.response({ connection: b.connection,
      requestId: r.request.requestId, email: `${randomUUID()}@${b.domain}`, groups: ["admin"] }) };
    await refused(b, () => b.app.callback(b.connectionId, borrowed, r.request.relayState), "SAML_REFUSED", "sso.signin.refused");
    for (const f of [a, b]) {
      const relayState = "A".repeat(43);
      const payload = { version: "sso-callback.v1", relayState,
        SAMLResponse: f.idp.response({ connection: f.connection, email: `${randomUUID()}@${f.domain}`, groups: ["admin"] }) };
      await refused(f, () => f.app.callback(f.connectionId, payload, relayState), "SAML_REFUSED", "sso.signin.refused");
    }
    await freshTwin(a); await freshTwin(b);
  });
  it("F6-SSO-2 F6-A09 F6-A12 F6-A13 consumed-request replay and assertion replay have distinct exact codes", async () => {
    const f = await fixture(h, true, false), assertionId = `_${randomUUID()}`, subject = randomUUID(), email = `${subject}@${f.domain}`;
    const first = await response(f, { assertionId, subject, email });
    await callback(f, first);
    const used = await canonicalRows(h, "identity.sso_assertion_use", "assertion_id=$1", [assertionId]);
    expect(used).toHaveLength(1);
    await refused(f, () => callback(f, first), "SAML_REFUSED", "sso.signin.refused");
    const second = await response(f, { assertionId, subject, email });
    expect(second.request.requestId).not.toBe(first.request.requestId);
    await refused(f, () => callback(f, second), "ASSERTION_REPLAY", "sso.signin.refused");
    expect(await canonicalRows(h, "identity.sso_assertion_use", "assertion_id=$1", [assertionId])).toEqual(used);
    await freshTwin(f);
  });
  it("F6-SSO-3 F6-A08 F6-A12 F6-A13 F6-A14 account and domain refusals preserve their exact codes", async () => {
    const f = await fixture(h, false, false);
    await f.app.admin({ version: "sso-admin.v1", requested_tenant_id: f.principal.tenantId,
      action: "connection.create", id: f.connectionId, idpCert: f.idp.idpCert }, f.ordinary);
    await f.map("admin");
    const unverified = await response(f);
    await refused(f, () => callback(f, unverified), "DOMAIN_UNVERIFIED", "sso.signin.refused");
    await f.app.admin({ version: "sso-admin.v1", requested_tenant_id: f.principal.tenantId,
      action: "domain.verify", connectionId: f.connectionId, domain: f.domain,
      proof: `synthetic-domain:${f.connectionId}:${f.domain}` }, f.ordinary);
    const other = await fixture(h, true, false);
    await refused(other, () => other.app.admin({ version: "sso-admin.v1", requested_tenant_id: other.principal.tenantId,
      action: "domain.verify", connectionId: other.connectionId, domain: f.domain,
      proof: `synthetic-domain:${other.connectionId}:${f.domain}` }, other.ordinary), "DOMAIN_CLAIMED");
    const collision = await response(f, { email: f.email });
    await refused(f, () => callback(f, collision), "LINK_REQUIRED", "sso.signin.refused");
    await refused(f, () => f.app.start(f.connectionId, { version: "sso-start.v1", action: "signin", linkExisting: true }, other.ordinary), "SSO_FORBIDDEN");
    await freshTwin(f); await freshTwin(other);
  });
  it("F6-SSO-4 F6-A08 F6-A12 F6-A13 stale mappings and revoked memberships preserve their exact codes", async () => {
    const f = await fixture(h, true, false);
    await refused(f, () => f.app.admin({ version: "sso-admin.v1", requested_tenant_id: f.principal.tenantId,
      action: "mapping.set", connectionId: f.connectionId, group: "admin", role: "admin",
      scope: { kind: "tenant", id: f.principal.tenantId }, enabled: true, expectedRevision: 0 }, f.ordinary), "STALE_MAPPING");
    const twin = await freshTwin(f);
    const sub = (await h.admin.query("SELECT membership_id FROM identity.sso_subject WHERE connection_id=$1 AND subject_hash=$2", [f.connectionId, sha256(twin.subject)])).rows[0];
    // Table-owner fixture setup, not application authority to revoke arbitrary membership.
    await h.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [f.principal.tenantId, sub.membership_id]);
    const r = await response(f, { subject: twin.subject, email: twin.email });
    await refused(f, () => callback(f, r), "MEMBERSHIP_REVOKED", "sso.signin.refused");
  });
  it("F6-SSO-4 F6-A08 F6-A12 direct principal bridge preserves its UNAUTHENTICATED revocation code", async () => {
    const f = await fixture(h), credentials = { ...f.bound!, requestedTenantId: f.principal.tenantId };
    await expect(resolveVerifiedTenantContext(f.app.provider, credentials, origin)).resolves.toBeDefined();
    await h.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [f.principal.tenantId, f.principal.membershipId]);
    const before = await successRows();
    await expect(resolveVerifiedTenantContext(f.app.provider, credentials, origin)).rejects.toHaveProperty("code", "UNAUTHENTICATED");
    expect(await successRows()).toEqual(before);
  });
  it.each(["wrong tenant", "wrong connection", "expired session", "revoked session", "downgraded permission", "revoked membership", "revoked covering grant"])(
    "F6-SSO-5 F6-A08 F6-A12 F6-A13 F6-A14 worker refusals preserve SSO_FORBIDDEN across tenant expiry revocation and downgrade: %s", async scenario => {
      const f = await fixture(h, true, false); await f.map("finance");
      const subject = randomUUID(), email = `${subject}@${f.domain}`;
      const bound = await f.signin(email, subject, false, ["finance"]);
      const principal = (await h.provider.authenticate(bound.sessionToken))!;
      const member = (await h.provider.findMembership(principal, f.principal.tenantId))!;
      let context = testTenantContext(f.principal.tenantId);
      const payload = { version: "sso-worker-action.v1", connectionId: f.connectionId,
        sessionId: principal.sessionId, membershipId: member.id, permission: "statement.read", scopeId: f.principal.tenantId };
      await expect(f.app.checkWorkerAction(context, payload)).resolves.toBeUndefined();
      if (scenario === "wrong tenant" || scenario === "wrong connection") {
        const other = await fixture(h, true, false);
        if (scenario === "wrong tenant") context = testTenantContext(other.principal.tenantId);
        else payload.connectionId = other.connectionId;
        await refused(scenario === "wrong connection" ? other : f, () => f.app.checkWorkerAction(context, payload), "SSO_FORBIDDEN");
        return;
      }
      if (scenario === "expired session") await h.admin.query("UPDATE identity.session SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [principal.sessionId]);
      if (scenario === "revoked session") await h.admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1", [principal.sessionId]);
      if (scenario === "revoked membership") await h.admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [f.principal.tenantId, member.id]);
      if (scenario === "revoked covering grant") {
        const grant = (await h.admin.query("SELECT grant_id FROM identity.sso_grant WHERE connection_id=$1", [f.connectionId])).rows[0];
        await h.admin.query("INSERT INTO app.role_grant_revocation(tenant_id,id,grant_id) VALUES($1,$2,$3)", [f.principal.tenantId, randomUUID(), grant.grant_id]);
      }
      if (scenario === "downgraded permission") {
        await f.app.admin({ version: "sso-admin.v1", requested_tenant_id: f.principal.tenantId,
          action: "mapping.set", connectionId: f.connectionId, group: "finance", role: "read_only",
          scope: { kind: "tenant", id: f.principal.tenantId }, enabled: true, expectedRevision: 1 }, f.ordinary);
        const lower = await f.signin(email, subject, false, ["finance"]);
        await refused(f, () => f.app.checkWorkerAction(context, payload), "SSO_FORBIDDEN");
        payload.sessionId = (await h.provider.authenticate(lower.sessionToken))!.sessionId;
        await expect(f.app.checkWorkerAction(context, { ...payload, permission: "job.read" })).resolves.toBeUndefined();
      }
      await refused(f, () => f.app.checkWorkerAction(context, payload), "SSO_FORBIDDEN");
    });

  it("F6-SSO-6 F6-A10 request creation persists the existing ten-minute deadline", async () => {
    const f = await fixture(h, true, false);
    const before = (await h.admin.query("SELECT clock_timestamp()::text value")).rows[0].value;
    const r = await response(f);
    const after = (await h.admin.query("SELECT clock_timestamp()::text value")).rows[0].value;
    const bracket = (await h.admin.query(`SELECT expires_at >= $1::timestamptz + interval '10 minutes' AS lower_ok,
      expires_at <= $2::timestamptz + interval '10 minutes' AS upper_ok, consumed_at IS NULL AS unconsumed
      FROM identity.sso_request WHERE connection_id=$3 AND request_id=$4`, [before, after, f.connectionId, r.request.requestId])).rows;
    expect(bracket).toEqual([{ lower_ok: true, upper_ok: true, unconsumed: true }]);
    const readable = await f.app.repository.transaction(client => f.app.repository.cache(client, f.connectionId).getAsync(r.request.requestId));
    expect(readable).toEqual(expect.any(String));
    await freshTwin(f);
    await expect(callback(f, r)).resolves.toHaveProperty("sessionToken");
  });
  it("F6-SSO-7 F6-A11 F6-A12 F6-A13 an expired database request is unreadable and completion returns REQUEST_REFUSED", async () => {
    const f = await fixture(h, true, false), r = await response(f);
    await freshTwin(f);
    const repository = new EnterpriseIdentityRepository(h.identity);
    const read = () => repository.transaction(client => repository.cache(client, f.connectionId).getAsync(r.request.requestId));
    expect(await read()).toEqual(expect.any(String));
    // Only this fictional request is aged by the administrative pool; no clock or policy is changed.
    await h.admin.query("UPDATE identity.sso_request SET expires_at=clock_timestamp()-interval '1 second' WHERE connection_id=$1 AND request_id=$2", [f.connectionId, r.request.requestId]);
    expect(await read()).toBeNull();
    // Completion normally follows validator consumption; satisfy that separate predicate after proving expiry alone hides the row.
    await h.admin.query("UPDATE identity.sso_request SET consumed_at=clock_timestamp() WHERE connection_id=$1 AND request_id=$2", [f.connectionId, r.request.requestId]);
    const before = await successRows(), auditBefore = await auditRows(h, f.principal.tenantId);
    const claims = { assertionId: r.assertionId, requestId: r.request.requestId, subject: r.subject, email: r.email, groups: ["admin"] };
    const session = { id: randomUUID(), tokenDigest: sha256(randomUUID()), csrfToken: randomUUID(), expiresAt: new Date(Date.now() + 600_000) };
    await expect(repository.transaction(client => repository.complete(client, f.connectionId, claims, session,
      h.provider.digest(`sso-state:${r.request.relayState}`)))).rejects.toHaveProperty("code", "REQUEST_REFUSED");
    expect(await successRows()).toEqual(before);
    expect(await auditRows(h, f.principal.tenantId)).toEqual(auditBefore);
    // The application gets its own expired, unconsumed request, so expiry alone causes its cache refusal.
    const appExpired = await response(f);
    await h.admin.query("UPDATE identity.sso_request SET expires_at=clock_timestamp()-interval '1 second' WHERE connection_id=$1 AND request_id=$2", [f.connectionId, appExpired.request.requestId]);
    await refused(f, () => callback(f, appExpired), "SAML_REFUSED", "sso.signin.refused");
  });

  it("F6-SV2-1 F6-A05 the application login can read commercial tracks but cannot write their binding", async () => {
    const f = await fixture(h, true, false), jobId = randomUUID();
    // Administrative fixture rows supply a real binding; SELECT and denials below use only the runtime login.
    await h.admin.query("INSERT INTO app.job(id,tenant_id,title,status) VALUES($1,$2,'Fictional track fixture','draft')", [jobId, f.principal.tenantId]);
    await h.admin.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'contractor','synthetic_demo','work_order_import')", [f.principal.tenantId, jobId]);
    const before = await canonicalRows(h, "app.job_commercial_track");
    const privileges = (await h.admin.query(`SELECT has_table_privilege('jobguard_runtime','app.job_commercial_track','SELECT') AS readable,
      has_table_privilege('jobguard_runtime','app.job_commercial_track','INSERT') AS ins,
      has_table_privilege('jobguard_runtime','app.job_commercial_track','UPDATE') AS upd,
      has_table_privilege('jobguard_runtime','app.job_commercial_track','DELETE') AS del,
      has_table_privilege('jobguard_runtime','app.job_commercial_track','TRUNCATE') AS trunc`)).rows;
    expect(privileges).toEqual([{ readable: true, ins: false, upd: false, del: false, trunc: false }]);
    const context = testTenantContext(f.principal.tenantId);
    const tracks = await withTenant(h.runtime, context, db => db.$client.query("SELECT tenant_id FROM app.job_commercial_track"));
    expect(tracks.rows.length).toBeGreaterThan(0);
    expect(tracks.rows.every(row => row.tenant_id === f.principal.tenantId)).toBe(true);
    for (const sql of [
      "INSERT INTO app.job_commercial_track SELECT * FROM app.job_commercial_track",
      "UPDATE app.job_commercial_track SET job_track=job_track",
      "DELETE FROM app.job_commercial_track", "TRUNCATE app.job_commercial_track",
    ]) {
      await expect(withTenant(h.runtime, context, db => db.$client.query(sql))).rejects.toHaveProperty("code", "42501");
      expect(await canonicalRows(h, "app.job_commercial_track")).toEqual(before);
    }
  });
  it("F6-SSO-8 F6-A15 runtime cannot execute identity completion or cache routines or write requests", async () => {
    const f = await fixture(h, true, false), r = await response(f), before = await canonicalRows(h, "identity.sso_request");
    const complete = "identity.sso_complete(uuid,jsonb,character,uuid,character,text,timestamptz)";
    const cache = "identity.sso_cache(uuid,text,text,character,uuid,text)";
    const privileges = (await h.admin.query(`SELECT has_function_privilege('jobguard_runtime',$1,'EXECUTE') AS complete,
      has_function_privilege('jobguard_runtime',$2,'EXECUTE') AS cache,
      has_table_privilege('jobguard_runtime','identity.sso_request','INSERT') AS ins,
      has_table_privilege('jobguard_runtime','identity.sso_request','UPDATE') AS upd,
      has_table_privilege('jobguard_runtime','identity.sso_request','DELETE') AS del`, [complete, cache])).rows;
    expect(privileges).toEqual([{ complete: false, cache: false, ins: false, upd: false, del: false }]);
    for (const [sql, values] of [
      ["SELECT identity.sso_cache($1,$2,NULL,NULL,NULL,'get')", [f.connectionId, r.request.requestId]],
      ["SELECT identity.sso_complete($1,'{}'::jsonb,NULL,$2,NULL,NULL,NULL)", [f.connectionId, randomUUID()]],
      ["INSERT INTO identity.sso_request SELECT * FROM identity.sso_request", []],
      ["UPDATE identity.sso_request SET consumed_at=clock_timestamp()", []],
      ["DELETE FROM identity.sso_request", []],
    ] as Array<[string, unknown[]]>) {
      await expect(h.runtime.query(sql, values)).rejects.toHaveProperty("code", "42501");
      expect(await canonicalRows(h, "identity.sso_request")).toEqual(before);
    }
  });
});
