import { testTenantContext } from "./tenant-context-test-utils.js";
import { importWatchdogFixtureJob } from "./watchdog-fixtures.js";
import{randomUUID}from"node:crypto";import{mkdtemp,rm}from"node:fs/promises";import{tmpdir}from"node:os";import{join}from"node:path";import EmbeddedPostgres from"embedded-postgres";import{Pool}from"pg";import{afterAll,beforeAll,describe,expect,it}from"vitest";import{InboxRelevanceRepository,migrate,withTenant}from"../src/index.js";import{closeTestPools, freePort, installLegacySyntheticPartyFixtures}from"./pool-test-utils.js";let pg:EmbeddedPostgres,admin:Pool,runtime:Pool,dir:string;const tenant=randomUUID(),other=randomUUID(),account=randomUUID(),member=randomUUID(),user=randomUUID(),job=randomUUID(),wrongJob=randomUUID(),ctx=testTenantContext(tenant, { membershipId: member });beforeAll(async()=>{dir=await mkdtemp(join(tmpdir(),"jg-inbox-"));const port=await freePort(59600,100);pg=new EmbeddedPostgres({databaseDir:dir,port,user:"postgres",password:"synthetic",persistent:false,createPostgresUser:process.getuid?.()===0,initdbFlags:["--lc-messages=C","--encoding=UTF8"],onLog:()=>undefined});await pg.initialise();await pg.start();admin=new Pool({host:"127.0.0.1",port,user:"postgres",password:"synthetic"});await migrate(admin);await installLegacySyntheticPartyFixtures(admin);for(const [sql,args] of [["INSERT INTO control_plane.tenant(id)VALUES($1),($2)",[tenant,other]],["INSERT INTO identity.identity_user(id)VALUES($1)",[user]],["INSERT INTO app.account(id,tenant_id,name)VALUES($1,$2,'A')",[account,tenant]],["INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)VALUES($1,$2,$3,$4,'owner')",[member,tenant,account,user]]] as const)await admin.query(sql,[...args]);await importWatchdogFixtureJob(admin,tenant,job);await importWatchdogFixtureJob(admin,tenant,wrongJob);await admin.query("CREATE ROLE inbox_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;GRANT jobguard_runtime TO inbox_login");runtime=new Pool({host:"127.0.0.1",port,database:"postgres",user:"inbox_login",password:"synthetic"})},60000);afterAll(async()=>{await closeTestPools(runtime,admin);await pg.stop();await rm(dir,{recursive:true,force:true})});describe("relevance inbox persistence",()=>{it("persists grouped sources, budget, and one idempotent dismissal",async()=>{const repo=new InboxRelevanceRepository(runtime);let v=await repo.seed(ctx,job,randomUUID(),member);expect(v.mandatory).toHaveLength(2);expect(v.availableAdvisory).toBe(3);expect(v.advisory).toHaveLength(2);v=await repo.setBudget(ctx,job,{commandId:randomUUID(),advisoryBudget:0},member);expect(v.advisory).toHaveLength(0);const first=(await repo.setBudget(ctx,job,{commandId:randomUUID(),advisoryBudget:5},member)).advisory[0]!,commandId=randomUUID();await repo.dismiss(ctx,job,first.id,{commandId},member);v=await repo.dismiss(ctx,job,first.id,{commandId},member);expect(v.metrics.dismissed).toBe(1);await expect(repo.dismiss(ctx,wrongJob,first.id,{commandId:randomUUID()},member)).rejects.toThrow("DECISION_NOT_FOUND_FOR_JOB")});it("denies runtime mutation, deletion, and cross-tenant insert",async()=>{for(const q of["UPDATE app.inbox_finding_revision SET title='x'","DELETE FROM app.inbox_outcome_event"])await expect(withTenant(runtime,ctx,d=>d.$client.query(q))).rejects.toMatchObject({code:"42501"});await expect(withTenant(runtime,ctx,d=>d.$client.query("INSERT INTO app.inbox_preference_revision(id,tenant_id,membership_id,revision,command_id,advisory_budget,actor_ref,subject_ref,payload_hash,audit_event_id,created_at)VALUES($1,$2,$3,1,$4,0,'x',$3,repeat('a',64),$5,now())",[randomUUID(),other,member,randomUUID(),randomUUID()]))).rejects.toMatchObject({code:"42501"})})});


it("seeds every practice finding after a held merchant review and does not seed twice", async () => {
  const reviewJob = randomUUID();
  await importWatchdogFixtureJob(admin, tenant, reviewJob);
  const previousEnvironment = process.env.JOBGUARD_ENV;
  try {
    process.env.JOBGUARD_ENV = "synthetic_demo";
    const { SupplierDocumentRepository } = await import("../src/index.js");
    const intake = await new SupplierDocumentRepository(runtime).intake(ctx, reviewJob, {
      version: "supplier-document-intake.v1", fixtureId: "merchant-schema-drift",
      channel: "fixture_portal", expectedRevision: 0, commandId: randomUUID(),
    });
    expect(intake.result).toBe("held");
    const repo = new InboxRelevanceRepository(runtime);
    const held = await repo.view(ctx, reviewJob, member);
    expect(held.mandatory).toHaveLength(1);
    expect(held.mandatory[0]).toMatchObject({
      ruleId: "merchant-held-review", sources: [`supplier-document:${intake.documentId}`],
    });

    await repo.seed(ctx, reviewJob, randomUUID(), member);
    const seeded = await repo.view(ctx, reviewJob, member);
    expect(seeded.mandatory).toHaveLength(3);
    expect(seeded.mandatory).toEqual(expect.arrayContaining([
      held.mandatory[0],
      expect.objectContaining({ ruleId: "proof-required", title: "Electrical proof required" }),
      expect.objectContaining({ ruleId: "approval-required", title: "Variation approval required" }),
    ]));
    expect(seeded.advisory).toHaveLength(2);
    expect(seeded.availableAdvisory).toBe(3);
    expect(seeded.advisory).toEqual(expect.arrayContaining([
      expect.objectContaining({ ruleId: "supplier-check", sources: ["invoice:A:page-1", "invoice:A:page-2"] }),
      expect.objectContaining({ ruleId: "readiness-review", sources: ["plan:paint-walls"] }),
    ]));
    const records = async () => (await admin.query(
      `SELECT 'finding' kind, id FROM app.inbox_finding_revision WHERE tenant_id=$1 AND job_id=$2
       UNION ALL SELECT 'decision', id FROM app.inbox_decision_revision WHERE tenant_id=$1 AND job_id=$2
       UNION ALL SELECT 'outcome', id FROM app.inbox_outcome_event WHERE tenant_id=$1 AND job_id=$2
       ORDER BY kind, id`, [tenant, reviewJob],
    )).rows;
    const before = await records();
    // Five seed findings coalesce into four decisions; the merchant review stays separate.
    expect(before.filter(row => row.kind === "finding")).toHaveLength(6);
    expect(before.filter(row => row.kind === "decision")).toHaveLength(5);
    expect(before.filter(row => row.kind === "outcome")).toHaveLength(5);

    await repo.seed(ctx, reviewJob, randomUUID(), member);
    expect(await repo.view(ctx, reviewJob, member)).toEqual(seeded);
    expect(await records()).toEqual(before);
  } finally {
    if (previousEnvironment === undefined) delete process.env.JOBGUARD_ENV;
    else process.env.JOBGUARD_ENV = previousEnvironment;
  }
});
