import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { MIGRATION_URLS, migrate } from "../src/migrate.js";
import { createWorkFixture, closeWorkFixture, workTenant, type WorkFixture } from "./job-work-state-fixtures.js";
import { meterCompany } from "./meter-persistence-fixtures.js";
import { installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";
let f: WorkFixture, machine: Pool;
type Company = Awaited<ReturnType<typeof meterCompany>>;
const token = "fictional-machine-connection-token-0001";
const version = "connector-machine-command.v1";
const input = {version:"connector-input.v1",eventId:"fixture:event",subject:"fixture:order",revision:1,kind:"work_order",document:"fixture:doc"};
const own = "0991_connector_machine.sql";
const manage = (a:Company,c:string,op:string,v:unknown,command=randomUUID()) => workTenant(f.runtime,a.tenantId,async db =>
  (await db.query("SELECT app.connector_machine_command($1,$2,$3,$4,$5,$6::jsonb) value",[a.tenantId,a.digest,command,c,op,JSON.stringify(v)])).rows[0]!.value);
const authority = async(c:string,secret=token) => (await machine.query("SELECT connector.machine_authority($1,$2) value",[c,secret])).rows[0]!.value;
async function setup() {
  const a=await meterCompany(f),c=randomUUID(),command=randomUUID();
  const v={version,clientContract:"fixture:contract",namespace:"fixture:namespace",tokenHash:createHash("sha256").update(token).digest("hex"),keyRef:"fixture:key",expiresAt:new Date(Date.now()+172800000).toISOString(),capabilities:["work_order"]};
  const result=await manage(a,c,"provision",v,command);
  return {a,c,v,command,result};
}
const stage = async(c:string,expected:unknown,nonce="fictional_nonce_0001",key="fixture:key",value:unknown=input,stamp=Math.floor(Date.now()/1000)) =>
  (await machine.query("SELECT connector.machine_stage($1,$2,$3::jsonb,$4,$5,$6::bigint,$7::jsonb) value",[c,token,JSON.stringify(expected),key,nonce,stamp,JSON.stringify(value)])).rows[0]!.value;
beforeAll(async()=>{
  f=await createWorkFixture(false);
  const index=MIGRATION_URLS.findIndex(u=>u.pathname.endsWith(own));
  expect(index).toBeGreaterThan(0);
  await f.admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  for(const url of MIGRATION_URLS.slice(0,index)){await f.admin.query(await readFile(url,"utf8"));await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[url.pathname.split('/').at(-1)]);}
  await installLegacySyntheticPartyFixtures(f.admin);
  const historical=await meterCompany(f);
  const row=(await f.admin.query("SELECT to_jsonb(j) value FROM app.job j WHERE tenant_id=$1",[historical.tenantId])).rows;
  const routines=(await f.admin.query("SELECT oid,pg_get_functiondef(oid) definition FROM pg_proc WHERE pronamespace='connector'::regnamespace ORDER BY oid")).rows;
  await f.admin.query(await readFile(MIGRATION_URLS[index]!,"utf8"));
  expect((await f.admin.query("SELECT to_jsonb(j) value FROM app.job j WHERE tenant_id=$1",[historical.tenantId])).rows).toEqual(row);
  for(const r of routines)expect((await f.admin.query("SELECT pg_get_functiondef($1::oid) definition",[r.oid])).rows[0]!.definition).toBe(r.definition);
  await f.admin.query("INSERT INTO public.jobguard_schema_migration(migration_name) VALUES($1)",[own]);
  await migrate(f.admin);await migrate(f.admin);
  const secret=randomUUID(),login=`machine_${randomUUID().replaceAll('-','')}`;
  await f.admin.query(`CREATE ROLE ${login} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD '${secret}'; GRANT jobguard_machine TO ${login}`);
  machine=new Pool({...f.admin.options,user:login,password:secret,max:2,options:"-c role=jobguard_machine"});
  // The ordinary test runtime login receives only the pre-existing business role.
  const runtimeLogin=`machine_owner_${randomUUID().replaceAll('-','')}`;
  await f.admin.query(`CREATE ROLE ${runtimeLogin} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD '${secret}'; GRANT jobguard_runtime TO ${runtimeLogin}`);
  await f.runtime.end(); f.runtime=new Pool({...f.admin.options,user:runtimeLogin,password:secret,max:2});
},180000);
afterAll(async()=>{await machine?.end();await closeWorkFixture(f);});
describe("ENT-13a persisted machine authority RED",()=>{
  it("owner commands are idempotent, versioned and audited; sponsor is separate from machine",async()=>{
    const s=await setup();expect(await manage(s.a,s.c,"provision",s.v,s.command)).toEqual(s.result);
    await expect(manage(s.a,s.c,"provision",{...s.v,namespace:"fixture:changed"},s.command)).rejects.toThrow();
    expect(s.result.machineActor).not.toBe(s.a.actorId);
    await manage(s.a,s.c,"widen",{version,capabilities:["work_order","materials_issue"]});
    expect((await authority(s.c)).capabilityVersion).toBe(2);
    expect((await f.admin.query("SELECT revision FROM connector.machine_capability WHERE connection_id=$1 ORDER BY revision",[s.c])).rows).toEqual([{revision:1},{revision:2}]);
    expect((await f.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND event_type LIKE 'connector.machine_%'",[s.a.tenantId])).rows[0]!.n).toBe(2);
    const other=await meterCompany(f);
    await expect(manage(other,s.c,"revoke",{version})).rejects.toThrow();
    await f.admin.query("UPDATE app.membership SET role='admin' WHERE tenant_id=$1 AND id=$2",[s.a.tenantId,s.a.actorId]);
    await expect(manage(s.a,s.c,"rotate",{version,keyRef:"fixture:other"})).rejects.toThrow();
  });
  it("refuses concurrent replay, skew, wrong tenant/environment/contract and unlisted capability in SQL",async()=>{
    const s=await setup(),auth=await authority(s.c);
    const results=await Promise.allSettled([stage(s.c,auth),stage(s.c,auth)]);
    expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
    expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
    for(const patch of [{tenantId:randomUUID()},{environment:"production"},{clientContract:"fixture:other"},{capabilityVersion:2}])
      await expect(stage(s.c,{...auth,...patch},randomUUID())).rejects.toThrow();
    await expect(stage(s.c,auth,randomUUID(),"fixture:key",{...input,kind:"materials_issue"})).rejects.toThrow();
    await expect(stage(s.c,auth,randomUUID(),"fixture:key",input,Math.floor(Date.now()/1000)-301)).rejects.toThrow();
    await expect(authority(s.c,"wrong-token-at-least-thirty-two-bytes-long")).rejects.toThrow();
    expect((await f.admin.query("SELECT count(*)::int n FROM connector.machine_nonce WHERE connection_id=$1",[s.c])).rows[0]!.n).toBe(1);
  });
  it("rotation overlaps at most 24 hours, then old key refuses even replay; revoke/disconnect stop the next request",async()=>{
    for(const op of ["revoke","disconnect"]){
      const s=await setup(),old=await authority(s.c);await stage(s.c,old);
      await manage(s.a,s.c,"rotate",{version,keyRef:"fixture:next"});
      const current=await authority(s.c);expect(current.keyRefs).toEqual(["fixture:key","fixture:next"]);
      expect((await f.admin.query("SELECT valid_until<=clock_timestamp()+interval '24 hours' bounded FROM connector.machine_key WHERE connection_id=$1 AND key_ref='fixture:key'",[s.c])).rows[0]!.bounded).toBe(true);
      await stage(s.c,current,randomUUID());
      await f.admin.query("UPDATE connector.machine_key SET valid_until=clock_timestamp()-interval '1 second' WHERE connection_id=$1 AND key_ref='fixture:key'",[s.c]);
      await expect(stage(s.c,current,randomUUID())).rejects.toThrow();
      await manage(s.a,s.c,op,{version});
      await expect(authority(s.c)).rejects.toThrow();await expect(stage(s.c,current,randomUUID())).rejects.toThrow();
    }
    const expired=await setup();const auth=await authority(expired.c);
    await f.admin.query("UPDATE connector.binding SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",[expired.c]);
    await expect(stage(expired.c,auth)).rejects.toThrow();
  });
  it("failed staging rolls nonce back; successful fresh nonce deduplicates an old source receipt",async()=>{
    const s=await setup(),auth=await authority(s.c);
    await expect(stage(s.c,auth,"fictional_nonce_0001","fixture:key",{...input,origin:"site"})).rejects.toThrow();
    const first=await stage(s.c,auth);expect(await stage(s.c,auth,"fictional_nonce_0002")).toEqual(first);
    expect((await f.admin.query("SELECT count(*)::int n FROM connector.input_event WHERE tenant_id=$1",[s.a.tenantId])).rows[0]!.n).toBe(1);
  });
  it("machine role has no member, legacy intake or direct table capability; private tables FORCE RLS",async()=>{
    for(const sql of ["SET ROLE jobguard_runtime","SET ROLE jobguard_connector","SELECT connector.intake(NULL,NULL,NULL)","SELECT app.connector_machine_command(NULL,NULL,NULL,NULL,NULL,NULL)","SELECT * FROM app.membership","SELECT * FROM connector.machine_connection","TRUNCATE connector.machine_nonce"])
      await expect(machine.query(sql)).rejects.toMatchObject({code:"42501"});
    expect((await f.admin.query("SELECT relname FROM pg_class WHERE relnamespace='connector'::regnamespace AND relname LIKE 'machine_%' AND relkind='r' AND (NOT relrowsecurity OR NOT relforcerowsecurity)")).rows).toEqual([]);
    expect((await f.admin.query("SELECT 1 FROM pg_auth_members WHERE member='jobguard_machine'::regrole")).rows).toEqual([]);
  });
});
