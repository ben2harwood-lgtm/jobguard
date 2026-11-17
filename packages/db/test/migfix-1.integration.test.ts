import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ContractorRepository, IdentityRepository, migrate, verifiedTenantContextFromMembership, withTenant } from "../src/index.js";
import { IdentityApplication } from "../../../apps/api/src/auth/identity.application.js";
import { PersistedAuthProvider } from "../../../apps/api/src/auth/persisted-auth-provider.js";
import { FixtureIdentityEmail } from "../../../apps/api/src/auth/identity-email.js";
import { startBeforeMigration, type Cluster } from "./contractor-practice-session-fixtures.js";

const migrationName = "0150_membership_authority_fix.sql";
const origin = "https://jobguard.invalid", signingMaterial = randomUUID().repeat(2);
let c: Cluster, identity: Pool;
const provider = () => new PersistedAuthProvider(new IdentityRepository(identity), signingMaterial, new FixtureIdentityEmail(), "synthetic_demo", () => Date.now(), () => "12345678");
const application = () => new IdentityApplication(provider(), origin);
async function fixture() {
  const repo = new ContractorRepository(c.runtime), p = await repo.startPractice(randomUUID());
  const address = `${randomUUID()}@fixture.invalid`, sessionToken = randomUUID(), csrfToken = randomUUID(), sessionId = randomUUID();
  await c.admin.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2)", [address, p.identityUserId]);
  await c.admin.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3)", [p.identityUserId,p.tenantId,p.membershipId]);
  await c.admin.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES($1,$2,'synthetic_demo',$3,$4,clock_timestamp()+interval '1 day')", [sessionId,p.identityUserId,provider().digest(`session:${sessionToken}`),csrfToken]);
  return { repo, p, address, sessionToken, sessionId, csrfToken, credentials: { sessionToken, csrfToken, origin, tenantHeader:p.tenantId } };
}
type Fixture = Awaited<ReturnType<typeof fixture>>;
const request = (f: Fixture, role = "read_only") => ({version:"identity-invitation.v1",requested_tenant_id:f.p.tenantId,email:`${randomUUID()}@fixture.invalid`,role});
async function revocation(f: Fixture) {
  const revision = (await c.admin.query("SELECT count(*)::int n FROM app.command_receipt WHERE tenant_id=$1 AND command_type LIKE 'contractor.%'",[f.p.tenantId])).rows[0]!.n;
  return {version:"contractor-command.v1",environment:"synthetic_demo",kind:"membership.revoke",commandId:randomUUID(),id:randomUUID(),membershipId:f.p.membershipId,expectedRevision:revision};
}
async function counts() {
  return (await c.admin.query("SELECT (SELECT count(*)::int FROM identity.invitation) invitations,(SELECT count(*)::int FROM identity.security_event) events")).rows[0];
}
async function waitBlocked(pid: number, blocker: number) {
  const until = Date.now()+5000;
  while (Date.now()<until) {
    if ((await c.admin.query("SELECT $2::int=ANY(pg_blocking_pids($1)) blocked",[pid,blocker])).rows[0]!.blocked) return;
    await new Promise(resolve=>setTimeout(resolve,5));
  }
  throw new Error("invitation did not wait for the uncommitted contractor revocation");
}

describe("MIGFIX-1 actual PostgreSQL identity boundary", () => {
  beforeAll(async () => {
    c = await startBeforeMigration(migrationName); await migrate(c.admin);
    // LP-1 decision 42: TEST-ONLY non-owner writer, as in the tenancy fixture (decision 40).
    await c.admin.query(`
      CREATE ROLE lp1_tenancy_fixture NOLOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
      GRANT jobguard_runtime TO lp1_tenancy_fixture;
      GRANT INSERT, UPDATE, DELETE ON app.account, app.membership TO lp1_tenancy_fixture;
    `);
    await c.admin.query("CREATE ROLE migfix_identity LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; GRANT jobguard_identity TO migfix_identity");
    // Reuse the cluster's generated connection configuration; no credential-shaped literal.
    const auth = c.config.password;
    await c.admin.query(`ALTER ROLE migfix_identity PASSWORD '${auth}'`);
    identity = new Pool({...c.config,database:"jobguard_synthetic_demo",user:"migfix_identity",max:4});
  },120000);
  afterAll(async () => { await identity?.end(); await c?.close(); });

  it("[MIGFIX-1-1] runtime cannot promote or reactivate memberships", async () => {
    for (const state of ["read_only","revoked","expired"] as const) {
      const f = await fixture();
      await c.admin.query(`UPDATE app.membership SET ${state==="read_only"?"role='read_only'":state==="revoked"?"revoked_at=clock_timestamp()":"expires_at=clock_timestamp()-interval '1 second'"} WHERE tenant_id=$1 AND id=$2`,[f.p.tenantId,f.p.membershipId]);
      const before = (await c.admin.query("SELECT row_to_json(m)::text bytes FROM app.membership m WHERE tenant_id=$1 AND id=$2",[f.p.tenantId,f.p.membershipId])).rows;
      // Only real authority changes are refused; NULL-to-NULL is an allowed no-op.
      const changes = state==="read_only" ? ["role='owner'"] : state==="revoked"
        ? ["role='read_only'","revoked_at=NULL","revoked_at=revoked_at+interval '1 microsecond'"]
        : ["role='read_only'","expires_at=NULL","expires_at=expires_at+interval '1 microsecond'"];
      for (const change of [...changes,...["id","tenant_id","account_id","identity_user_id"].map(column=>`${column}=gen_random_uuid()`)]) {
        await expect(withTenant(c.runtime,verifiedTenantContextFromMembership(f.p), db=>db.$client.query(`UPDATE app.membership SET ${change} WHERE tenant_id=$1 AND id=$2`,[f.p.tenantId,f.p.membershipId]))).rejects.toMatchObject({code:"42501"});
      }
      expect((await c.admin.query("SELECT row_to_json(m)::text bytes FROM app.membership m WHERE tenant_id=$1 AND id=$2",[f.p.tenantId,f.p.membershipId])).rows).toEqual(before);
      if (state!=="read_only") {
        expect((await application().session(f.sessionToken)).memberships).toEqual([]);
        await expect(application().context(f.credentials)).rejects.toMatchObject({code:"TENANT_FORBIDDEN"});
      } else await expect(application().invite(request(f),f.credentials)).rejects.toMatchObject({code:"42501"});
    }
  });

  it("[MIGFIX-1-1b] retained UPDATE permits row locks, no-ops and authority restriction", async () => {
    const f = await fixture();
    await withTenant(c.admin,verifiedTenantContextFromMembership(f.p),async db=>{
      await db.$client.query("SET LOCAL ROLE lp1_tenancy_fixture");
      expect((await db.$client.query("SELECT id FROM app.membership WHERE tenant_id=$1 AND id=$2 FOR SHARE",[f.p.tenantId,f.p.membershipId])).rows).toEqual([{id:f.p.membershipId}]);
      await db.$client.query("UPDATE app.membership SET role=role,revoked_at=revoked_at,expires_at=expires_at WHERE tenant_id=$1 AND id=$2",[f.p.tenantId,f.p.membershipId]);
      await db.$client.query("UPDATE app.membership SET revoked_at=clock_timestamp(),expires_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[f.p.tenantId,f.p.membershipId]);
      await db.$client.query("UPDATE app.membership SET revoked_at=revoked_at-interval '1 microsecond',expires_at=expires_at-interval '1 microsecond' WHERE tenant_id=$1 AND id=$2",[f.p.tenantId,f.p.membershipId]);
    });
    expect((await application().session(f.sessionToken)).memberships).toEqual([]);
  });

  it("[MIGFIX-1-2] ordinary identity rejects contractor-command revocation", async () => {
    const f = await fixture();
    expect((await application().session(f.sessionToken)).memberships).toHaveLength(1);
    await f.repo.command(f.p,await revocation(f));
    const before = await counts();
    expect((await application().session(f.sessionToken)).memberships).toEqual([]);
    await expect(application().context(f.credentials)).rejects.toMatchObject({code:"TENANT_FORBIDDEN"});
    await expect(application().invite(request(f),f.credentials)).rejects.toMatchObject({code:"TENANT_FORBIDDEN"});
    await expect(identity.query("SELECT identity.invite_member($1,$2,$3,'read_only')",[provider().digest(`session:${f.sessionToken}`),f.p.tenantId,`${randomUUID()}@fixture.invalid`])).rejects.toMatchObject({code:"42501"});
    expect(await counts()).toEqual(before);
  });

  it("[MIGFIX-1-3] invitation authorization serializes with contractor revocation", async () => {
    const f = await fixture(), command = await revocation(f), before = await counts();
    let signal!: () => void, release!: () => void, blocker = 0;
    const ready = new Promise<void>(resolve=>{signal=resolve;}), gate = new Promise<void>(resolve=>{release=resolve;});
    const pool = new Proxy(c.runtime, {get(target,property) {
      if (property==="connect") return async () => {
        const client = await target.connect();
        blocker = (await client.query("SELECT pg_backend_pid() pid")).rows[0]!.pid;
        return new Proxy(client,{get(connection,key) {
          if(key==="query") return async (...args: unknown[]) => {
            if (args[0]==="COMMIT") {signal();await gate;}
            return (connection.query as (...values:unknown[])=>Promise<unknown>)(...args);
          };
          const value = Reflect.get(connection,key,connection); return typeof value==="function"?value.bind(connection):value;
        }}) as PoolClient;
      };
      const value = Reflect.get(target,property,target); return typeof value==="function"?value.bind(target):value;
    }}) as Pool;
    const revoking = new ContractorRepository(pool).command(f.p,command);
    // Attach immediately: a fixture/setup error must not become an unhandled rejection.
    const outcome = revoking.then(value=>({value}),error=>({error}));
    const inviter = await identity.connect();
    let inviting: Promise<unknown> | undefined;
    try {
      await Promise.race([ready,outcome.then(result=>{if("error" in result)throw result.error;throw new Error("revocation bypassed commit barrier");})]);
      const pid = (await inviter.query("SELECT pg_backend_pid() pid")).rows[0]!.pid;
      inviting = inviter.query("SELECT identity.invite_member($1,$2,$3,'read_only')",[provider().digest(`session:${f.sessionToken}`),f.p.tenantId,`${randomUUID()}@fixture.invalid`]);
      const invitationOutcome = inviting.then(value=>({value}),error=>({error}));
      await waitBlocked(pid,blocker); release(); await revoking;
      expect(await invitationOutcome).toMatchObject({error:{code:"42501"}});
      expect(await counts()).toEqual(before);
    } finally {release();await outcome;await inviting?.catch(()=>undefined);inviter.release();}
  },15000);

  it("[MIGFIX-1-3b] an invitation committed before contractor revocation remains immutable", async () => {
    const f = await fixture(), invitation = await application().invite(request(f,"finance"),f.credentials);
    const before = (await c.admin.query("SELECT row_to_json(i)::text bytes FROM identity.invitation i WHERE id=$1",[invitation.id])).rows;
    await f.repo.command(f.p,await revocation(f));
    expect((await c.admin.query("SELECT row_to_json(i)::text bytes FROM identity.invitation i WHERE id=$1",[invitation.id])).rows).toEqual(before);
    await expect(application().invite(request(f),f.credentials)).rejects.toMatchObject({code:"TENANT_FORBIDDEN"});
  });

  it("[MIGFIX-1-4] SSO wrappers exclude revocation without suppressing another tenant", async () => {
    const f = await fixture(), other = await fixture();
    const account = (await c.admin.query("SELECT account_id FROM app.membership WHERE tenant_id=$1 AND id=$2",[other.p.tenantId,other.p.membershipId])).rows[0]!.account_id;
    const membership = randomUUID();
    await c.admin.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'read_only')",[other.p.tenantId,membership,account,f.p.identityUserId]);
    await c.admin.query("INSERT INTO identity.membership_locator VALUES($1,$2,$3)",[f.p.identityUserId,other.p.tenantId,membership]);
    await f.repo.command(f.p,await revocation(f));
    for (const sql of ["SELECT * FROM identity.current_memberships($1)","SELECT * FROM identity.sso_session_memberships($1,$2)"]) {
      const values = sql.includes("$2")?[f.p.identityUserId,f.sessionId]:[f.p.identityUserId];
      expect((await identity.query(sql,values)).rows).toEqual([expect.objectContaining({tenant_id:other.p.tenantId,id:membership})]);
    }
    expect((await identity.query("SELECT * FROM identity.sso_code_signin_allowed($1)",[f.p.identityUserId])).rows).toEqual([{allowed:true,connections:[]}]);
    expect((await application().session(other.sessionToken)).memberships).toEqual([expect.objectContaining({tenantId:other.p.tenantId,id:other.p.membershipId})]);
    await application().context({...f.credentials,tenantHeader:other.p.tenantId});
    await expect(identity.query("SELECT * FROM identity.sso_invite_member($1,$2,$3,'read_only')",[provider().digest(`session:${f.sessionToken}`),f.p.tenantId,`${randomUUID()}@fixture.invalid`])).rejects.toMatchObject({code:"42501"});
    await expect(application().invite(request(other),other.credentials)).resolves.toHaveProperty("id");
  });

  it("[MIGFIX-1-5] a fresh invitation replaces a contractor-revoked membership without reactivating history", async () => {
    const f = await fixture(), issuer = await fixture(), account = (await c.admin.query("SELECT account_id FROM app.membership WHERE tenant_id=$1 AND id=$2",[f.p.tenantId,f.p.membershipId])).rows[0]!.account_id;
    const issuerMembership = randomUUID();
    await c.admin.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')",[f.p.tenantId,issuerMembership,account,issuer.p.identityUserId]);
    await c.admin.query("INSERT INTO identity.membership_locator VALUES($1,$2,$3)",[issuer.p.identityUserId,f.p.tenantId,issuerMembership]);
    await f.repo.command(f.p,await revocation(f));
    const old = (await c.admin.query("SELECT row_to_json(m)::text bytes FROM app.membership m WHERE tenant_id=$1 AND id=$2",[f.p.tenantId,f.p.membershipId])).rows;
    const invitation = await application().invite({...request(f,"finance"),email:f.address},{...issuer.credentials,tenantHeader:f.p.tenantId});
    await provider().requestCode({email:f.address,purpose:"invitation",invitationId:invitation.id,ip:randomUUID()});
    const accepted = await provider().verifyCode(f.address,"invitation","12345678",invitation.id);
    const current = (await application().session(accepted.sessionToken)).memberships.find(m=>m.tenantId===f.p.tenantId)!;
    expect(current.role).toBe("finance"); expect(current.id).not.toBe(f.p.membershipId);
    expect((await c.admin.query("SELECT row_to_json(m)::text bytes FROM app.membership m WHERE tenant_id=$1 AND id=$2",[f.p.tenantId,f.p.membershipId])).rows).toEqual(old);
    expect((await c.admin.query("SELECT membership_id FROM identity.membership_locator WHERE user_id=$1 AND tenant_id=$2",[f.p.identityUserId,f.p.tenantId])).rows).toEqual([{membership_id:current.id}]);
    expect((await c.admin.query("SELECT membership_id FROM app.contractor_membership_revocation WHERE tenant_id=$1",[f.p.tenantId])).rows).toEqual([{membership_id:f.p.membershipId}]);
  });
});
