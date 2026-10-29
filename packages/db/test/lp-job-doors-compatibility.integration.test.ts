// Independent compatibility groundwork; this file does not claim LP-2 acceptance.
import { createHash, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ContractorRepository } from "../src/contractor-repository.js";
import { SandboxRepository } from "../src/sandbox-repository.js";
import { WorkOrderRepository } from "../src/work-order-repository.js";
import { demoFile, demoRow, prepareWorkOrderDemo } from "../src/work-order-fixtures.js";
import { DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID } from "../src/demo-seed.js";
import { authenticatePracticeSession, authorizePracticeJob, issuePracticeSession } from "../src/practice-session.js";
import { insertJob, jobDoorCounts, jobDoorsActor, jobDoorsDatabase, transaction, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";

let db: JobDoorsDatabase;
const digest = (session: string) => createHash("sha256").update(session).digest("hex");
beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  db = await jobDoorsDatabase(true);
  await db.owner.query("INSERT INTO control_plane.tenant(id) VALUES($1)", [DEMO_TENANT_ID]);
  await db.owner.query("INSERT INTO identity.identity_user(id) VALUES($1)", [DEMO_IDENTITY_USER_ID]);
  await db.owner.query("INSERT INTO app.account(tenant_id,id,name) VALUES($1,$2,'Fictional LP2 practice')", [DEMO_TENANT_ID, DEMO_ACCOUNT_ID]);
  await db.owner.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID, DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID]);
}, 300_000);
afterAll(async () => { vi.unstubAllEnvs(); await db?.close(); });

describe("LP-2 creation caller compatibility groundwork", () => {
  it("[LP2-A12] ENT-2 import still creates one live work-order job atomically through the product repository", async () => {
    const principal = await new ContractorRepository(db.runtime).startPractice(randomUUID());
    const demo = await prepareWorkOrderDemo(db.runtime, principal, { siteCount: 1 });
    const command = { commandId: randomUUID(), kind: "csv" as const, name: "fictional-lp2.csv", csv: demoFile([demoRow(demo, 1)]) };
    const repository = new WorkOrderRepository(db.runtime), result = await repository.importCsv(principal, command);
    expect(result.rows[0]?.outcome).toBe("created");
    const order = (await db.owner.query(`SELECT j.id,j.status,j.revision,j.provenance,t.job_track FROM app.work_order w
      JOIN app.job j ON(j.tenant_id,j.id)=(w.tenant_id,w.job_id)
      JOIN app.job_commercial_track t ON(t.tenant_id,t.job_id)=(j.tenant_id,j.id)
      WHERE w.tenant_id=$1 AND w.id=$2`, [principal.tenantId, result.rows[0]!.workOrderId])).rows;
    expect(order).toHaveLength(1);
    // Contractor party binding (0102) and the live commit (0110) each advance the job revision.
    expect(order[0]).toMatchObject({ status: "live", revision: 2, provenance: "work_order", job_track: "contractor" });
    const before = await jobDoorCounts(db.owner, principal.tenantId);
    expect(await repository.importCsv(principal, command)).toEqual(result);
    expect(await jobDoorCounts(db.owner, principal.tenantId)).toEqual(before);
  });

  it("[LP2-A12] direct runtime work-order insertion is refused without effects", async () => {
    const actor = await jobDoorsActor(db.owner), before = await jobDoorCounts(db.owner, actor.tenant);
    await expect(transaction(db.runtime, actor.tenant, client => insertJob(client, actor.tenant, randomUUID(), { provenance: "work_order" }))).rejects.toMatchObject({ code: "42501" });
    expect(await jobDoorCounts(db.owner, actor.tenant)).toEqual(before);
  });

  it("[LP2-A04] [LP2-A12] shared migration ownership alone cannot create a work-order job", async () => {
    const actor = await jobDoorsActor(db.owner), before = await jobDoorCounts(db.owner, actor.tenant);
    await expect(transaction(db.owner, actor.tenant, async client => {
      await client.query("SET LOCAL ROLE jobguard_migration");
      await insertJob(client, actor.tenant, randomUUID(), { provenance: "work_order" });
    })).rejects.toMatchObject({ code: "42501" });
    expect(await jobDoorCounts(db.owner, actor.tenant)).toEqual(before);
  });

  it("[LP2-A13] home and sandbox creation preserve ownership, scenario, state and revision", async () => {
    const session = await issuePracticeSession(db.runtime), auth = await authenticatePracticeSession(db.runtime, session);
    const home = (await db.owner.query("SELECT title,status,revision,practice_scenario FROM app.job WHERE practice_session_digest=$1 AND practice_scenario='home' ORDER BY title", [auth.digest])).rows;
    expect(home).toEqual([
      { title: "Kitchen extension", status: "live", revision: 0, practice_scenario: "home" },
      { title: "Loft conversion", status: "quoting", revision: 0, practice_scenario: "home" },
      { title: "Practice kitchen", status: "quoting", revision: 0, practice_scenario: "home" },
    ]);
    const sandbox = await new SandboxRepository(db.runtime).create(session, randomUUID());
    expect((await db.owner.query("SELECT status,revision,practice_scenario,practice_session_digest FROM app.job WHERE id=$1", [sandbox.jobId])).rows).toEqual([
      { status: "quoting", revision: 0, practice_scenario: "core-1000", practice_session_digest: auth.digest },
    ]);
    const stranger = await issuePracticeSession(db.runtime), before = await jobDoorCounts(db.owner, DEMO_TENANT_ID);
    await expect(new SandboxRepository(db.runtime).read(stranger, sandbox.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(new SandboxRepository(db.runtime).advance(stranger, sandbox.id, randomUUID())).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(authorizePracticeJob(db.runtime, stranger, sandbox.jobId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await jobDoorCounts(db.owner, DEMO_TENANT_ID)).toEqual(before);
  });

  it.each(["expired", "revoked"])("[LP2-A13] %s persisted practice sessions cannot create sandbox jobs", async condition => {
    const session = await issuePracticeSession(db.runtime);
    if (condition === "expired") await db.owner.query("UPDATE control_plane.practice_session SET expires_at=clock_timestamp()-interval '1 second' WHERE token_digest=$1", [digest(session)]);
    else await db.owner.query("UPDATE control_plane.practice_session SET revoked_at=clock_timestamp() WHERE token_digest=$1", [digest(session)]);
    const before = await jobDoorCounts(db.owner, DEMO_TENANT_ID);
    await expect(new SandboxRepository(db.runtime).create(session, randomUUID())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(await jobDoorCounts(db.owner, DEMO_TENANT_ID)).toEqual(before);
  });
});

describe("LP-2 saved sample and caller replay", () => {
  it("[LP2-A13] saved-v1 remains a server-created draft and sandbox creation replays without another job or audit", async () => {
    const session = await issuePracticeSession(db.runtime), auth = await authenticatePracticeSession(db.runtime, session);
    expect((await db.owner.query(`SELECT status,revision,practice_scenario,saved_v1_sample FROM app.job
      WHERE tenant_id=$1 AND practice_session_digest=$2 AND practice_scenario='v1_sample'`, [DEMO_TENANT_ID, auth.digest])).rows)
      .toEqual([{ status: "draft", revision: 0, practice_scenario: "v1_sample", saved_v1_sample: true }]);
    const repository = new SandboxRepository(db.runtime), command = randomUUID(), first = await repository.create(session, command);
    const before = await jobDoorCounts(db.owner, DEMO_TENANT_ID);
    expect(await repository.create(session, command)).toEqual(first);
    expect(await jobDoorCounts(db.owner, DEMO_TENANT_ID)).toEqual(before);
    await expect(transaction(db.runtime, DEMO_TENANT_ID, c => c.query(`INSERT INTO app.job
      (tenant_id,id,title,practice_session_digest,practice_scenario,saved_v1_sample)
      VALUES($1,$2,'Fictional invalid sample',$3,'v1_sample',true)`, [DEMO_TENANT_ID, randomUUID(), auth.digest])))
      .rejects.toMatchObject({ code: "42501" });
    expect(await jobDoorCounts(db.owner, DEMO_TENANT_ID)).toEqual(before);
    expect((await db.owner.query("SELECT count(*)::int n FROM app.lp_job_insert_permit")).rows).toEqual([{ n: 0 }]);
  });
});
