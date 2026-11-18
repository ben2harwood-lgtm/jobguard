import {createHash,randomUUID} from "node:crypto";import {mkdtemp,rm} from "node:fs/promises";import {tmpdir} from "node:os";import {join} from "node:path";import EmbeddedPostgres from "embedded-postgres";import {Pool} from "pg";import {afterAll,beforeAll,describe,expect,it} from "vitest";import {bootstrapSyntheticDemo,readSyntheticDemo,issuePracticeSession,SandboxRepository} from "../src/index.js";import {closeTestPools,freePort} from "./pool-test-utils.js";
let pg:EmbeddedPostgres,admin:Pool,proof:Pool,runtime:Pool,dir:string,repo:SandboxRepository;let port:number;const password="synthetic";
beforeAll(async()=>{port=await freePort(57500,100);dir=await mkdtemp(join(tmpdir(),"sandbox-pg-"));pg=new EmbeddedPostgres({databaseDir:dir,port,user:"postgres",password,persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C","--encoding=UTF8"],onLog:()=>undefined});await pg.initialise();await pg.start();admin=new Pool({host:"127.0.0.1",port,user:"postgres",password});await admin.query(`CREATE ROLE neondb_owner LOGIN PASSWORD '${password}' CREATEROLE NOSUPERUSER NOCREATEDB NOINHERIT NOBYPASSRLS`);await admin.query(`CREATE DATABASE jobguard_synthetic_demo OWNER neondb_owner`);process.env.JOBGUARD_ENV="synthetic_demo";await bootstrapSyntheticDemo({ownerUrl:`postgresql://neondb_owner:${password}@127.0.0.1:${port}/jobguard_synthetic_demo`,runtimeUrl:`postgresql://jobguard_runtime:${password}@127.0.0.1:${port}/jobguard_synthetic_demo`});runtime=new Pool({connectionString:`postgresql://jobguard_runtime:${password}@127.0.0.1:${port}/jobguard_synthetic_demo`});proof=new Pool({host:"127.0.0.1",port,user:"postgres",password,database:"jobguard_synthetic_demo"});repo=new SandboxRepository(runtime)},60000);afterAll(async()=>{await closeTestPools(runtime,proof,admin);await pg.stop();await rm(dir,{recursive:true,force:true})});
describe("SBOX-2 real PostgreSQL practice runs",()=>{it("isolates sessions, deterministically advances, and append-only resets",async()=>{const a=await issuePracticeSession(runtime),b=await issuePracticeSession(runtime),created=await repo.create(a,randomUUID()),other=await repo.create(b,randomUUID());expect(created.id).not.toBe(other.id);await expect(repo.read(b,created.id)).rejects.toMatchObject({code:"NOT_FOUND"});const advanced=await repo.advance(a,created.id,randomUUID());expect(advanced).toMatchObject({step:1,fakeClockTick:1,realExternalActions:0,headline:"The fictional job has started"});expect(await repo.advance(a,created.id,randomUUID())).toMatchObject({step:2,fakeClockTick:2});const reset=await repo.reset(a,created.id,randomUUID());expect(reset.id).not.toBe(created.id);expect(await repo.read(a,created.id)).toMatchObject({status:"Archived"});const auth=await authenticatePracticeSession(runtime,a);
expect((await readSyntheticDemo(runtime,auth.digest)).jobs.map(({title})=>title)).toEqual(["Kitchen extension","Loft conversion","Practice kitchen"]);
const counts=await withTenant(runtime,auth.context,tx=>tx.$client.query(`SELECT (SELECT count(*)::int FROM app.sandbox_run) runs,(SELECT count(*)::int FROM app.sandbox_run_event WHERE kind='archived') archives,(SELECT coalesce(sum(external_action_count),0)::int FROM app.sandbox_adapter_receipt) external`));
expect(counts.rows[0]).toEqual({runs:3,archives:1,external:0})});it("keeps runtime non-bypass and denies update/delete/truncate",async()=>{const role=await runtime.query("SELECT rolsuper,rolbypassrls,rolcreaterole FROM pg_roles WHERE rolname=current_user");expect(role.rows[0]).toEqual({rolsuper:false,rolbypassrls:false,rolcreaterole:false});for(const sql of ["UPDATE app.sandbox_run SET status='active'","DELETE FROM app.sandbox_run","TRUNCATE app.sandbox_run"]){await expect(runtime.query(sql)).rejects.toBeTruthy()}})});


// Administrative reads inspect stored history; every operation under test uses the runtime repository.
import { appendAuditBatch, verifyAuditChain, type AuditEvent } from "../src/audit.js";
import { DEMO_TENANT_ID } from "../src/demo-seed.js";
import { authenticatePracticeSession } from "../src/practice-session.js";
import { withTenant } from "../src/tenant-context.js";

async function events(runIds: string[]) {
  return (await proof.query(`SELECT * FROM app.sandbox_run_event
    WHERE tenant_id=$1 AND run_id=ANY($2::uuid[]) ORDER BY run_id,event_index`, [DEMO_TENANT_ID,runIds])).rows;
}
async function auditChain() {
  const rows = (await proof.query<AuditEvent>(`SELECT id,version,tenant_id AS "tenantId",sequence::int,
    actor_ref AS "actorRef",event_type AS "eventType",subject_type AS "subjectType",subject_ref AS "subjectRef",
    occurred_at AS "occurredAt",payload,payload_hash AS "payloadHash",previous_hash AS "previousHash",event_hash AS "eventHash"
    FROM app.audit_event WHERE tenant_id=$1 ORDER BY sequence`, [DEMO_TENANT_ID])).rows;
  verifyAuditChain(rows);
  return rows;
}
async function sandboxCounts() {
  return (await proof.query(`SELECT
    (SELECT count(*)::int FROM app.sandbox_run) runs,
    (SELECT count(*)::int FROM app.job) jobs,
    (SELECT count(*)::int FROM app.sandbox_work) work,
    (SELECT count(*)::int FROM app.sandbox_adapter_receipt) receipts,
    (SELECT count(*)::int FROM app.sandbox_run_event) events,
    (SELECT coalesce(sum(external_action_count),0)::int FROM app.sandbox_adapter_receipt) external`)).rows[0];
}

describe("LATER-SAFETY-175 reset history", () => {
  it("retains both reset halves, their initiating command and exact replay without rewriting history", async () => {
    const session=await issuePracticeSession(runtime),foreign=await issuePracticeSession(runtime);
    const createCommand=randomUUID(),created=await repo.create(session,createCommand);
    expect(await repo.create(session,createCommand)).toEqual(created);
    for(let step=1;step<=3;step++) {
      expect(await repo.advance(session,created.id,randomUUID())).toMatchObject({step,fakeClockTick:step,realExternalActions:0});
    }
    const before=await events([created.id]),chainBefore=await auditChain();
    const command=randomUUID(),reset=await repo.reset(session,created.id,command);
    expect(reset).toMatchObject({step:0,fakeClockTick:0,realExternalActions:0,status:"Synthetic practice"});
    expect(reset.id).not.toBe(created.id);
    expect(await repo.read(session,created.id)).toMatchObject({step:3,status:"Archived"});
    const history=await events([created.id,reset.id]);
    const archive=history.filter(row=>row.run_id===created.id && row.kind==="archived");
    const successor=history.filter(row=>row.run_id===reset.id);
    expect(archive).toHaveLength(1);
    expect(archive[0]).toMatchObject({event_index:5,fake_clock_tick:4});
    expect(successor).toHaveLength(1);
    expect(successor[0]).toMatchObject({kind:"created",command_id:command,event_index:1,fake_clock_tick:0});
    expect(archive[0]!.command_id).not.toBe(command);
    expect(archive[0]!.id).not.toBe(successor[0]!.id);
    expect(history.filter(row=>row.run_id===created.id && row.kind!=="archived")).toEqual(before);
    const chain=await auditChain();
    expect(chain.slice(0,chainBefore.length)).toEqual(chainBefore);
    const facts=chain.slice(chainBefore.length);
    expect(facts).toHaveLength(2);
    expect(facts[0]).toMatchObject({id:archive[0]!.command_id,eventType:"sandbox.run.archived",subjectRef:created.id,
      payload:{references:{command}}});
    expect(facts[1]).toMatchObject({id:command,eventType:"sandbox.run.created",subjectRef:reset.id,
      payload:{references:{command}}});
    expect(facts[0]!.id).not.toBe(facts[1]!.id);
    const counts=await sandboxCounts();
    expect(await repo.reset(session,created.id,command)).toEqual(reset);
    for(const id of [created.id,reset.id]) {
      await expect(repo.read(foreign,id)).rejects.toMatchObject({code:"NOT_FOUND"});
      await expect(repo.reset(foreign,id,randomUUID())).rejects.toMatchObject({code:"NOT_FOUND"});
      await expect(repo.reset(foreign,id,command)).rejects.toMatchObject({code:"NOT_FOUND"});
    }
    expect(await events([created.id,reset.id])).toEqual(history);
    expect(await auditChain()).toEqual(chain);
    expect(await sandboxCounts()).toEqual({...counts,external:0});
  });

  it("races two resets to one successor with one complete pair of history facts", async () => {
    const session=await issuePracticeSession(runtime),created=await repo.create(session,randomUUID());
    await repo.advance(session,created.id,randomUUID());
    const historyBefore=await events([created.id]),chainBefore=await auditChain(),countsBefore=await sandboxCounts();
    const commands=[randomUUID(),randomUUID()];
    const results=await Promise.all(commands.map(command=>repo.reset(session,created.id,command)));
    const winners=results.filter(run=>run.id!==created.id);
    expect(winners).toHaveLength(1);
    expect(results.filter(run=>run.id===created.id)).toHaveLength(1);
    const winner=winners[0]!,command=commands[results.findIndex(run=>run.id===winner.id)]!;
    const history=await events([created.id,winner.id]);
    expect(history.filter(row=>row.run_id===created.id && row.kind!=="archived")).toEqual(historyBefore);
    expect(history.filter(row=>row.kind==="archived")).toHaveLength(1);
    expect(history.filter(row=>row.run_id===winner.id)).toEqual([expect.objectContaining({kind:"created",event_index:1,command_id:command})]);
    const chain=await auditChain(),facts=chain.slice(chainBefore.length);
    expect(chain.slice(0,chainBefore.length)).toEqual(chainBefore);
    expect(facts.map(fact=>[fact.eventType,fact.subjectRef,fact.payload.references?.command])).toEqual([
      ["sandbox.run.archived",created.id,command],["sandbox.run.created",winner.id,command],
    ]);
    expect(new Set(facts.map(fact=>fact.id)).size).toBe(2);
    expect(await repo.reset(session,created.id,command)).toEqual(winner);
    expect(await sandboxCounts()).toEqual({...countsBefore,runs:countsBefore.runs+1,jobs:countsBefore.jobs+1,
      work:countsBefore.work+3,events:countsBefore.events+2});
    expect(await auditChain()).toEqual(chain);
  });

  it.each(["event","audit"] as const)("rolls back both reset halves if the second %s fact fails", async boundary => {
    const session=await issuePracticeSession(runtime),created=await repo.create(session,randomUUID());
    await repo.advance(session,created.id,randomUUID());
    const command=randomUUID(),before=await events([created.id]),chainBefore=await auditChain(),countsBefore=await sandboxCounts();
    const table=boundary==="event" ? "sandbox_run_event" : "audit_event";
    const predicate=boundary==="event" ? `NEW.command_id='${command}'::uuid AND NEW.kind='created'`
      : `NEW.id='${command}'::uuid AND NEW.event_type='sandbox.run.created'`;
    // Same real-PostgreSQL failure-trigger seam as the recovery-follow-up rollback proof.
    await proof.query(`CREATE FUNCTION public.safety175_fail_second() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF ${predicate} THEN RAISE EXCEPTION 'injected reset second fact failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER safety175_fail_second BEFORE INSERT ON app.${table}
      FOR EACH ROW EXECUTE FUNCTION public.safety175_fail_second()`);
    try {
      await expect(repo.reset(session,created.id,command)).rejects.toThrow("injected reset second fact failure");
      expect(await repo.read(session,created.id)).toMatchObject({status:"Synthetic practice",step:1});
      expect(await events([created.id])).toEqual(before);
      expect(await auditChain()).toEqual(chainBefore);
      expect(await sandboxCounts()).toEqual(countsBefore);
    } finally {
      await proof.query(`DROP TRIGGER safety175_fail_second ON app.${table}; DROP FUNCTION public.safety175_fail_second()`);
    }
    const reset=await repo.reset(session,created.id,command);
    expect(reset.id).not.toBe(created.id);
    expect(await repo.reset(session,created.id,command)).toEqual(reset);
    expect((await auditChain()).slice(chainBefore.length)).toHaveLength(2);
  });

  it("replays a pre-repair successful reset receipt without backfilling its historical gaps", async () => {
    const session=await issuePracticeSession(runtime),created=await repo.create(session,randomUUID());
    const command=randomUUID(),runId=randomUUID(),jobId=randomUUID();
    const auth=await authenticatePracticeSession(runtime,session);
    const payloadHash=createHash("sha256").update(`create|core-1000|${created.id}`).digest("hex");
    // Append-only fixture of the old successful reset: archive used the public command;
    // the successor's created event and the archive audit were absent.
    await withTenant(runtime,auth.context,async db=>{
      await db.$client.query(`INSERT INTO app.sandbox_run_event
        (id,tenant_id,run_id,event_index,kind,fake_clock_tick,command_id,payload_hash)
        VALUES($1,$2,$3,2,'archived',1,$4,$5)`,[randomUUID(),DEMO_TENANT_ID,created.id,command,payloadHash]);
      await db.$client.query("SELECT app.create_practice_sandbox_job($1,$2,$3,$4)",
        [DEMO_TENANT_ID,jobId,auth.membershipId,auth.digest]);
      await db.$client.query(`INSERT INTO app.sandbox_run(id,tenant_id,job_id,session_id,scenario,environment,status)
        SELECT $1,tenant_id,$2,session_id,scenario,environment,status FROM app.sandbox_run WHERE tenant_id=$3 AND id=$4`,
        [runId,jobId,DEMO_TENANT_ID,created.id]);
      await db.$client.query(`INSERT INTO app.sandbox_work
        (id,tenant_id,run_id,step,adapter,input_hash,amount_pence,currency,environment,approved)
        SELECT gen_random_uuid(),tenant_id,$1,step,adapter,input_hash,amount_pence,currency,environment,approved
        FROM app.sandbox_work WHERE tenant_id=$2 AND run_id=$3`,[runId,DEMO_TENANT_ID,created.id]);
      await appendAuditBatch(db,[{id:command,version:"audit.v1",actorRef:`synthetic-session:${createHash("sha256").update(session).digest("hex")}`,
        eventType:"sandbox.run.created",subjectType:"sandbox-run",subjectRef:runId,
        payload:{references:{command},hashes:{payload:payloadHash},classifications:{sandbox:"operational"}}}]);
    });
    const expected=await repo.read(session,runId),history=await events([created.id,runId]);
    const chain=await auditChain(),counts=await sandboxCounts();
    expect(history.filter(row=>row.run_id===runId)).toHaveLength(0);
    expect(await repo.reset(session,created.id,command)).toEqual(expected);
    expect(await repo.reset(session,created.id,command)).toEqual(expected);
    expect(await events([created.id,runId])).toEqual(history);
    expect(await auditChain()).toEqual(chain);
    expect(await sandboxCounts()).toEqual(counts);
  });

  it("preserves plain archive and create replay with their original command identities", async () => {
    const session=await issuePracticeSession(runtime),command=randomUUID(),created=await repo.create(session,command);
    const archiveCommand=randomUUID();
    const archived=await repo.archive(session,created.id,archiveCommand);
    expect(archived).toMatchObject({id:created.id,status:"Archived",realExternalActions:0});
    expect(await repo.create(session,command)).toEqual(archived);
    const history=await events([created.id]);
    expect(history.map(row=>[row.kind,row.command_id,row.event_index])).toEqual([
      ["created",command,1],["archived",archiveCommand,2],
    ]);
    const facts=(await auditChain()).filter(fact=>fact.subjectRef===created.id);
    expect(facts.map(fact=>[fact.eventType,fact.id])).toEqual([
      ["sandbox.run.created",command],["sandbox.run.archived",archiveCommand],
    ]);
  });
});
