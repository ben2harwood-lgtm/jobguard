import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  appendAuditBatch, exportAuditCheckpoints, migrate, verifyAuditChain,
  type AuditEvent, type AuditEventInput, type VerifiedTenantContext, withTenant,
} from "../src/index.js";

const TENANT = "30000000-0000-4000-8000-000000000003";
const context = { tenantId: TENANT } as VerifiedTenantContext;
const event = (n: number): AuditEventInput => ({
  id: `40000000-0000-4000-8000-${n.toString().padStart(12, "0")}`,
  version: "audit.v1", actorRef: "user:synthetic", eventType: "account.changed",
  subjectType: "account", subjectRef: `account:${n}`,
  payload: { references: { command: `command:${n}` }, classifications: { access: "operational" } },
});

let postgres: EmbeddedPostgres;
let admin: Pool;
let runtime: Pool;
let databaseDir: string;
let port: number;

async function readChain(): Promise<AuditEvent[]> {
  return withTenant(runtime, context, async (database) => {
    const result = await database.$client.query(`SELECT id, tenant_id AS "tenantId", sequence::int,
      version, actor_ref AS "actorRef", event_type AS "eventType", subject_type AS "subjectType",
      subject_ref AS "subjectRef", occurred_at AS "occurredAt", payload,
      trim(payload_hash) AS "payloadHash", trim(previous_hash) AS "previousHash", trim(event_hash) AS "eventHash"
      FROM app.audit_event ORDER BY sequence`);
    return result.rows as AuditEvent[];
  });
}

beforeAll(async () => {
  databaseDir = await mkdtemp(join(tmpdir(), "jobguard-audit-pg16-"));
  port = 56000 + Math.floor(Math.random() * 500);
  postgres = new EmbeddedPostgres({ databaseDir, port,
    user: "postgres", password: "synthetic-test-only", persistent: false,
    createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C"], onLog: () => undefined });
  await postgres.initialise(); await postgres.start();
  const connection = { host: "127.0.0.1", port, database: "postgres" };
  admin = new Pool({ ...connection, user: "postgres", password: "synthetic-test-only" });
  admin.on("error", () => undefined);
  await migrate(admin);
  await admin.query("INSERT INTO control_plane.tenant (id) VALUES ($1)", [TENANT]);
  await admin.query(`CREATE ROLE jobguard_audit_login LOGIN PASSWORD 'synthetic-runtime-only'
    NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOBYPASSRLS`);
  await admin.query("GRANT jobguard_runtime TO jobguard_audit_login");
  runtime = new Pool({ ...connection, user: "jobguard_audit_login", password: "synthetic-runtime-only", max: 12 });
  runtime.on("error", () => undefined);
}, 60_000);

afterAll(async () => { await runtime?.end(); await admin?.end(); await postgres?.stop();
  await rm(databaseDir, { recursive: true, force: true }); });

describe("serialized append-only audit", () => {
  it("serializes competing batches into one contiguous verifiable chain without deadlock", async () => {
    await admin.query("ALTER DATABASE postgres SET deadlock_timeout = '100ms'");
    await Promise.all(Array.from({ length: 10 }, (_, index) =>
      withTenant(runtime, context, (database) => appendAuditBatch(database, [event(index + 1)]))));
    const chain = await readChain();
    expect(chain.map(({ sequence }) => sequence)).toEqual([1,2,3,4,5,6,7,8,9,10]);
    expect(new Set(chain.map(({ eventHash }) => eventHash)).size).toBe(10);
    expect(() => verifyAuditChain(chain)).not.toThrow();
  });

  it("rolls the business mutation and audit append back together", async () => {
    await expect(withTenant(runtime, context, async (database) => {
      await database.$client.query("INSERT INTO app.account (id, tenant_id, name) VALUES ($1,$2,'rollback')",
        ["50000000-0000-4000-8000-000000000005", TENANT]);
      await appendAuditBatch(database, [event(11)]);
      throw new Error("abort command");
    })).rejects.toThrow("abort command");
    expect((await readChain())).toHaveLength(10);
    await withTenant(runtime, context, async (database) => {
      expect((await database.$client.query("SELECT id FROM app.account")).rows).toEqual([]);
    });
  });

  it("detects metadata, payload, link, and sequence tampering", async () => {
    const original = await readChain();
    for (const field of ["actorRef", "eventType", "subjectType", "subjectRef", "occurredAt",
      "sequence", "previousHash", "payloadHash"] as const) {
      const changed = structuredClone(original);
      Object.assign(changed[1]!, { [field]: field === "sequence" ? 99 : field === "occurredAt" ? new Date(0) : "tampered" });
      expect(() => verifyAuditChain(changed)).toThrowError(/Invalid audit chain/u);
    }
    const payloadChanged = structuredClone(original);
    payloadChanged[1]!.payload = { references: { command: "command:tampered" } };
    expect(() => verifyAuditChain(payloadChanged)).toThrowError(/Invalid audit chain/u);
  });

  it("detects tail deletion against an independently restricted checkpoint", async () => {
    const [checkpoint] = await exportAuditCheckpoints(admin);
    expect(checkpoint).toBeDefined();
    const chain = await readChain();
    expect(() => verifyAuditChain(chain.slice(0, -1), checkpoint)).toThrowError(/trusted checkpoint/u);
    expect(() => verifyAuditChain(chain, checkpoint)).not.toThrow();
    await expect(runtime.query("SELECT * FROM audit_control.checkpoint")).rejects.toMatchObject({ code: "42501" });
  });

  it("prevents runtime update, delete, and truncate and rejects free-text payload keys", async () => {
    for (const sql of ["UPDATE app.audit_event SET event_type = 'forged'", "DELETE FROM app.audit_event",
      "TRUNCATE app.audit_event"]) await expect(runtime.query(sql)).rejects.toMatchObject({ code: "42501" });
    await expect(withTenant(runtime, context, (database) => appendAuditBatch(database, [{
      ...event(12), payload: { ...event(12).payload, note: "PII must not enter audit" },
    } as AuditEventInput]))).rejects.toThrow();
  });
});
