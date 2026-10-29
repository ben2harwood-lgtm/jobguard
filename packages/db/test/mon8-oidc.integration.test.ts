import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { oidcFixture, createScimHarness, canonicalRows } from "./oidc-fixtures.js";
import { sha256 } from "./scim-fixtures.js";

let h: Awaited<ReturnType<typeof createScimHarness>>;
beforeAll(async () => { h = await createScimHarness("jg-mon8-oidc-"); }, 120000);
afterAll(async () => { if (h) await h.close(); });

const effects = () => Promise.all([
  "identity.session", "identity.sso_session_binding", "identity.sso_subject",
  "identity.sso_assertion_use", "identity.oidc_assertion_use", "identity.security_event",
  "app.membership", "app.role_grant", "app.role_grant_revocation",
].map(table => canonicalRows(h, table)));

it("0353 retains OIDC replay records for successful and no-mapped-grant sign-ins", async () => {
  expect((await h.admin.query("SELECT migration_name FROM public.jobguard_schema_migration WHERE migration_name='0353_contractor_feature_guards.sql'")).rowCount).toBe(1);
  const f = await oidcFixture(h);
  for (const groups of [["admin"], []]) {
    f.issuer.claims.groups = groups;
    const started = await f.start();
    if (groups.length) expect(await f.callback(started)).toHaveProperty("sessionToken");
    else await expect(f.callback(started)).rejects.toMatchObject({ code: "OIDC_REFUSED" });
    const state = new URL(started.callback).searchParams.get("state")!;
    const assertion = `oidc_${f.connectionId.replaceAll("-", "_")}_${state}`;
    expect((await h.admin.query("SELECT assertion_id,request_id FROM identity.oidc_assertion_use WHERE connection_id=$1 AND assertion_id=$2", [f.connectionId, assertion])).rows)
      .toEqual([{ assertion_id: assertion, request_id: assertion }]);
    expect((await h.admin.query("SELECT * FROM identity.sso_assertion_use WHERE connection_id=$1", [f.connectionId])).rows).toEqual([]);
    // Call the installed lower-level routine directly so an earlier one-use OIDC
    // request check cannot mask a missing sso_complete replay guard.
    for (const assertionId of [assertion, `different_${randomUUID()}`]) {
      const before = await effects();
      await expect(f.repository.transaction(client => client.query(
        "SELECT identity.sso_complete($1,$2::jsonb,$3,$4,$5,$6,clock_timestamp()+interval '5 minutes')",
        [f.connectionId, JSON.stringify({ assertionId, requestId: assertion,
          subjectHash: sha256(String(f.issuer.claims.sub)), emailHash: sha256(String(f.issuer.claims.email)),
          email: f.issuer.claims.email, groups }), sha256(String(f.issuer.claims.email)),
        randomUUID(), sha256(randomUUID()), randomUUID()],
      ))).rejects.toMatchObject({ code: "23505", message: "ASSERTION_REPLAY" });
      expect(await effects()).toEqual(before);
    }
  }
});

it("0353 refuses OIDC registration after SSO entitlement loss despite valid admin authority", async () => {
  const f = await oidcFixture(h); // Positive control: the same admin registered OIDC.
  await h.admin.query(`INSERT INTO app.contractor_agreement_status_revision
    (tenant_id,id,assignment_id,revision,status,schema_version,environment,fictional_source)
    SELECT tenant_id,$2,assignment_id,revision+1,'suspended',schema_version,environment,$3
    FROM app.contractor_agreement_status_revision WHERE tenant_id=$1 ORDER BY revision DESC LIMIT 1`,
    [f.principal.tenantId, randomUUID(), `fictional-fixture:${randomUUID()}`]);
  const digest = h.provider.digest(`session:${f.ordinary.sessionToken}`);
  const config = { ...f.config, config: { ...f.config.config, connectionId: randomUUID() } };
  const before = await canonicalRows(h, "identity.sso_connection");
  await expect(f.repository.transaction(async client => {
    await client.query("SELECT set_config('app.tenant_id',$1,true)", [f.principal.tenantId]);
    expect((await client.query("SELECT identity.sso_require_admin($1,$2) actor", [digest, f.principal.tenantId])).rows[0].actor).toBe(f.principal.membershipId);
    await client.query("SELECT identity.oidc_create($1,$2::jsonb)", [digest, JSON.stringify(config)]);
  })).rejects.toMatchObject({ code: "42501", message: "FORBIDDEN" });
  expect(await canonicalRows(h, "identity.sso_connection")).toEqual(before);
});
