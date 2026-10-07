import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IdentityRepository, MIGRATION_URLS, migrate, withTenant, listAccounts, UserCommandDispatcher } from "../src/index.js";
import { PersistedAuthProvider } from "../../../apps/api/src/auth/persisted-auth-provider.js";
import { resolveVerifiedTenantContext } from "../../../apps/api/src/auth/principal-bridge.js";
import { FixtureIdentityEmail } from "../../../apps/api/src/auth/identity-email.js";
import { IdentityApplication } from "../../../apps/api/src/auth/identity.application.js";
import { closeTestPools } from "./pool-test-utils.js";
let postgres:EmbeddedPostgres, admin:Pool, identity:Pool, runtime:Pool, directory:string;
let now=Date.now();
const secret="synthetic-identity-key-longer-than-32-characters",origin="https://jobguard.invalid";
const fixture=(code="12345678")=>new PersistedAuthProvider(new IdentityRepository(identity),secret,new FixtureIdentityEmail(),"synthetic_demo",()=>now,()=>code);
const email=()=>`${randomUUID()}@practice.invalid`;
async function signup(address=email()) {
 const provider=fixture(); await provider.requestCode({email:address,purpose:"signup",ip:randomUUID()});
 const session=await provider.verifyCode(address,"signup","12345678"),principal=(await provider.authenticate(session.sessionToken))!;
 const membership=(await provider.memberships(principal))[0]!;
 return {provider,session,principal,membership,address};
}
beforeAll(async()=>{
 directory=await mkdtemp(join(tmpdir(),"jobguard-identity-pg16-"));const port=57000+Math.floor(Math.random()*500);
 postgres=new EmbeddedPostgres({databaseDir:directory,port,user:"postgres",password:"fixture-only",persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C"],onLog:()=>undefined});
 await postgres.initialise();await postgres.start();
 const base={host:"127.0.0.1",port,database:"postgres"};admin=new Pool({...base,user:"postgres",password:"fixture-only"});
 // Upgrade from exactly the state before identity (including merged 0053), then repeat the runner.
 await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
 const identityIndex=MIGRATION_URLS.findIndex(url=>url.pathname.endsWith("/0098_persisted_identity.sql"));
 expect(identityIndex).toBe(MIGRATION_URLS.length-1);
 expect(identityIndex).toBe(44);
 for(const url of MIGRATION_URLS.slice(0,identityIndex)){await admin.query(await readFile(url,"utf8"));await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[url.pathname.split("/").at(-1)]);}
 expect((await admin.query("SELECT migration_name FROM public.jobguard_schema_migration ORDER BY migration_name")).rows.map(row=>row.migration_name)).toEqual(MIGRATION_URLS.slice(0,identityIndex).map(url=>url.pathname.split("/").at(-1)));
 expect((await admin.query("SELECT to_regclass('identity.challenge') AS challenge")).rows[0].challenge).toBeNull();
 await migrate(admin);await migrate(admin);
 expect((await admin.query("SELECT count(*)::int n FROM public.jobguard_schema_migration")).rows[0].n).toBe(45);
 expect((await admin.query("SELECT to_regclass('identity.challenge') AS challenge")).rows[0].challenge).toBe("identity.challenge");
 await admin.query("ALTER ROLE jobguard_identity LOGIN PASSWORD 'identity-fixture'; ALTER ROLE jobguard_runtime LOGIN PASSWORD 'runtime-fixture'");
 identity=new Pool({...base,user:"jobguard_identity",password:"identity-fixture",max:5});runtime=new Pool({...base,user:"jobguard_runtime",password:"runtime-fixture"});
},60000);
afterAll(async()=>{await closeTestPools(identity,runtime,admin);await postgres?.stop();if(directory)await rm(directory,{recursive:true,force:true});});

describe("M0-6L persisted identity / actual PostgreSQL roles",()=>{
 it("creates one tenant under concurrent use and survives a new provider instance",async()=>{
  const address=email(),provider=fixture();await provider.requestCode({email:address,purpose:"signup",ip:randomUUID()});
  const results=await Promise.allSettled([provider.verifyCode(address,"signup","12345678"),fixture().verifyCode(address,"signup","12345678")]);
  const successes=results.filter((r):r is PromiseFulfilledResult<{sessionToken:string;csrfToken:string}>=>r.status==="fulfilled");expect(successes).toHaveLength(1);
  const p=(await fixture().authenticate(successes[0]!.value.sessionToken))!;expect(p).toBeDefined();
  for(const environment of ["pilot_no_charge","production"])expect(await new PersistedAuthProvider(new IdentityRepository(identity),secret,new FixtureIdentityEmail(),environment,()=>now).authenticate(successes[0]!.value.sessionToken)).toBeUndefined();
  const rows=await fixture().memberships(p);expect(rows).toHaveLength(1);expect(rows[0]!.role).toBe("owner");
  expect((await admin.query("SELECT count(*)::int n FROM identity.membership_locator WHERE user_id=$1",[p.identityUserId])).rows[0].n).toBe(1);
  await expect(provider.verifyCode(address,"signup","12345678")).rejects.toMatchObject({code:"INVALID_CODE"});
  now+=60001;await fixture().requestCode({email:address,purpose:"signup",ip:randomUUID()});await fixture().verifyCode(address,"signup","12345678");
  expect(await fixture().memberships(p)).toHaveLength(1);
  const outsider=randomUUID();await admin.query("INSERT INTO identity.identity_user(id) VALUES($1)",[outsider]);
  await expect(admin.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3)",[outsider,rows[0]!.tenantId,rows[0]!.id])).rejects.toMatchObject({code:"23503"});
 });
 it("commits failed attempts, enforces expiry, cooldown and IP throttle across replicas",async()=>{
  const address=email(),p=fixture();await p.requestCode({email:address,purpose:"signup",ip:randomUUID()});
  await expect(fixture().requestCode({email:address,purpose:"signup",ip:randomUUID()})).rejects.toMatchObject({code:"RATE_LIMITED"});
  for(let n=0;n<5;n++)await expect(fixture().verifyCode(address,"signup","87654321")).rejects.toMatchObject({code:"INVALID_CODE"});
  expect((await admin.query("SELECT attempts FROM identity.challenge WHERE email=$1",[address])).rows[0].attempts).toBe(5);
  await expect(p.verifyCode(address,"signup","12345678")).rejects.toMatchObject({code:"INVALID_CODE"});
  now+=60001;await p.requestCode({email:address,purpose:"signup",ip:randomUUID()});now+=600000;
  await expect(p.verifyCode(address,"signup","12345678")).rejects.toMatchObject({code:"INVALID_CODE"});
  const superseded=email();await fixture("12345678").requestCode({email:superseded,purpose:"signup",ip:randomUUID()});
  now+=60001;await fixture("87654321").requestCode({email:superseded,purpose:"signup",ip:randomUUID()});
  await expect(fixture().verifyCode(superseded,"signup","12345678")).rejects.toMatchObject({code:"INVALID_CODE"});
  await fixture().verifyCode(superseded,"signup","87654321");
  const ip=randomUUID();await Promise.all(Array.from({length:10},()=>fixture().requestCode({email:email(),purpose:"signup",ip})));
  await expect(p.requestCode({email:email(),purpose:"signup",ip})).rejects.toMatchObject({code:"RATE_LIMITED"});
 });
 it("acknowledges existing/unknown signins equally and stores no raw codes or tokens",async()=>{
  const owner=await signup();const unknown=email();
  for(const address of [owner.address,unknown])expect(await fixture().requestCode({email:address,purpose:"signin",ip:randomUUID()})).toEqual({accepted:true,fixtureCode:"12345678"});
  await expect(fixture().verifyCode(unknown,"signin","12345678")).rejects.toMatchObject({code:"INVALID_CODE"});
  const challenges=(await admin.query("SELECT row_to_json(c)::text value FROM identity.challenge c")).rows;expect(challenges.some(r=>r.value.includes('"12345678"'))).toBe(false);
  const sessions=(await admin.query("SELECT row_to_json(s)::text value FROM identity.session s")).rows;expect(sessions.some(r=>r.value.includes(owner.session.sessionToken))).toBe(false);
 });
 it("binds invited email, tenant and role and rejects self-selected elevation",async()=>{
  const owner=await signup(),other=await signup(),app=new IdentityApplication(owner.provider,origin),recipient=email();
  const credentials={sessionToken:owner.session.sessionToken,csrfToken:owner.session.csrfToken,origin,tenantHeader:owner.membership.tenantId};
  await expect(app.invite({version:"identity-invitation.v1",requested_tenant_id:other.membership.tenantId,email:recipient,role:"foreman"},credentials)).rejects.toMatchObject({code:"TENANT_FORBIDDEN"});
  await expect(app.invite({version:"identity-invitation.v1",requested_tenant_id:other.membership.tenantId,email:recipient,role:"foreman"},{...credentials,tenantHeader:other.membership.tenantId})).rejects.toMatchObject({code:"TENANT_FORBIDDEN"});
  await expect(app.invite({version:"identity-invitation.v1",requested_tenant_id:owner.membership.tenantId,email:recipient,role:"owner"},credentials)).rejects.toThrow();
  const invitation=await app.invite({version:"identity-invitation.v1",requested_tenant_id:owner.membership.tenantId,email:recipient,role:"foreman"},credentials);
  await expect(admin.query("UPDATE identity.invitation SET role='admin' WHERE id=$1",[invitation.id])).rejects.toMatchObject({code:"55000"});
  const wrong=email();await fixture().requestCode({email:wrong,purpose:"invitation",invitationId:invitation.id,ip:randomUUID()});
  await expect(fixture().verifyCode(wrong,"invitation","12345678",invitation.id)).rejects.toMatchObject({code:"INVALID_CODE"});
  await fixture().requestCode({email:recipient,purpose:"invitation",invitationId:invitation.id,ip:randomUUID()});
  await expect(fixture().verifyCode(recipient,"invitation","12345678",randomUUID())).rejects.toMatchObject({code:"INVALID_CODE"});
  const session=await fixture().verifyCode(recipient,"invitation","12345678",invitation.id),p=(await fixture().authenticate(session.sessionToken))!;
  expect(await fixture().memberships(p)).toEqual([expect.objectContaining({tenantId:owner.membership.tenantId,role:"foreman",email:recipient})]);
  await expect(app.invite({version:"identity-invitation.v1",requested_tenant_id:owner.membership.tenantId,email:email(),role:"admin"},{sessionToken:session.sessionToken,csrfToken:session.csrfToken,origin})).rejects.toMatchObject({code:"42501"});
 });
 it("rejects expired invitations and revocation before new business commands",async()=>{
  const owner=await signup(),app=new IdentityApplication(owner.provider,origin),recipient=email();
  const invitation=await app.invite({version:"identity-invitation.v1",requested_tenant_id:owner.membership.tenantId,email:recipient,role:"operative"},{sessionToken:owner.session.sessionToken,csrfToken:owner.session.csrfToken,origin});
  const expiredId=randomUUID();
  await admin.query("INSERT INTO identity.invitation(id,email,tenant_id,account_id,role,expires_at,issuer_user_id) SELECT $2,email,tenant_id,account_id,role,clock_timestamp()-interval '1 second',issuer_user_id FROM identity.invitation WHERE id=$1",[invitation.id,expiredId]);
  await fixture().requestCode({email:recipient,purpose:"invitation",invitationId:expiredId,ip:randomUUID()});
  await expect(fixture().verifyCode(recipient,"invitation","12345678",expiredId)).rejects.toMatchObject({code:"INVALID_CODE"});
  const request={sessionToken:owner.session.sessionToken,csrfToken:owner.session.csrfToken,origin,requestedTenantId:owner.membership.tenantId};
  const context=await resolveVerifiedTenantContext(owner.provider,request,origin);
  expect(await withTenant(runtime,context,listAccounts)).toHaveLength(1);
  await admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2",[owner.membership.tenantId,owner.membership.id]);
  await expect(resolveVerifiedTenantContext(fixture(),request,origin)).rejects.toMatchObject({code:"TENANT_FORBIDDEN"});
  await expect(new UserCommandDispatcher(runtime).dispatch(context,{version:"command.v1",commandId:randomUUID(),commandType:"fixture.action",semanticKey:randomUUID(),actorMembershipId:owner.membership.id,subjectType:"fixture",subjectRef:"fixture",action:{actionType:"fixture",recipient:null,contentHash:"a".repeat(64),aggregateRevision:0,amountPence:null,currency:null,policyVersion:"fixture.v1",expiresAt:new Date(Date.now()+60000)}},{mutate:async()=>({})})).rejects.toMatchObject({code:"FORBIDDEN"});
  expect((await admin.query("SELECT count(*)::int n FROM app.command_receipt WHERE tenant_id=$1",[owner.membership.tenantId])).rows[0].n).toBe(0);
  await admin.query("UPDATE identity.session SET revoked_at=clock_timestamp() WHERE id=$1",[owner.principal.sessionId]);expect(await fixture().authenticate(owner.session.sessionToken)).toBeUndefined();
 });
 it("persists unknown delivery and session/membership expiry without claiming a send",async()=>{
  class UnavailableFixture extends FixtureIdentityEmail { override async deliver():Promise<{environment:"synthetic_demo";externalActions:0}> {throw new Error("fixture transport unavailable");} }
  const address=email(),p=new PersistedAuthProvider(new IdentityRepository(identity),secret,new UnavailableFixture(),"synthetic_demo",()=>now,()=>"12345678");
  await expect(p.requestCode({email:address,purpose:"signup",ip:randomUUID()})).rejects.toMatchObject({code:"DELIVERY_UNAVAILABLE"});
  expect((await admin.query("SELECT delivery_state FROM identity.challenge WHERE email=$1",[address])).rows[0].delivery_state).toBe("outcome_unknown");
  await expect(fixture().requestCode({email:address,purpose:"signup",ip:randomUUID()})).rejects.toMatchObject({code:"RATE_LIMITED"});
  const owner=await signup();
  await admin.query("UPDATE app.membership SET expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2",[owner.membership.tenantId,owner.membership.id]);
  expect(await fixture().findMembership(owner.principal,owner.membership.tenantId)).toBeUndefined();
  await admin.query("UPDATE identity.session SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[owner.principal.sessionId]);
  expect(await fixture().authenticate(owner.session.sessionToken)).toBeUndefined();
 });
 it("rolls back provisioning failure, keeps credentials separate and catalogs every exception",async()=>{
  const address=email(),p=fixture();await p.requestCode({email:address,purpose:"signup",ip:randomUUID()});
  const tenantCount=(await admin.query("SELECT count(*)::int n FROM control_plane.tenant")).rows[0].n;
  await admin.query("CREATE FUNCTION identity.fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture fault'; END $$; CREATE TRIGGER fixture_fault BEFORE INSERT ON identity.session FOR EACH ROW EXECUTE FUNCTION identity.fixture_fail()");
  try{await expect(p.verifyCode(address,"signup","12345678")).rejects.toThrow("fixture fault");}finally{await admin.query("DROP TRIGGER fixture_fault ON identity.session; DROP FUNCTION identity.fixture_fail()");}
  expect((await admin.query("SELECT user_id FROM identity.user_email WHERE email=$1",[address])).rows).toEqual([]);
  expect((await admin.query("SELECT count(*)::int n FROM control_plane.tenant")).rows[0].n).toBe(tenantCount);
  expect((await admin.query("SELECT consumed_at,attempts FROM identity.challenge WHERE email=$1",[address])).rows[0]).toEqual({consumed_at:null,attempts:0});
  await p.verifyCode(address,"signup","12345678");
  for(const table of ["challenge","session","invitation","user_email","membership_locator","request_window","security_event"]){
   await expect(runtime.query(`SELECT * FROM identity.${table}`)).rejects.toMatchObject({code:"42501"});
   await expect(runtime.query(`INSERT INTO identity.${table} DEFAULT VALUES`)).rejects.toMatchObject({code:"42501"});
  }
  await expect(identity.query("SELECT * FROM app.membership")).rejects.toMatchObject({code:"42501"});
  await expect(identity.query("UPDATE identity.session SET user_id=user_id")).rejects.toMatchObject({code:"42501"});
  await expect(identity.query("UPDATE identity.session SET token_digest=token_digest")).rejects.toMatchObject({code:"42501"});
  await expect(identity.query("UPDATE identity.challenge SET email=email")).rejects.toMatchObject({code:"42501"});
  await expect(identity.query("UPDATE identity.challenge SET digest=digest")).rejects.toMatchObject({code:"42501"});
  await expect(identity.query("SET ROLE jobguard_runtime")).rejects.toMatchObject({code:"42501"});
  await expect(identity.query("DELETE FROM identity.security_event")).rejects.toMatchObject({code:"42501"});
  await expect(identity.query("TRUNCATE identity.challenge")).rejects.toMatchObject({code:"42501"});
  expect((await admin.query("SELECT rolsuper,rolbypassrls,rolcreaterole,rolcreatedb,rolinherit FROM pg_roles WHERE rolname='jobguard_identity'")).rows[0]).toEqual({rolsuper:false,rolbypassrls:false,rolcreaterole:false,rolcreatedb:false,rolinherit:false});
  expect((await admin.query("SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='identity' AND c.relkind='r' AND pg_get_userbyid(c.relowner)<>'jobguard_migration'")).rows[0].n).toBe(0);
  expect((await admin.query("SELECT count(*)::int n FROM pg_proc p JOIN pg_namespace ns ON ns.oid=p.pronamespace WHERE ns.nspname='identity' AND p.prosecdef AND has_function_privilege('jobguard_runtime',p.oid,'EXECUTE')")).rows[0].n).toBe(0);
 });
 // Round 2 (Sol P2 #2): a membership locator survives revocation/expiry, so a fresh invitation must be able to replace an
 // INACTIVE membership (new membership row, locator repointed, history kept) while an ACTIVE one still blocks it.
 async function invitationFor(owner:Awaited<ReturnType<typeof signup>>,recipient:string,role:string){
  const app=new IdentityApplication(owner.provider,origin);
  return (await app.invite({version:"identity-invitation.v1",requested_tenant_id:owner.membership.tenantId,email:recipient,role} as never,{sessionToken:owner.session.sessionToken,csrfToken:owner.session.csrfToken,origin})).id;
 }
 async function accept(address:string,invitationId:string){
  await fixture().requestCode({email:address,purpose:"invitation",invitationId,ip:randomUUID()});
  return fixture().verifyCode(address,"invitation","12345678",invitationId);
 }
 const membershipRows=(tenantId:string,userEmail:string)=>admin.query("SELECT m.id,m.role,m.revoked_at,m.expires_at FROM app.membership m JOIN identity.user_email e ON e.user_id=m.identity_user_id WHERE m.tenant_id=$1 AND e.email=$2 ORDER BY m.created_at,m.id",[tenantId,userEmail]).then(r=>r.rows);
 for(const reason of ["revoked","expired"] as const)it(`lets a ${reason} member accept a fresh invitation, preserving the old membership row`,async()=>{
  const owner=await signup(),tenantId=owner.membership.tenantId,recipient=email();
  const first=await accept(recipient,await invitationFor(owner,recipient,"foreman")),principal=(await fixture().authenticate(first.sessionToken))!;
  const before=await fixture().memberships(principal);expect(before).toEqual([expect.objectContaining({tenantId,role:"foreman"})]);
  await admin.query(reason==="revoked"?"UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2":"UPDATE app.membership SET expires_at=clock_timestamp()-interval '1 second' WHERE tenant_id=$1 AND id=$2",[tenantId,before[0]!.id]);
  expect(await fixture().memberships(principal)).toEqual([]);
  now+=60001;const fresh=await invitationFor(owner,recipient,"estimator"),second=await accept(recipient,fresh);
  const after=await fixture().memberships((await fixture().authenticate(second.sessionToken))!);
  expect(after).toEqual([expect.objectContaining({tenantId,role:"estimator",email:recipient})]);expect(after[0]!.id).not.toBe(before[0]!.id);
  const rows=await membershipRows(tenantId,recipient);expect(rows).toHaveLength(2);
  const old=rows.find(r=>r.id===before[0]!.id)!;expect(old.role).toBe("foreman");expect(reason==="revoked"?old.revoked_at:old.expires_at).not.toBeNull();
  expect((await admin.query("SELECT membership_id FROM identity.membership_locator WHERE user_id=$1 AND tenant_id=$2",[principal.identityUserId,tenantId])).rows).toEqual([{membership_id:after[0]!.id}]);
  expect((await admin.query("SELECT accepted_at FROM identity.invitation WHERE id=$1",[fresh])).rows[0].accepted_at).not.toBeNull();
  // The replaced membership stays dead: the original one is still revoked/expired and a stale session cannot revive it.
  expect(await fixture().findMembership(principal,tenantId)).toMatchObject({id:after[0]!.id});
 });
 it("still refuses an invitation to a member whose membership is active, and leaves the invitation unused",async()=>{
  const owner=await signup(),tenantId=owner.membership.tenantId,recipient=email();
  const first=await accept(recipient,await invitationFor(owner,recipient,"foreman")),principal=(await fixture().authenticate(first.sessionToken))!;
  now+=60001;const again=await invitationFor(owner,recipient,"admin");
  await expect(accept(recipient,again)).rejects.toMatchObject({code:"INVALID_CODE"});
  expect(await membershipRows(tenantId,recipient)).toHaveLength(1);
  expect(await fixture().memberships(principal)).toEqual([expect.objectContaining({tenantId,role:"foreman"})]);
  expect((await admin.query("SELECT accepted_at FROM identity.invitation WHERE id=$1",[again])).rows[0].accepted_at).toBeNull();
 });
 it("creates exactly one replacement membership when a revoked member's fresh invitation is verified concurrently",async()=>{
  const owner=await signup(),tenantId=owner.membership.tenantId,recipient=email();
  const first=await accept(recipient,await invitationFor(owner,recipient,"foreman")),principal=(await fixture().authenticate(first.sessionToken))!;
  await admin.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND identity_user_id=$2",[tenantId,principal.identityUserId]);
  now+=60001;const fresh=await invitationFor(owner,recipient,"finance");
  await fixture().requestCode({email:recipient,purpose:"invitation",invitationId:fresh,ip:randomUUID()});
  const results=await Promise.allSettled([1,2,3].map(()=>fixture().verifyCode(recipient,"invitation","12345678",fresh)));
  expect(results.filter(r=>r.status==="fulfilled")).toHaveLength(1);
  for(const failed of results.filter(r=>r.status==="rejected"))expect((failed as PromiseRejectedResult).reason).toMatchObject({code:"INVALID_CODE"});
  expect(await membershipRows(tenantId,recipient)).toHaveLength(2);
  expect((await admin.query("SELECT count(*)::int n FROM identity.membership_locator WHERE user_id=$1 AND tenant_id=$2",[principal.identityUserId,tenantId])).rows[0].n).toBe(1);
  expect(await fixture().memberships(principal)).toEqual([expect.objectContaining({tenantId,role:"finance"})]);
 });
});
