/** ENT-10d private two-connection PostgreSQL fixture. NOT RUN (sandbox cannot start PostgreSQL). */
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool, type PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ContractorRepository, EnterpriseIdentityRepository, IdentityRepository, SsoRequiredRepository, migrate, verifyAuditChain, type AuditEvent } from "../src/index.js";
import { PersistedAuthProvider } from "../../../apps/api/src/auth/persisted-auth-provider.js";
import { SsoApplication } from "../../../apps/api/src/auth/sso/sso.application.js";
import { SsoRequiredApplication } from "../../../apps/api/src/auth/sso/sso-required.application.js";
import { generateTestIdentityProvider } from "../../../apps/api/src/auth/sso/test-identity-provider.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";

let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, identity: Pool, directory: string;
const origin = "https://jobguard.invalid", secret = "s".repeat(40);
const auth = () => new PersistedAuthProvider(new IdentityRepository(identity), secret);
const sso = () => new SsoApplication(auth(), new EnterpriseIdentityRepository(identity), origin, "synthetic_demo");
const required = () => new SsoRequiredApplication(auth(), new SsoRequiredRepository(identity), origin, "synthetic_demo");

beforeAll(async () => {
  // This file creates its own cluster and database; no other suite can observe the lifted fixture latch.
  directory = await mkdtemp(join(tmpdir(), "jg-ent10d-race-pg16-"));
  const port = await freePort(59500, 400);
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: "synthetic", persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  const base = { host: "127.0.0.1", port, database: "jobguard_synthetic_demo" };
  const control = new Pool({ ...base, database: "postgres", user: "postgres", password: "synthetic" });
  try { await control.query("CREATE DATABASE jobguard_synthetic_demo"); } finally { await control.end(); }
  admin = new Pool({ ...base, user: "postgres", password: "synthetic" });
  await migrate(admin);
  await admin.query("CREATE ROLE ent10d_race_identity LOGIN PASSWORD 'fixture' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS INHERIT; GRANT jobguard_identity TO ent10d_race_identity; CREATE ROLE ent10d_race_runtime LOGIN PASSWORD 'fixture' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS INHERIT; GRANT jobguard_runtime TO ent10d_race_runtime");
  identity = new Pool({ ...base, user: "ent10d_race_identity", password: "fixture", max: 4 });
  runtime = new Pool({ ...base, user: "ent10d_race_runtime", password: "fixture", max: 4 });
}, 120000);
afterAll(async () => {
  try { await closeTestPools(identity, runtime, admin); }
  finally {
    try { await postgres?.stop(); }
    finally { if (directory) await rm(directory, { recursive: true, force: true }); }
  }
});

async function fixture(configure=true,link=true) {
 const contractor=new ContractorRepository(runtime),principal=await contractor.startPractice(randomUUID()),provider=auth();
 const connectionId=randomUUID(),domain=`${connectionId}.fixture.invalid`,email=`owner@${domain}`;
 const sessionToken=randomUUID(),csrfToken=randomUUID(),sessionId=randomUUID();
 await admin.query("INSERT INTO identity.user_email VALUES($1,$2)",[email,principal.identityUserId]);
 await admin.query("INSERT INTO identity.membership_locator VALUES($1,$2,$3)",[principal.identityUserId,principal.tenantId,principal.membershipId]);
 await admin.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES($1,$2,'synthetic_demo',$3,$4,clock_timestamp()+interval '1 day')",[sessionId,principal.identityUserId,provider.digest(`session:${sessionToken}`),csrfToken]);
 const ordinary={sessionToken,csrfToken,origin},idp=generateTestIdentityProvider(),app=sso(),service=required();
 const command=(required:boolean,expectedRevision:number)=>({version:"sso-required-command.v1",requested_tenant_id:principal.tenantId,required,expectedRevision,reason:"Synthetic administrator verifies SSO requirement"});
 const connection={id:connectionId,tenantId:principal.tenantId,idpEntityId:`urn:jobguard:test-idp:${connectionId}`,spEntityId:`urn:jobguard:sp:${connectionId}`,callbackUrl:`${origin}/api/auth/sso/${connectionId}/callback`,entryPoint:`${origin}/api/auth/sso/${connectionId}/start`,idpCert:idp.idpCert};
 let bound:{sessionToken:string;csrfToken:string;origin:string}|undefined;
 async function signin(address=email,subject=principal.identityUserId,linkExisting=false,groups=["admins"]) {
  const started=await app.start(connectionId,{version:"sso-start.v1",action:"signin",...(linkExisting?{linkExisting:true}:{})},ordinary);
  const result=await app.callback(connectionId,{version:"sso-callback.v1",SAMLResponse:idp.response({connection,requestId:started.requestId,email:address,subject,groups}),relayState:started.relayState},started.relayState);
  return {sessionToken:result.sessionToken,csrfToken:result.csrfToken,origin};
 }
 if(configure) {
  await app.admin({version:"sso-admin.v1",requested_tenant_id:principal.tenantId,action:"connection.create",id:connectionId,idpCert:idp.idpCert},ordinary);
  await app.admin({version:"sso-admin.v1",requested_tenant_id:principal.tenantId,action:"domain.verify",connectionId,domain,proof:`synthetic-domain:${connectionId}:${domain}`},ordinary);
  await app.admin({version:"sso-admin.v1",requested_tenant_id:principal.tenantId,action:"mapping.set",connectionId,group:"admins",role:"admin",scope:{kind:"tenant",id:principal.tenantId},enabled:true,expectedRevision:0},ordinary);
  if(link)bound=await signin(email,principal.identityUserId,true);
 }
 const enable=()=>service.command(command(true,0),bound!);
 return {principal,provider,connectionId,domain,email,ordinary,bound,sessionId,idp,connection,app,service,command,signin,enable};
}

const unchangedTables = [
  "identity.sso_connection", "identity.verified_domain", "identity.idp_group_role_mapping",
  "identity.sso_subject", "identity.sso_session_binding", "identity.sso_grant",
  "identity.sso_emergency_approval", "identity.sso_emergency_approver_rule",
  "identity.session", "identity.security_event", "identity.identity_user", "identity.user_email",
  "identity.invitation", "identity.membership_locator", "app.membership", "app.contractor_member",
  "app.role_grant", "app.role_grant_revocation", "app.journal", "app.journal_line", "app.evidence_object",
];
async function snapshot() {
  const rows: Record<string, unknown> = {};
  for (const name of unchangedTables) rows[name] = (await admin.query(`SELECT to_jsonb(r) value FROM ${name} r ORDER BY to_jsonb(r)::text`)).rows;
  return rows;
}
async function audit(tenantId: string) {
  const rows = (await admin.query("SELECT * FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence", [tenantId])).rows;
  const events: AuditEvent[] = rows.map(r => ({ id: r.id, tenantId: r.tenant_id, sequence: Number(r.sequence), version: r.version, actorRef: r.actor_ref, eventType: r.event_type, subjectType: r.subject_type, subjectRef: r.subject_ref, occurredAt: r.occurred_at, payload: r.payload, payloadHash: r.payload_hash, previousHash: r.previous_hash, eventHash: r.event_hash }));
  expect(() => verifyAuditChain(events)).not.toThrow();
  return rows;
}
function repositoryFor(client: PoolClient) {
  // The real repository owns BEGIN/COMMIT/audit; the test retains each distinct client until the race ends.
  return new SsoRequiredRepository({ connect: async () => ({ query: client.query.bind(client), release: () => undefined }) } as unknown as Pool);
}
async function bothWaiting(pids: number[]) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const count = (await admin.query("SELECT count(*)::int n FROM pg_locks WHERE pid=ANY($1::int[]) AND locktype='advisory' AND mode='ExclusiveLock' AND NOT granted", [pids])).rows[0].n;
    if (count === 2) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error("Both independent transactions must contend for the tenant lock");
}

describe("ENT-10d isolated emergency concurrency", () => {
  it("[S10d/S11] five competing transactions use each fresh approval once and preserve other authority/history", async () => {
    const f = await fixture(), rule = randomUUID();
    for (let iteration = 0; iteration < 5; iteration++) {
      await f.service.command(f.command(true, iteration * 2), f.bound!);
      const approval = randomUUID(), owner = await admin.connect();
      try {
        await owner.query("BEGIN");
        await owner.query("SET LOCAL ROLE jobguard_migration");
        await owner.query("SELECT set_config('app.tenant_id',$1,true)", [f.principal.tenantId]);
        if (iteration === 0) {
          expect((await owner.query("SELECT count(*)::int n FROM pg_constraint WHERE conname='sso_emergency_approver_rule_held'")).rows[0].n).toBe(1);
          await owner.query("ALTER TABLE identity.sso_emergency_approver_rule DROP CONSTRAINT sso_emergency_approver_rule_held");
          await owner.query("INSERT INTO identity.sso_emergency_approver_rule(id,version,definition) VALUES($1,'fixture.v1','{}')", [rule]);
        }
        await owner.query("INSERT INTO identity.sso_emergency_approval(tenant_id,id,membership_id,rule_id,approver_ref,reason_hash,approved_at,expires_at) VALUES($1,$2,$3,$4,'owner-fixture',$5,clock_timestamp(),clock_timestamp()+interval '20 minutes')", [f.principal.tenantId, approval, f.principal.membershipId, rule, "a".repeat(64)]);
        // The approval must be committed before either independent identity transaction starts.
        await owner.query("COMMIT");
      } catch (error) { await owner.query("ROLLBACK"); throw error; } finally { owner.release(); }

      const before = await snapshot(), earlierAudit = await audit(f.principal.tenantId);
      const allEarlierAudit = (await admin.query("SELECT * FROM app.audit_event ORDER BY tenant_id,sequence")).rows;
      const revisionsBefore = (await admin.query("SELECT * FROM identity.sso_required_event WHERE tenant_id=$1 ORDER BY revision", [f.principal.tenantId])).rows;
      const logsBefore = (await admin.query("SELECT * FROM identity.sso_emergency_event WHERE tenant_id=$1 ORDER BY created_at,id", [f.principal.tenantId])).rows;
      const first = await identity.connect(), second = await identity.connect(), blocker = await admin.connect();
      const input = { version: "sso-emergency.v1", requested_tenant_id: f.principal.tenantId, reason: "Synthetic concurrent emergency fixture reason" };
      let race: ReturnType<SsoRequiredRepository["emergency"]>[] = [];
      try {
        const pids = [(await first.query("SELECT pg_backend_pid() pid")).rows[0].pid, (await second.query("SELECT pg_backend_pid() pid")).rows[0].pid];
        expect(new Set(pids).size).toBe(2);
        await blocker.query("BEGIN");
        await blocker.query("SELECT pg_advisory_xact_lock(hashtextextended($1,54))", [f.principal.tenantId]);
        race = [repositoryFor(first).emergency(f.principal.identityUserId, input), repositoryFor(second).emergency(f.principal.identityUserId, input)];
        const outcomes = Promise.all(race);
        // Capture rejection immediately as well as awaiting below, including failures while waiting on the lock.
        void outcomes.catch(() => undefined);
        await bothWaiting(pids);
        await blocker.query("COMMIT");
        const results = await outcomes;
        expect(results.filter(r => r.used)).toHaveLength(1);
        expect(results.filter(r => !r.used)).toEqual([{ used: false, cause: "EMERGENCY_ALREADY_USED", connectionId: f.connectionId, actorMembershipId: f.principal.membershipId }]);
        expect(results.find(r => r.used)).toEqual({ used: true, cause: "EMERGENCY_USED", connectionId: f.connectionId, actorMembershipId: f.principal.membershipId });
      } finally {
        await blocker.query("ROLLBACK");
        await Promise.allSettled(race);
        first.release(); second.release(); blocker.release();
      }
      expect(await snapshot()).toEqual(before);
      const revisionsAfter = (await admin.query("SELECT * FROM identity.sso_required_event WHERE tenant_id=$1 ORDER BY revision", [f.principal.tenantId])).rows;
      expect(revisionsAfter.slice(0, revisionsBefore.length)).toEqual(revisionsBefore);
      expect(revisionsAfter).toHaveLength(revisionsBefore.length + 1);
      expect(revisionsAfter.at(-1)).toMatchObject({ required: false, revision: iteration * 2 + 2, actor_kind: "emergency" });
      const uses = (await admin.query("SELECT * FROM identity.sso_emergency_use WHERE tenant_id=$1 AND approval_id=$2", [f.principal.tenantId, approval])).rows;
      expect(uses).toHaveLength(1);
      expect(uses[0].event_id).toBe(revisionsAfter.at(-1).id);
      expect((await admin.query("SELECT count(*)::int n FROM identity.sso_emergency_use WHERE tenant_id=$1", [f.principal.tenantId])).rows[0].n).toBe(iteration + 1);
      const afterAudit = await audit(f.principal.tenantId);
      expect(afterAudit.slice(0, earlierAudit.length)).toEqual(earlierAudit);
      expect((await admin.query("SELECT * FROM app.audit_event WHERE id=ANY($1::uuid[]) ORDER BY tenant_id,sequence", [allEarlierAudit.map(r => r.id)])).rows).toEqual(allEarlierAudit);
      expect((await admin.query("SELECT count(*)::int n FROM app.audit_event")).rows[0].n).toBe(allEarlierAudit.length + 2);
      expect(afterAudit.slice(earlierAudit.length).map(r => ({ type: r.event_type, code: r.payload.references.code }))).toEqual([
        { type: "sso.emergency.used", code: "EMERGENCY_USED" },
        { type: "sso.emergency.refused", code: "EMERGENCY_ALREADY_USED" },
      ]);
      const logsAfter = (await admin.query("SELECT * FROM identity.sso_emergency_event WHERE tenant_id=$1 ORDER BY created_at,id", [f.principal.tenantId])).rows;
      expect(logsAfter.slice(0, logsBefore.length)).toEqual(logsBefore);
      expect(logsAfter.slice(logsBefore.length).map(r => ({ outcome: r.outcome, cause: r.cause_code }))).toEqual([
        { outcome: "used", cause: "EMERGENCY_USED" }, { outcome: "refused", cause: "EMERGENCY_ALREADY_USED" },
      ]);
    }
  }, 30000);
});
