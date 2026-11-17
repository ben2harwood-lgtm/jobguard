import { testTenantContext } from "./tenant-context-test-utils.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEvidencePackSources } from "../src/evidence-pack-sources.js";
import { migrate } from "../src/migrate.js";
import { withTenant} from "../src/tenant-context.js";
import { randomUUID } from "node:crypto";
import { seedEvidencePackFixture } from "./evidence-pack-fixture.js";
import { closeTestPools, freePort, installLegacySyntheticPartyFixtures } from "./pool-test-utils.js";

let pg: EmbeddedPostgres | undefined, admin: Pool | undefined, runtime: Pool, dir: string;
let fixture: Awaited<ReturnType<typeof seedEvidencePackFixture>>;
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "jg-reaccept-evidence-"));
  const port = await freePort(58950, 100);
  const postgresLog: string[] = [];
  pg = new EmbeddedPostgres({ databaseDir: dir, port, user: "postgres", password: "synthetic", persistent: false, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: message => { postgresLog.push(message); } });
  try { await pg.initialise(); await pg.start(); }
  catch (error) { throw new Error(`${String(error)}\n${postgresLog.join("\n")}`); }
  admin = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "postgres", password: "synthetic" });
  await migrate(admin);
  await installLegacySyntheticPartyFixtures(admin);
  fixture = await seedEvidencePackFixture(admin);
  await admin.query("CREATE ROLE reaccept_evidence_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOBYPASSRLS; GRANT jobguard_runtime TO reaccept_evidence_login");
  runtime = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "reaccept_evidence_login", password: "synthetic" });
}, 60_000);
afterAll(async () => { await closeTestPools(runtime, admin); await pg?.stop(); if (dir) await rm(dir, { recursive: true, force: true }); });

// QUOTE-REACCEPT review B1: the accepted-quote evidence is the LATEST acceptance by sequence, not by the builder-typed accepted_at.
describe("re-acceptance with an EARLIER stated date", () => {
  it("evidence pack sources use the sequence-2 acceptance, not the cancelled one with the later date", async () => {
    const second = randomUUID();
    const client = await admin!.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id',$1,true)", [fixture.tenantId]);
      const first = (await client.query("SELECT * FROM app.quote_acceptance WHERE tenant_id=$1 AND id=$2", [fixture.tenantId, fixture.acceptanceId])).rows[0];
      await client.query("INSERT INTO app.quote_acceptance(id,tenant_id,job_id,document_id,document_version,document_hash,accepted_total_pence,currency,acceptance_kind,actor_membership_id,stated_customer_name,stated_method,accepted_at) VALUES($1,$2,$3,$4,$5,$6,$7,'GBP','builder_attestation',$8,'Corrected Customer','message','2026-09-10T12:00:00Z')", [second, fixture.tenantId, first.job_id, first.document_id, first.document_version, first.document_hash, first.accepted_total_pence, first.actor_membership_id]);
      await client.query("INSERT INTO app.quote_acceptance_sequence(tenant_id,job_id,document_id,acceptance_id,acceptance_sequence,replaces_acceptance_id) VALUES($1,$2,$3,$4,2,$5)", [fixture.tenantId, first.job_id, first.document_id, second, fixture.acceptanceId]);
      await client.query("COMMIT");
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    const ids = (await withTenant(runtime, testTenantContext(fixture.tenantId), db => loadEvidencePackSources(db, fixture.tenantId, fixture.caseId))).sources.map(x => x.sourceId);
    expect(ids).toContain(`quote_acceptance:${second}`);
    expect(ids).not.toContain(`quote_acceptance:${fixture.acceptanceId}`);
  });
  it("the recovery-message currency function orders by acceptance sequence and keeps signature, owner and ACL", async () => {
    const def = (await admin!.query("SELECT pg_get_functiondef('app.recovery_message_sources_current(uuid,uuid,uuid,jsonb)'::regprocedure) d")).rows[0].d as string;
    expect(def).toContain("coalesce(qs.acceptance_sequence,1) DESC");
    expect(def).not.toContain("a.accepted_at DESC");
    const meta = (await admin!.query("SELECT pg_get_userbyid(proowner) o,proacl::text acl FROM pg_proc WHERE oid='app.recovery_message_sources_current(uuid,uuid,uuid,jsonb)'::regprocedure")).rows[0];
    expect(meta.o).toBe("jobguard_migration"); expect(meta.acl).toMatch(/jobguard_runtime=X/); expect(meta.acl).not.toMatch(/^\{=X/);
  });
});
