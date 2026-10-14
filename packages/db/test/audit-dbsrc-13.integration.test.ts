import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bootstrapSyntheticDemo, issuePracticeSession, SandboxRepository, withTenant } from "../src/index.js";
import { authenticatePracticeSession } from "../src/practice-session.js";
import { closeTestPools, freePort } from "./pool-test-utils.js";

let postgres: EmbeddedPostgres, admin: Pool, runtime: Pool, directory: string;
const previousEnvironment = process.env.JOBGUARD_ENV;
beforeAll(async () => {
  const port = await freePort(57600, 100);
  directory = await mkdtemp(join(tmpdir(), "jg-audit-dbsrc-13-"));
  postgres = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: "synthetic",
    persistent: false, createPostgresUser: process.getuid?.() === 0,
    initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic" });
  await admin.query("CREATE ROLE neondb_owner LOGIN PASSWORD 'synthetic' CREATEROLE NOSUPERUSER NOCREATEDB NOINHERIT NOBYPASSRLS");
  await admin.query("CREATE DATABASE jobguard_synthetic_demo OWNER neondb_owner");
  process.env.JOBGUARD_ENV = "synthetic_demo";
  const runtimeUrl = `postgresql://jobguard_runtime:synthetic@127.0.0.1:${port}/jobguard_synthetic_demo`;
  await bootstrapSyntheticDemo({ ownerUrl: `postgresql://neondb_owner:synthetic@127.0.0.1:${port}/jobguard_synthetic_demo`, runtimeUrl });
  runtime = new Pool({ connectionString: runtimeUrl });
}, 120_000);
afterAll(async () => {
  await closeTestPools(runtime, admin); await postgres?.stop();
  if (directory) await rm(directory, { recursive: true, force: true });
  if (previousEnvironment === undefined) delete process.env.JOBGUARD_ENV;
  else process.env.JOBGUARD_ENV = previousEnvironment;
});

describe("AUDIT-FIX-DBSRC-13 real PostgreSQL reset history", () => {
  it("reset preserves both archive and replacement creation history", async () => {
    const session = await issuePracticeSession(runtime), repo = new SandboxRepository(runtime);
    const old = await repo.create(session, randomUUID()), commandId = randomUUID();
    const replacement = await repo.reset(session, old.id, commandId);
    const { context } = await authenticatePracticeSession(runtime, session);
    const history = () => withTenant(runtime, context, async db => ({
      events: (await db.$client.query("SELECT run_id,event_index,kind,command_id FROM app.sandbox_run_event WHERE tenant_id=$1 AND run_id=ANY($2::uuid[]) ORDER BY run_id,event_index", [context.tenantId, [old.id, replacement.id]])).rows,
      audits: (await db.$client.query("SELECT id,event_type,subject_ref,payload FROM app.audit_event WHERE tenant_id=$1 AND payload->'references'->>'command'=$2 ORDER BY sequence", [context.tenantId, commandId])).rows,
    }));
    const beforeReplay = await history();
    const archive = beforeReplay.events.filter(event => event.run_id === old.id && event.kind === "archived");
    const creation = beforeReplay.events.filter(event => event.run_id === replacement.id && event.kind === "created");
    expect(archive).toHaveLength(1); expect(creation).toHaveLength(1);
    expect(creation[0]!.event_index).toBe(1);
    expect(beforeReplay.audits).toHaveLength(2);
    for (const event of [archive[0]!, creation[0]!]) {
      expect(beforeReplay.audits.find(record => record.id === event.command_id)).toMatchObject({
        subject_ref: event.run_id, event_type: `sandbox.run.${event.kind}`,
        payload: { references: { command: commandId } },
      });
    }
    expect(await repo.read(session, old.id)).toMatchObject({ status: "Archived" });
    expect(await repo.reset(session, old.id, commandId)).toEqual(replacement);
    expect(await history()).toEqual(beforeReplay);
  });
});
