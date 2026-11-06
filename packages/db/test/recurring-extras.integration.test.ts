import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { migrate } from "../src/migrate.js";
import { RecurringExtrasRepository } from "../src/recurring-extras-repository.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
import { freePort, closeTestPools } from "./pool-test-utils.js";
const tenant = randomUUID(), member = randomUUID(), other = randomUUID();
const jobs = [randomUUID(),randomUUID(),randomUUID()];
let pg: EmbeddedPostgres, admin: Pool, runtime: Pool, directory: string;
beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  directory = await mkdtemp(join(tmpdir(), "recurring-extras-"));
  const port = await freePort(57400,100);
  pg = new EmbeddedPostgres({ databaseDir: directory, port, user: "postgres", password: "synthetic", persistent: false,
    createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C","--encoding=UTF8"], onLog: () => undefined });
  await pg.initialise(); await pg.start();
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: "synthetic" });
  await migrate(admin);
  await seed(admin, tenant, member, jobs);
  await seed(admin, other, randomUUID(), [randomUUID(), randomUUID(), randomUUID()]);
  await admin.query("CREATE ROLE recurring_login LOGIN PASSWORD 'synthetic' NOSUPERUSER NOBYPASSRLS; GRANT jobguard_runtime TO recurring_login");
  runtime = new Pool({ host: "127.0.0.1", port, database: "postgres", user: "recurring_login", password: "synthetic", max: 2 });
}, 120000);
afterAll(async () => { vi.unstubAllEnvs(); await closeTestPools(runtime,admin); if(pg) await pg.stop(); if(directory) await rm(directory,{recursive:true,force:true}); });
it("reads exactly this tenant's three current approved sources without writes", async () => {
  const before = await counts(admin,tenant);
  const result = await new RecurringExtrasRepository(runtime).read(testTenantContext(tenant), member, jobs[0]);
  expect(result.suggestions).toHaveLength(1);
  expect(result.suggestions[0]?.jobCount).toBe(3);
  expect(result.suggestions[0]?.sources.map(source => source.jobId).sort()).toEqual([...jobs].sort());
  expect(await counts(admin,tenant)).toEqual(before);
  expect((await runtime.query("SELECT * FROM app.variation_rate_observation")).rows).toEqual([]);
  await expect(new RecurringExtrasRepository(runtime).read(testTenantContext(other),member,jobs[0])).rejects.toThrow("FORBIDDEN");
  await expect(new RecurringExtrasRepository(runtime).read(testTenantContext(tenant),member,randomUUID())).rejects.toThrow("NOT_FOUND");
});
it("withdrawal permanently removes a current approved source from the group", async () => {
  const variation = (await admin.query("SELECT id FROM app.variation WHERE tenant_id=$1 AND job_id=$2",[tenant,jobs[2]])).rows[0].id;
  const c = await admin.connect();
  try {
    await c.query("BEGIN"); await c.query("SET LOCAL session_replication_role=replica");
    await c.query("INSERT INTO app.variation_withdrawal(tenant_id,job_id,id,variation_id,actor_membership_id,reason_code) VALUES($1,$2,$3,$4,$5,'builder_withdrawn')",[tenant,jobs[2],randomUUID(),variation,member]);
    await c.query("COMMIT");
  } finally { await c.query("ROLLBACK"); c.release(); }
  expect((await new RecurringExtrasRepository(runtime).read(testTenantContext(tenant),member,jobs[0])).suggestions).toEqual([]);
});
it("refuses even a valid context outside the synthetic environment", async () => {
  vi.stubEnv("JOBGUARD_ENV","production");
  await expect(new RecurringExtrasRepository(runtime).read(testTenantContext(tenant),member,jobs[0])).rejects.toThrow("SYNTHETIC_ONLY");
});

// Administrative fictional-source fixture only; runtime reads retain all grants, RLS and guards.
async function seed(admin: Pool, tenant: string, member: string, jobIds: string[]) {
  const client = await admin.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL session_replication_role=replica");
    await client.query("INSERT INTO control_plane.tenant(id) VALUES($1) ON CONFLICT DO NOTHING", [tenant]);
    const user = randomUUID(), account = randomUUID();
    await client.query("INSERT INTO identity.identity_user(id) VALUES($1)", [user]);
    await client.query("INSERT INTO app.account(id,tenant_id,name) VALUES($1,$2,'Fictional extras')", [account,tenant]);
    await client.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role) VALUES($1,$2,$3,$4,'owner')", [member,tenant,account,user]);
    const sources: string[] = [];
    for (const [i, job] of jobIds.entries()) {
      await client.query("INSERT INTO app.job(id,tenant_id,title) VALUES($1,$2,'Fictional extras job')", [job,tenant]);
      await client.query("INSERT INTO app.job_commercial_track(tenant_id,job_id,job_track,environment,provenance) VALUES($1,$2,'small_builder','synthetic_demo','backfilled_synthetic_fixture')", [tenant,job]);
      const variation = randomUUID(), revision = randomUUID(), scope = randomUUID(), hash = "a".repeat(64);
      sources.push(variation);
      await client.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state) VALUES($1,$2,$3,'confirmed')", [scope,tenant,job]);
      await client.query(`INSERT INTO app.variation(id,tenant_id,job_id,scope_item_id,capture_kind,capture_text,description,state,current_revision_id,job_track,origin)
        VALUES($1,$2,$3,$4,'text','Fictional capture','Add sockets','approved',$5,'small_builder','builder_logged')`, [variation,tenant,job,scope,revision]);
      await client.query(`INSERT INTO app.variation_revision(id,tenant_id,job_id,variation_id,scope_item_id,revision,description,quantity_decimal,unit,unit_rate_pence,signed_delta_pence,content_hash,confirmed_by_membership_id,rate_provenance_kind,rate_source_ref,rate_source_hash,rate_version)
        VALUES($1,$2,$3,$4,$5,1,'Add sockets','1','each',$6,$6,$7,$8,'human_entered','fixture://extras',$7,'fixture.v1')`, [revision,tenant,job,variation,scope,100+i,hash,member]);
      await client.query(`INSERT INTO app.variation_approval(id,tenant_id,job_id,variation_id,revision_id,revision,content_hash,signed_delta_pence,method,actor_membership_id,approved_at)
        VALUES($1,$2,$3,$4,$5,1,$6,$7,'builder_attestation',$8,clock_timestamp())`, [randomUUID(),tenant,job,variation,revision,hash,100+i,member]);
      await client.query(`INSERT INTO app.variation_rate_observation(id,tenant_id,job_id,variation_id,revision_id,unit,unit_rate_pence,provenance_kind,source_ref,source_hash,rate_version)
        VALUES($1,$2,$3,$4,$5,'each',$6,'human_entered','fixture://extras',$7,'fixture.v1')`, [randomUUID(),tenant,job,variation,revision,100+i,hash]);
    }
    await client.query("COMMIT"); return { user, sources };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
const protectedTables = ["job", "quote_version", "quote_line", "rate_book_observation", "scope_revision", "customer_invoice", "variation", "variation_revision", "variation_rate_observation"];
async function counts(admin: Pool, tenant: string) {
  return Promise.all(protectedTables.map(async table => [table, (await admin.query(`SELECT count(*)::text n, md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY tenant_id,id)::text,'[]')) digest FROM app.${table} t WHERE tenant_id=$1`,[tenant])).rows[0]]));
}
