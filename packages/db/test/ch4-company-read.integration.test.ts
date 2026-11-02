import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import { JobWorkStateRepository } from "../src/job-work-state-repository.js";
import { jobDoorsDatabase, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";
import { seedWorkJob, seedWorkPractice, type WorkFixture } from "./job-work-state-fixtures.js";

let db: JobDoorsDatabase;
beforeAll(async () => { db = await jobDoorsDatabase(true, "0525_ch4_company_workspace_read"); }, 300_000);
afterAll(async () => { await db?.close(); });

it("0560 upgrades the existing read without changing facts, ACL, practice access or company isolation", async () => {
  const f = { admin: db.owner, runtime: db.runtime } as WorkFixture;
  const company = await seedWorkJob(f), foreign = await seedWorkJob(f), practice = await seedWorkPractice(f);
  const repo = new JobWorkStateRepository(db.runtime);
  const before = await repo.read(practice.auth.context, practice.jobId, practice.auth.digest);
  const catalogue = () => db.owner.query(`SELECT r.rolname,p.proacl,p.prosecdef,p.proconfig FROM pg_proc p
    JOIN pg_roles r ON r.oid=p.proowner WHERE p.oid='app.ch4_read_work_facts(uuid,uuid,text)'::regprocedure`);
  const permissions = (await catalogue()).rows;
  const facts = () => db.owner.query("SELECT tenant_id,job_id,id,sequence,kind,fact_at,recorded_at FROM app.job_work_state_event ORDER BY tenant_id,job_id,sequence");
  const saved = (await facts()).rows;
  await expect(repo.read(company.context, company.jobId, company.actorId)).rejects.toThrow("WORK_STATE_FORBIDDEN");
  const sql = await readFile(new URL("../migrations/0525_ch4_company_workspace_read.sql", import.meta.url), "utf8");
  await db.owner.query(sql);
  expect((await catalogue()).rows).toEqual(permissions);
  expect((await facts()).rows).toEqual(saved);
  expect(await repo.read(practice.auth.context, practice.jobId, practice.auth.digest)).toEqual(before);
  const state = await repo.read(company.context, company.jobId, company.actorId);
  expect(state).toMatchObject({jobId:company.jobId,events:[],links:[],lock:null});
  for (const [job, actor] of [[foreign.jobId,company.actorId],[company.jobId,foreign.actorId],[company.jobId,randomUUID()]]) {
    await expect(repo.read(company.context,job!,actor!)).rejects.toThrow("WORK_STATE_FORBIDDEN");
  }
  await db.owner.query("UPDATE app.membership SET revoked_at=clock_timestamp() WHERE tenant_id=$1 AND id=$2", [company.tenantId,company.actorId]);
  await expect(repo.read(company.context,company.jobId,company.actorId)).rejects.toThrow("WORK_STATE_FORBIDDEN");
  // CREATE OR REPLACE is repeatable; rollback/forward-fix is the previous body
  // restored by a new migration. No business rows or schema format are changed.
  await db.owner.query(sql);
  expect((await facts()).rows).toEqual(saved);
});
