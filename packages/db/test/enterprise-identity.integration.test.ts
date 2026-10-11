/** ENT-10a actual PostgreSQL acceptance. NOT RUN in the builder sandbox: it cannot start PostgreSQL. */
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ActionExecutor, appendOutboundAction, ContractorRepository, EnterpriseIdentityRepository, IdentityRepository, MIGRATION_URLS, migrate, withTenant, verifyAuditChain, type OutboundAction, type OutboundAdapter, type AuditEvent, type AuthenticatedMembership } from "../src/index.js";
import { PersistedAuthProvider } from "../../../apps/api/src/auth/persisted-auth-provider.js";
import { resolveVerifiedTenantContext } from "../../../apps/api/src/auth/principal-bridge.js";
import { SsoApplication } from "../../../apps/api/src/auth/sso/sso.application.js";
import { generateTestIdentityProvider, type TestResponseOptions } from "../../../apps/api/src/auth/sso/test-identity-provider.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { closeTestPools } from "./pool-test-utils.js";

let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, identity: Pool, directory: string;
let now = Date.now();
const origin = "https://jobguard.invalid", secret = "synthetic-enterprise-identity-key-longer-than-32";
const tables = ["sso_connection", "verified_domain", "idp_group_role_mapping", "sso_request", "sso_assertion_use", "sso_subject", "sso_session_binding", "sso_grant"];
const provider = () => new PersistedAuthProvider(new IdentityRepository(identity), secret, undefined, "synthetic_demo", () => now);
const application = () => new SsoApplication(provider(), new EnterpriseIdentityRepository(identity), origin);
const count = async (table: string, tenantId: string) => (await admin.query<{ n: number }>(`SELECT count(*)::int n FROM ${table} WHERE tenant_id=$1`, [tenantId])).rows[0]!.n;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "jg-ent10a-pg16-"));
  const port = 59000 + Math.floor(Math.random() * 500);
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: "synthetic", persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  const base = { host: "127.0.0.1", port, database: "jobguard_synthetic_demo" };
  const control = new Pool({ ...base, database: "postgres", user: "postgres", password: "synthetic" });
  await control.query("CREATE DATABASE jobguard_synthetic_demo"); await control.end();
  admin = new Pool({ ...base, user: "postgres", password: "synthetic" });
  const names = MIGRATION_URLS.map(url => url.pathname.split("/").at(-1)!);
  const index = names.indexOf("0114_enterprise_identity.sql");
  const identityIndex = names.indexOf("0111_persisted_identity.sql"), previousIndex = names.indexOf("0112_recovery_follow_up.sql");
  expect(identityIndex).toBeGreaterThanOrEqual(0); expect(previousIndex).toBeGreaterThanOrEqual(0);
  expect(index).toBeGreaterThan(identityIndex); expect(index).toBeGreaterThan(previousIndex);
  for (let n = 1; n < names.length; n++) expect(names[n]! > names[n - 1]!).toBe(true);
  await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for (const url of MIGRATION_URLS.slice(0, index)) {
    await admin.query(await readFile(url, "utf8"));
    await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)", [url.pathname.split("/").at(-1)]);
  }
  expect((await admin.query("SELECT to_regclass('identity.sso_connection') AS relation")).rows[0].relation).toBeNull();
  await migrate(admin); await migrate(admin);
  expect((await admin.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(row => row.migration_name)).toEqual(names);
  await admin.query("CREATE ROLE ent10a_identity LOGIN PASSWORD 'identity-fixture' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS INHERIT; GRANT jobguard_identity TO ent10a_identity; CREATE ROLE ent10a_runtime LOGIN PASSWORD 'runtime-fixture' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS INHERIT; GRANT jobguard_runtime TO ent10a_runtime");
  identity = new Pool({ ...base, user: "ent10a_identity", password: "identity-fixture", max: 8 });
  runtime = new Pool({ ...base, user: "ent10a_runtime", password: "runtime-fixture", max: 8 });
}, 120000);
afterAll(async () => { await closeTestPools(identity, runtime, admin); await postgres?.stop(); if (directory) await rm(directory, { recursive: true, force: true }); });

async function fixture(idp = generateTestIdentityProvider()) {
  const contractor = new ContractorRepository(runtime);
  const principal = await contractor.startPractice(randomUUID());
  const sessionToken = randomUUID(), csrfToken = randomUUID(), sessionId = randomUUID();
  const auth = provider();
  const address = `${randomUUID()}@synthetic.invalid`;
  await admin.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)", [address, principal.identityUserId]);
  await admin.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3)", [principal.identityUserId, principal.tenantId, principal.membershipId]);
  await admin.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES($1,$2,'synthetic_demo',$3,$4,$5)", [sessionId, principal.identityUserId, auth.digest(`session:${sessionToken}`), csrfToken, new Date(now + 3600000)]);
  const credentials = { sessionToken, csrfToken, origin, tenantHeader: principal.tenantId };
  const connectionId = randomUUID(), app = application();
  await app.admin({ version: "sso-admin.v1", requested_tenant_id: principal.tenantId, action: "connection.create", id: connectionId, idpCert: idp.idpCert }, credentials);
  const connection = { id: connectionId, tenantId: principal.tenantId, idpEntityId: `urn:jobguard:test-idp:${connectionId}`, spEntityId: `urn:jobguard:sp:${connectionId}`, callbackUrl: `${origin}/api/auth/sso/${connectionId}/callback`, entryPoint: `${origin}/api/auth/sso/${connectionId}/start`, idpCert: idp.idpCert };
  const domain = `${connectionId}.synthetic.invalid`;
  const verify = () => app.admin({ version: "sso-admin.v1", requested_tenant_id: principal.tenantId, action: "domain.verify", connectionId, domain, proof: `synthetic-domain:${connectionId}:${domain}` }, credentials);
  const mapping = (role = "read_only", enabled = true, expectedRevision = 0, group = "site") => app.admin({ version: "sso-admin.v1", requested_tenant_id: principal.tenantId, action: "mapping.set", connectionId, group, role, scope: { kind: "tenant", id: principal.tenantId }, enabled, expectedRevision }, credentials);
  const start = (linkExisting = false, requestCredentials = credentials) => app.start(connectionId, { version: "sso-start.v1", action: "signin", ...(linkExisting ? { linkExisting: true } : {}) }, requestCredentials);
  async function response(options: Partial<TestResponseOptions> = {}, linkExisting = false, requestCredentials = credentials) {
    const request = await start(linkExisting, requestCredentials);
    return { request, payload: { version: "sso-callback.v1", SAMLResponse: idp.response({ connection, requestId: request.requestId, subject: randomUUID(), email: `site@${domain}`, groups: ["site"], ...options }), relayState: request.relayState } };
  }
  const signin = async (options: Partial<TestResponseOptions> = {}) => { const r = await response(options); return app.callback(connectionId, r.payload, r.request.relayState); };
  return { app, principal, credentials, auth, contractor, idp, connection, connectionId, domain, verify, mapping, start, response, signin, address };
}

async function sessionMember(sessionToken: string, tenantId: string) {
  const auth = provider(), principal = (await auth.authenticate(sessionToken))!;
  expect(principal).toBeDefined();
  const member = (await auth.findMembership(principal, tenantId))!;
  expect(member).toBeDefined();
  return { tenantId, membershipId: member.id, identityUserId: principal.identityUserId } as AuthenticatedMembership;
}

async function permitted(member: AuthenticatedMembership, permission: string) {
  return (await withTenant(runtime, testTenantContext(member.tenantId), db => db.$client.query<{ allowed: boolean }>("SELECT app.contractor_allowed($1,$2,$3) allowed", [member.membershipId, permission, member.tenantId]))).rows[0]!.allowed;
}

describe("ENT-10a / actual PostgreSQL identity trust boundary", () => {
  it("catalogs every new tenant key, FORCE RLS, owner and narrow runtime grant", async () => {
    const rows = (await admin.query("SELECT c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='identity' AND c.relname=ANY($1::text[])", [tables])).rows;
    expect(rows).toHaveLength(tables.length);
    expect(rows.every(row => row.relrowsecurity && row.relforcerowsecurity && row.owner === "jobguard_migration")).toBe(true);
    for (const table of tables) {
      const tenant = (await admin.query("SELECT attnotnull FROM pg_attribute WHERE attrelid=$1::regclass AND attname='tenant_id'", [`identity.${table}`])).rows[0];
      expect(tenant?.attnotnull, table).toBe(true);
      expect((await admin.query("SELECT count(*)::int n FROM pg_constraint WHERE conrelid=$1::regclass AND contype='p' AND pg_get_constraintdef(oid) LIKE '%tenant_id%'", [`identity.${table}`])).rows[0].n, table).toBe(1);
      for (const sql of [`SELECT * FROM identity.${table}`, `INSERT INTO identity.${table} DEFAULT VALUES`, `UPDATE identity.${table} SET tenant_id=tenant_id`, `DELETE FROM identity.${table}`, `TRUNCATE identity.${table}`]) {
        await expect(runtime.query(sql)).rejects.toMatchObject({ code: "42501" });
        if (sql.startsWith("SELECT")) expect((await identity.query(sql)).rows).toEqual([]);
        else await expect(identity.query(sql)).rejects.toMatchObject({ code: "42501" });
      }
    }
    const foreignKeys = (await admin.query(`SELECT c.relname,pg_get_constraintdef(f.oid) definition FROM pg_constraint f JOIN pg_class c ON c.oid=f.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_class target ON target.oid=f.confrelid JOIN pg_namespace target_schema ON target_schema.oid=target.relnamespace WHERE f.contype='f' AND n.nspname='identity' AND c.relname=ANY($1::text[]) AND (target_schema.nspname='app' OR (target_schema.nspname='identity' AND target.relname=ANY($1::text[])))`, [tables])).rows;
    expect(foreignKeys.length).toBeGreaterThan(0);
    for (const key of foreignKeys) {
      expect(key.definition, key.relname).toMatch(/^FOREIGN KEY \(tenant_id,/u);
      expect(key.definition, key.relname).toMatch(/REFERENCES (?:identity|app)\.[a-z_]+\(tenant_id,/u);
    }
    expect((await admin.query("SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='identity' AND p.proname LIKE 'sso_%' AND (EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') OR has_function_privilege('jobguard_runtime',p.oid,'EXECUTE'))")).rows[0].n).toBe(0);
    await expect(identity.query("SET ROLE jobguard_migration")).rejects.toMatchObject({ code: "42501" });
    const global = (await admin.query("SELECT c.relrowsecurity,pg_get_userbyid(c.relowner) owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='identity' AND c.relname='sso_refusal_event'")).rows[0];
    expect(global).toEqual({ relrowsecurity: false, owner: "jobguard_migration" });
    for (const sql of ["SELECT * FROM identity.sso_refusal_event", "UPDATE identity.sso_refusal_event SET code=code", "DELETE FROM identity.sso_refusal_event", "TRUNCATE identity.sso_refusal_event"]) {
      await expect(identity.query(sql)).rejects.toMatchObject({ code: "42501" });
      await expect(runtime.query(sql)).rejects.toMatchObject({ code: "42501" });
    }
    expect((await admin.query("SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb FROM pg_roles WHERE rolname='jobguard_identity'")).rows[0]).toEqual({ rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false });
  });

  it("denies omitted, malformed and cross-tenant contexts and tenant-qualified foreign keys", async () => {
    const a = await fixture(), b = await fixture();
    const unscoped = await admin.connect();
    try { await unscoped.query("BEGIN; SET LOCAL ROLE jobguard_migration"); expect((await unscoped.query("SELECT * FROM identity.sso_connection")).rows).toEqual([]); await unscoped.query("ROLLBACK"); } finally { unscoped.release(); }
    expect((await withTenant(admin, testTenantContext(a.principal.tenantId), async db => { await db.$client.query("SET LOCAL ROLE jobguard_migration"); return db.$client.query("SELECT id FROM identity.sso_connection WHERE id=$1", [b.connectionId]); })).rows).toEqual([]);
    const malformed = await admin.connect();
    try {
      await malformed.query("BEGIN; SET LOCAL ROLE jobguard_migration");
      await malformed.query("SELECT set_config('app.tenant_id',$1,true)", ["not-a-uuid"]);
      await expect(malformed.query("SELECT * FROM identity.sso_connection")).rejects.toMatchObject({ code: "22P02" });
      await malformed.query("ROLLBACK");
      await malformed.query("BEGIN; SET LOCAL ROLE jobguard_migration");
      expect((await malformed.query("SELECT * FROM identity.sso_connection")).rows).toEqual([]);
      await malformed.query("ROLLBACK");
    } finally { malformed.release(); }
    await expect(admin.query("INSERT INTO identity.verified_domain(tenant_id,connection_id,domain) VALUES($1,$2,$3)", [a.principal.tenantId, b.connectionId, `cross.${randomUUID()}.invalid`])).rejects.toMatchObject({ code: "23503" });
  });

  it("durably audits strict admin and internal worker input refusals as typed errors", async () => {
    const f = await fixture();
    const memberships = await count("app.membership", f.principal.tenantId);
    const refusals = async () => (await admin.query("SELECT count(*)::int n FROM identity.sso_refusal_event")).rows[0].n as number;
    const beforeAdmin = await refusals();
    await expect(f.app.admin({ version: "sso-admin.v1", requested_tenant_id: f.principal.tenantId, action: "connection.create", id: randomUUID(), idpCert: f.idp.idpCert, requestedRole: "finance" }, f.credentials)).rejects.toMatchObject({ code: "INVALID_SSO_INPUT" });
    expect(await refusals()).toBeGreaterThan(beforeAdmin);
    const beforeWorker = await refusals();
    await expect(f.app.checkWorkerAction(testTenantContext(f.principal.tenantId), { version: "sso-worker-action.v1", connectionId: f.connectionId, sessionId: randomUUID(), membershipId: f.principal.membershipId, permission: "invented.authority", scopeId: f.principal.tenantId })).rejects.toMatchObject({ code: "INVALID_SSO_INPUT" });
    expect(await refusals()).toBeGreaterThan(beforeWorker);
    expect(await count("app.membership", f.principal.tenantId)).toBe(memberships);
    expect(await count("identity.sso_session_binding", f.principal.tenantId)).toBe(0);
  });

  it("persists a bounded session across providers with only explicitly mapped grants", async () => {
    const f = await fixture(); await f.verify(); await f.mapping();
    const session = await f.signin();
    const member = await sessionMember(session.sessionToken, f.principal.tenantId);
    expect(await permitted(member, "job.read")).toBe(true);
    for (const permission of ["statement.read", "extra.approve", "data.export", "contract.manage"]) expect(await permitted(member, permission), permission).toBe(false);
    const authPrincipal = (await provider().authenticate(session.sessionToken))!;
    const stored = (await admin.query("SELECT expires_at,token_digest FROM identity.session WHERE id=$1", [authPrincipal.sessionId])).rows[0];
    expect(stored.token_digest).toBe(provider().digest(`session:${session.sessionToken}`));
    expect(stored.expires_at.getTime() - Date.now()).toBeLessThanOrEqual(900000);
    const before = now; try { now = stored.expires_at.getTime(); expect(await provider().authenticate(session.sessionToken)).toBeUndefined(); } finally { now = before; }
    expect(await count("identity.sso_session_binding", f.principal.tenantId)).toBe(1);
  });

  it("shares issued request IDs across replicas and binds callbacks to the initiating browser", async () => {
    const f = await fixture(); await f.verify(); await f.mapping();
    const r = await f.response();
    const before = await count("app.audit_event", f.principal.tenantId);
    await expect(application().callback(f.connectionId, r.payload, "B".repeat(43))).rejects.toHaveProperty("code");
    expect(await count("identity.sso_session_binding", f.principal.tenantId)).toBe(0);
    expect(await count("app.audit_event", f.principal.tenantId)).toBeGreaterThan(before);
    const fresh = await f.response();
    const session = await application().callback(f.connectionId, fresh.payload, fresh.request.relayState);
    expect(await provider().authenticate(session.sessionToken)).toBeDefined();
    expect(await count("identity.sso_assertion_use", f.principal.tenantId)).toBe(1);
    await expect(application().callback(f.connectionId, fresh.payload, fresh.request.relayState)).rejects.toHaveProperty("code");
    expect(await count("identity.sso_session_binding", f.principal.tenantId)).toBe(1);
  });

  it("replays an assertion against a fresh issued request only once under a database race", async () => {
    const f = await fixture(); await f.verify(); await f.mapping();
    const assertionId = `_${randomUUID()}`, subject = randomUUID();
    const first = await f.response({ assertionId, subject }), second = await f.response({ assertionId, subject });
    const results = await Promise.allSettled([f.app.callback(f.connectionId, first.payload, first.request.relayState), application().callback(f.connectionId, second.payload, second.request.relayState)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    for (const failed of results.filter(result => result.status === "rejected")) expect((failed as PromiseRejectedResult).reason).toHaveProperty("code");
    expect(await count("identity.sso_assertion_use", f.principal.tenantId)).toBe(1);
    expect(await count("identity.sso_subject", f.principal.tenantId)).toBe(1);
    expect(await count("identity.sso_session_binding", f.principal.tenantId)).toBe(1);
    expect(await count("app.audit_event", f.principal.tenantId)).toBeGreaterThan(0);
  });

  it("audits refusal without creating a session, membership or subject for every hostile assertion", async () => {
    const f = await fixture(); await f.verify(); await f.mapping();
    const sessions = await count("identity.sso_session_binding", f.principal.tenantId), members = await count("app.membership", f.principal.tenantId);
    const attacks: Partial<TestResponseOptions>[] = [{ issuer: "urn:wrong" }, { audience: "urn:wrong" }, { signAssertion: false }, { signResponse: false }, { recipient: `${origin}/wrong` }, { notBefore: null }, { notOnOrAfter: null }, { confirmationRequestId: null }, { assertionSignatureAlgorithm: "sha1" }, { assertionDigestAlgorithm: "sha1" }, { notOnOrAfter: new Date(Date.now() - 60000).toISOString() }];
    for (const attack of attacks) {
      const response = await f.response(attack), before = await count("app.audit_event", f.principal.tenantId);
      await expect(f.app.callback(f.connectionId, response.payload, response.request.relayState)).rejects.toHaveProperty("code");
      expect(await count("app.audit_event", f.principal.tenantId)).toBeGreaterThan(before);
      expect(await count("identity.sso_session_binding", f.principal.tenantId)).toBe(sessions);
      expect(await count("app.membership", f.principal.tenantId)).toBe(members);
      expect(await count("identity.sso_subject", f.principal.tenantId)).toBe(0);
    }
    const altered = await f.response(); altered.payload.SAMLResponse = Buffer.from(Buffer.from(altered.payload.SAMLResponse, "base64").toString("utf8").replace("site@", "attacker@")).toString("base64");
    const auditBefore = await count("app.audit_event", f.principal.tenantId);
    await expect(f.app.callback(f.connectionId, altered.payload, altered.request.relayState)).rejects.toHaveProperty("code");
    expect(await count("app.audit_event", f.principal.tenantId)).toBeGreaterThan(auditBefore);
    expect(await count("identity.sso_session_binding", f.principal.tenantId)).toBe(sessions);
    expect(await count("app.membership", f.principal.tenantId)).toBe(members);
  });

  it("refuses every unsolicited response and a solicited A response on B's callback", async () => {
    const sharedIdp = generateTestIdentityProvider(), a = await fixture(sharedIdp), b = await fixture(sharedIdp); await a.verify(); await b.verify(); await a.mapping(); await b.mapping();
    const response = await a.response(), bAudit = await count("app.audit_event", b.principal.tenantId);
    await expect(b.app.callback(b.connectionId, response.payload, response.request.relayState)).rejects.toHaveProperty("code");
    expect(await count("app.audit_event", b.principal.tenantId)).toBeGreaterThan(bAudit);
    // Even a trusted signature and B's issuer/audience/recipient cannot reuse A's request identity.
    const borrowedRequest = { ...response.payload, SAMLResponse: sharedIdp.response({ connection: b.connection, requestId: response.request.requestId, email: `site@${b.domain}`, groups: ["site"] }) };
    await expect(b.app.callback(b.connectionId, borrowedRequest, response.request.relayState)).rejects.toHaveProperty("code");
    const unsolicited = { version: "sso-callback.v1", SAMLResponse: a.idp.response({ connection: a.connection, email: `site@${a.domain}` }), relayState: "A".repeat(43) };
    for (const f of [a, b]) {
      const before = await count("app.audit_event", f.principal.tenantId);
      await expect(f.app.callback(f.connectionId, unsolicited, unsolicited.relayState)).rejects.toHaveProperty("code");
      expect(await count("app.audit_event", f.principal.tenantId)).toBeGreaterThan(before);
      expect(await count("identity.sso_session_binding", f.principal.tenantId)).toBe(0);
      expect(await count("identity.sso_subject", f.principal.tenantId)).toBe(0);
    }
  });

  it("refuses unverified domains, domain takeover and email-only account collisions", async () => {
    const f = await fixture(); await f.mapping();
    const unverified = await f.response();
    await expect(f.app.callback(f.connectionId, unverified.payload, unverified.request.relayState)).rejects.toHaveProperty("code");
    await f.verify();
    const other = await fixture();
    await expect(other.app.admin({ version: "sso-admin.v1", requested_tenant_id: other.principal.tenantId, action: "domain.verify", connectionId: other.connectionId, domain: f.domain, proof: `synthetic-domain:${other.connectionId}:${f.domain}` }, other.credentials)).rejects.toHaveProperty("code");
    await f.app.admin({ version: "sso-admin.v1", requested_tenant_id: f.principal.tenantId, action: "domain.verify", connectionId: f.connectionId, domain: "synthetic.invalid", proof: `synthetic-domain:${f.connectionId}:synthetic.invalid` }, f.credentials);
    const collision = await f.response({ email: f.address });
    await expect(f.app.callback(f.connectionId, collision.payload, collision.request.relayState)).rejects.toHaveProperty("code");
    expect(await count("identity.sso_subject", f.principal.tenantId)).toBe(0);
    const link = await f.response({ email: f.address }, true);
    const session = await f.app.callback(f.connectionId, link.payload, link.request.relayState);
    expect((await sessionMember(session.sessionToken, f.principal.tenantId)).identityUserId).toBe(f.principal.identityUserId);
    await expect(f.start(true, other.credentials)).rejects.toHaveProperty("code");
    expect(await count("identity.sso_session_binding", other.principal.tenantId)).toBe(0);
  });

  it("adds, changes and removes audited mappings and never defaults finance or commercial manager", async () => {
    const f = await fixture(); await f.verify(); await f.mapping("read_only");
    const subject = randomUUID(), session = await f.signin({ subject, groups: ["site", "finance", "commercial_manager"] });
    const member = await sessionMember(session.sessionToken, f.principal.tenantId);
    expect(await permitted(member, "statement.read")).toBe(false); expect(await permitted(member, "contract.manage")).toBe(false);
    const before = await count("app.audit_event", f.principal.tenantId);
    await f.mapping("finance", true, 0, "finance");
    expect(await count("app.audit_event", f.principal.tenantId)).toBe(before + 1);
    await f.mapping("commercial_manager", true, 0, "commercial_manager");
    expect(await count("app.audit_event", f.principal.tenantId)).toBe(before + 2);
    const elevated = await f.signin({ subject, groups: ["finance", "commercial_manager"] });
    const elevatedMember = await sessionMember(elevated.sessionToken, f.principal.tenantId);
    expect(await permitted(elevatedMember, "statement.read")).toBe(true); expect(await permitted(elevatedMember, "contract.manage")).toBe(true);
    const beforeChanges = await count("app.audit_event", f.principal.tenantId);
    await f.mapping("read_only", true, 1, "finance");
    expect(await count("app.audit_event", f.principal.tenantId)).toBe(beforeChanges + 1);
    await f.mapping("commercial_manager", false, 1, "commercial_manager");
    expect(await count("app.audit_event", f.principal.tenantId)).toBe(beforeChanges + 2);
    const mappingAudits=(await admin.query("SELECT actor_ref,payload FROM app.audit_event WHERE tenant_id=$1 AND event_type='sso.mapping.set'",[f.principal.tenantId])).rows;
    expect(mappingAudits).toHaveLength(5);
    for(const event of mappingAudits){expect(event.actor_ref).toBe(`membership:${f.principal.membershipId}`);expect(event.payload.hashes.document).toMatch(/^[0-9a-f]{64}$/u);}
    const downgraded = await f.signin({ subject, groups: ["finance", "commercial_manager"] });
    const downgradedMember = await sessionMember(downgraded.sessionToken, f.principal.tenantId);
    expect(await permitted(downgradedMember, "statement.read")).toBe(false); expect(await permitted(downgradedMember, "contract.manage")).toBe(false);
    expect(await provider().authenticate(elevated.sessionToken)).toBeUndefined();
    await expect(f.mapping("finance", true, 0, "finance")).rejects.toHaveProperty("code");
  });

  it("rechecks revocation and downgrade on web and background paths without reprovisioning", async () => {
    const f = await fixture(); await f.verify(); await f.mapping("finance");
    const subject = randomUUID(), session = await f.signin({ subject });
    const member = await sessionMember(session.sessionToken, f.principal.tenantId);
    const request = { sessionToken: session.sessionToken, csrfToken: session.csrfToken, origin, requestedTenantId: f.principal.tenantId };
    await resolveVerifiedTenantContext(f.app.provider, request, origin);
    expect(await permitted(member, "statement.read")).toBe(true);
    await admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [member.tenantId, member.membershipId]);
    await expect(resolveVerifiedTenantContext(f.app.provider, request, origin)).rejects.toHaveProperty("code");
    expect(await permitted(member, "statement.read")).toBe(false);
    const members = await count("app.membership", member.tenantId);
    await expect(f.signin({ subject })).rejects.toHaveProperty("code");
    expect(await count("app.membership", member.tenantId)).toBe(members);
  });

  it("the persisted worker boundary rechecks tenant, expiry, revocation and role downgrade on each execution", async () => {
    const f = await fixture(); await f.verify(); await f.mapping("finance");
    const subject = randomUUID(), session = await f.signin({ subject });
    const member = await sessionMember(session.sessionToken, f.principal.tenantId);
    const principal = (await provider().authenticate(session.sessionToken))!;
    const context = testTenantContext(member.tenantId);
    const payload = { version: "sso-worker-action.v1", connectionId: f.connectionId, sessionId: principal.sessionId, membershipId: member.membershipId, permission: "statement.read", scopeId: member.tenantId };
    await expect(f.app.checkWorkerAction(context, payload)).resolves.toBeUndefined();
    await expect(f.app.checkWorkerAction(testTenantContext(randomUUID()), payload)).rejects.toHaveProperty("code");
    await expect(f.app.checkWorkerAction(context, { ...payload, connectionId: randomUUID() })).rejects.toHaveProperty("code");
    await f.mapping("read_only", true, 1);
    const lower = await f.signin({ subject });
    await expect(f.app.checkWorkerAction(context, payload)).rejects.toHaveProperty("code");
    const lowerPrincipal = (await provider().authenticate(lower.sessionToken))!;
    const lowerPayload = { ...payload, sessionId: lowerPrincipal.sessionId };
    await expect(f.app.checkWorkerAction(context, lowerPayload)).rejects.toHaveProperty("code");
    const read = { ...lowerPayload, permission: "job.read" };
    await expect(f.app.checkWorkerAction(context, read)).resolves.toBeUndefined();
    await admin.query("UPDATE identity.session SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [lowerPrincipal.sessionId]);
    await expect(f.app.checkWorkerAction(context, read)).rejects.toHaveProperty("code");
    const fresh = await f.signin({ subject });
    const freshPrincipal = (await provider().authenticate(fresh.sessionToken))!;
    await admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [member.tenantId, member.membershipId]);
    await expect(f.app.checkWorkerAction(context, { ...read, sessionId: freshPrincipal.sessionId })).rejects.toHaveProperty("code");
    const g = await fixture(); await g.verify(); await g.mapping("finance");
    const granted = await g.signin(), grantedMember = await sessionMember(granted.sessionToken, g.principal.tenantId), grantedPrincipal = (await provider().authenticate(granted.sessionToken))!;
    const grantedContext = testTenantContext(grantedMember.tenantId);
    const grantedPayload = { ...payload, connectionId: g.connectionId, sessionId: grantedPrincipal.sessionId, membershipId: grantedMember.membershipId, scopeId: grantedMember.tenantId };
    await expect(g.app.checkWorkerAction(grantedContext, grantedPayload)).resolves.toBeUndefined();
    const grantId = (await admin.query("SELECT grant_id FROM identity.sso_grant WHERE tenant_id=$1", [grantedMember.tenantId])).rows[0].grant_id;
    await admin.query("INSERT INTO app.role_grant_revocation(tenant_id,id,grant_id) VALUES($1,$2,$3)", [grantedMember.tenantId, randomUUID(), grantId]);
    await expect(g.app.checkWorkerAction(grantedContext, grantedPayload)).rejects.toHaveProperty("code");
    expect(await provider().authenticate(granted.sessionToken)).toBeDefined();
  });

  it("the real background executor refuses an approved action after the SSO membership is revoked", async () => {
    const f = await fixture(); await f.verify(); await f.mapping("commercial_manager");
    const session = await f.signin(), member = await sessionMember(session.sessionToken, f.principal.tenantId);
    const decisionId = randomUUID(), resolutionId = randomUUID(), authorizationId = randomUUID();
    const content = "Fictional approved document", contentHash = createHash("sha256").update(content).digest("hex");
    // Immutable fixture authorization is seeded by the control connection; it grants only this exact artifact.
    await admin.query("INSERT INTO app.decision(id,tenant_id,subject_type,subject_ref,action_type) VALUES($1,$2,'quote','synthetic-document','send_quote')", [decisionId, member.tenantId]);
    await admin.query("INSERT INTO app.decision_resolution(id,tenant_id,decision_id,resolution,actor_membership_id) VALUES($1,$2,$3,'approved',$4)", [resolutionId, member.tenantId, decisionId, member.membershipId]);
    const expiresAt = new Date(Date.now() + 600000);
    await admin.query("INSERT INTO app.action_authorization(id,tenant_id,decision_id,resolution_id,actor_membership_id,action_type,recipient,content_hash,aggregate_revision,policy_version,expires_at) VALUES($1,$2,$3,$4,$5,'send_quote','customer@synthetic.invalid',$6,1,'synthetic.v1',$7)", [authorizationId, member.tenantId, decisionId, resolutionId, member.membershipId, contentHash, expiresAt]);
    const action: OutboundAction = { version: "outbound-action.v1", id: randomUUID(), authorizationId, adapter: "fake_capture", providerEffectKey: randomUUID(), actionType: "send_quote", recipient: "customer@synthetic.invalid", contentHash, immutableContent: content, aggregateRevision: 1, amountPence: null, currency: null, policyVersion: "synthetic.v1", authorizationExpiresAt: expiresAt };
    await withTenant(runtime, testTenantContext(member.tenantId), db => appendOutboundAction(db, member.tenantId, action));
    await admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [member.tenantId, member.membershipId]);
    let calls = 0;
    const fake: OutboundAdapter = { name: "fake_capture", supportsProviderDeduplication: false, deliver: async () => { calls++; return { kind: "succeeded", providerReference: "synthetic:unexpected" }; }, reconcile: async () => "unknown" };
    await new ActionExecutor(runtime, new Map([[fake.name, fake]]), { emit: () => undefined }).execute(testTenantContext(member.tenantId), action.id);
    expect(calls).toBe(0);
    expect((await admin.query("SELECT status FROM app.action_outbox WHERE tenant_id=$1 AND id=$2", [member.tenantId, action.id])).rows[0].status).toBe("pending");
    expect((await admin.query("SELECT count(*)::int n FROM app.action_attempt WHERE tenant_id=$1 AND action_id=$2", [member.tenantId, action.id])).rows[0].n).toBe(0);
  });

  it("without SCIM, next sign-in revokes all prior sessions and removes unmapped grants", async () => {
    const f = await fixture(); await f.verify(); await f.mapping("finance");
    const subject = randomUUID(), first = await f.signin({ subject });
    const member = await sessionMember(first.sessionToken, f.principal.tenantId);
    await expect(f.signin({ subject, groups: [] })).rejects.toMatchObject({ code: "NO_MAPPED_GRANTS" });
    expect(await provider().authenticate(first.sessionToken)).toBeUndefined();
    expect(await permitted(member, "statement.read")).toBe(false);
    expect(await count("identity.sso_session_binding", member.tenantId)).toBe(1);
    const second = await f.signin({ subject });
    expect((await sessionMember(second.sessionToken, f.principal.tenantId)).membershipId).toBe(member.membershipId);
    const authPrincipal = (await provider().authenticate(second.sessionToken))!;
    const expires = (await admin.query("SELECT expires_at FROM identity.session WHERE id=$1", [authPrincipal.sessionId])).rows[0].expires_at as Date;
    const prior = now; try { now = expires.getTime(); expect(await provider().authenticate(second.sessionToken)).toBeUndefined(); } finally { now = prior; }
  });

  it("rolls back replay claims, memberships, grants and session on failed session creation", async () => {
    const f = await fixture(); await f.verify(); await f.mapping();
    const r = await f.response();
    const members = await count("app.membership", f.principal.tenantId);
    const occupiedId=(await f.auth.authenticate(f.credentials.sessionToken))!.sessionId;
    const complete=f.app.repository.complete.bind(f.app.repository);
    // Force a real PostgreSQL primary-key failure without changing the existing session schema.
    f.app.repository.complete=(client,connectionId,claims,session,state)=>complete(client,connectionId,claims,{...session,id:occupiedId},state);
    try { await expect(f.app.callback(f.connectionId, r.payload, r.request.relayState)).rejects.toThrow(); } finally { f.app.repository.complete=complete; }
    expect(await count("identity.sso_assertion_use", f.principal.tenantId)).toBe(0);
    expect(await count("identity.sso_subject", f.principal.tenantId)).toBe(0);
    expect(await count("identity.sso_grant", f.principal.tenantId)).toBe(0);
    expect(await count("identity.sso_session_binding", f.principal.tenantId)).toBe(0);
    expect(await count("app.membership", f.principal.tenantId)).toBe(members);
  });

  it("keeps identity audit append-only and commercial approval authority unchanged", async () => {
    const f = await fixture(); await f.verify(); await f.mapping("finance"); await f.signin();
    for (const sql of ["UPDATE app.audit_event SET tenant_id=tenant_id", "DELETE FROM app.audit_event", "TRUNCATE app.audit_event"]) await expect(identity.query(sql)).rejects.toMatchObject({ code: "42501" });
    expect((await admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type LIKE 'sso.%'", [f.principal.tenantId])).rows[0].n).toBeGreaterThan(0);
    expect((await admin.query("SELECT count(*)::int n FROM app.decision_resolution WHERE tenant_id=$1", [f.principal.tenantId])).rows[0].n).toBe(0);
    expect((await admin.query("SELECT count(*)::int n FROM app.action_outbox WHERE tenant_id=$1", [f.principal.tenantId])).rows[0].n).toBe(0);
    const data = (await admin.query("SELECT row_to_json(e)::text AS value FROM app.audit_event e WHERE tenant_id=$1 AND event_type LIKE 'sso.%'", [f.principal.tenantId])).rows.map(row => row.value).join("\n");
    expect(data).not.toContain(f.address); expect(data).not.toContain(f.credentials.sessionToken); expect(data).not.toContain(f.idp.idpCert);
    const events = (await admin.query<AuditEvent>(`SELECT id,tenant_id AS "tenantId",sequence::int,version,actor_ref AS "actorRef",event_type AS "eventType",subject_type AS "subjectType",subject_ref AS "subjectRef",occurred_at AS "occurredAt",payload,payload_hash AS "payloadHash",previous_hash AS "previousHash",event_hash AS "eventHash" FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence`, [f.principal.tenantId])).rows;
    expect(() => verifyAuditChain(events)).not.toThrow();
  });
});
