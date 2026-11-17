import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JobPartiesApplication } from "../../../apps/api/src/job-parties.application.js";
import { jobPartiesImportResultV1 } from "@jobguard/core";
import { DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID, DEMO_MEMBERSHIP_ID, DEMO_TENANT_ID } from "../src/demo-seed.js";
import { issuePracticeSession } from "../src/practice-session.js";
import { jobDoorsDatabase, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";

let db: JobDoorsDatabase;
const priorEnvironment = process.env.JOBGUARD_ENV;
beforeAll(async () => {
  process.env.JOBGUARD_ENV = "synthetic_demo";
  db = await jobDoorsDatabase(true);
  await db.owner.query("INSERT INTO control_plane.tenant(id) VALUES($1) ON CONFLICT DO NOTHING", [DEMO_TENANT_ID]);
  await db.owner.query("INSERT INTO identity.identity_user(id) VALUES($1) ON CONFLICT DO NOTHING", [DEMO_IDENTITY_USER_ID]);
  await db.owner.query("INSERT INTO app.account(tenant_id,id,name) VALUES($1,$2,'Fictional LP5 import') ON CONFLICT DO NOTHING", [DEMO_TENANT_ID, DEMO_ACCOUNT_ID]);
  await db.owner.query("INSERT INTO app.membership(tenant_id,id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner') ON CONFLICT DO NOTHING", [DEMO_TENANT_ID, DEMO_MEMBERSHIP_ID, DEMO_ACCOUNT_ID, DEMO_IDENTITY_USER_ID]);
}, 300_000);
afterAll(async () => {
  await db?.close();
  if (priorEnvironment === undefined) delete process.env.JOBGUARD_ENV; else process.env.JOBGUARD_ENV = priorEnvironment;
});

describe("LP-5a real parties-import caller", () => {
  it("preserves the UI/API result contract, replays the exact result, and creates one imported job", async () => {
    const app = new JobPartiesApplication(db.runtime), principal = { sessionId: await issuePracticeSession(db.runtime) };
    const source = (await app.list(principal)).jobs.find(job => job.status === "quoting")!;
    expect(source).toBeDefined();
    const initial = await app.view(principal, source.id);
    const customer = await app.command(principal, source.id, { version: "job-parties-command.v1", commandId: randomUUID(), action: "create_customer",
      customer: { version: "customer.v1", name: "Fictional LP5 customer", type: "person", email: "lp5@example.invalid" } });
    const site = await app.command(principal, source.id, { version: "job-parties-command.v1", commandId: randomUUID(), action: "create_site",
      site: { version: "site.v1", addressLines: ["14 Fictional Street"], town: "London", postcode: "SW1A 1AA" } });
    await app.command(principal, source.id, { version: "job-parties-command.v1", commandId: randomUUID(), action: initial.current ? "correct" : "bind",
      expectedJobRevision: initial.jobRevision, parties: { version: "job-parties.v1", customerRevisionId: customer.revisionId, siteRevisionId: site.revisionId },
      ...(initial.current ? { reason: "Fictional import fixture correction" } : {}) });
    const binding = (await app.view(principal, source.id)).current!.bindingId;
    const input = { version: "job-parties-import.v1", commandId: randomUUID(), expectedBindingId: binding };
    const [first, concurrent] = await Promise.all([app.adopt(principal, source.id, input), app.adopt(principal, source.id, input)]);
    expect(jobPartiesImportResultV1.parse(first)).toEqual(first);
    expect(first).toMatchObject({ version: "job-parties-import-result.v1", environment: "synthetic_demo", sourceJobId: source.id, sourceBindingId: binding, realExternalActions: 0 });
    expect(concurrent).toEqual(first);
    const counts = async () => (await db.owner.query(`SELECT
      (SELECT count(*)::int FROM app.job WHERE tenant_id=$1 AND provenance='imported') jobs,
      (SELECT count(*)::int FROM app.imported_job_baseline WHERE tenant_id=$1) baselines`, [DEMO_TENANT_ID])).rows[0];
    const beforeReplay = await counts();
    expect(await app.adopt(principal, source.id, input)).toEqual(first);
    expect(await app.adopt(principal, source.id, input)).toEqual(first);
    expect(await counts()).toEqual(beforeReplay);
    expect((await db.owner.query("SELECT count(*)::int n FROM app.job WHERE tenant_id=$1 AND id=$2", [DEMO_TENANT_ID, first.jobId])).rows[0].n).toBe(1);
    const receipts = (await db.owner.query("SELECT result FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [DEMO_TENANT_ID, input.commandId])).rows;
    expect(receipts).toEqual([{ result: first }]);
  });
});
