import { randomUUID } from "node:crypto";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { MIGRATION_URLS, migrate } from "../src/migrate.js";
import { freePort } from "./pool-test-utils.js";
import { proofBefore, proofDifferences, rolledBack, scratchReplaceFunction } from "./upgrade-proof-utils.js";
import { importWatchdogFixtureJob } from "./watchdog-fixtures.js";

let pg: EmbeddedPostgres, admin: Pool, fresh: Pool;
const tenant = randomUUID(), actor = randomUUID(), job = randomUUID(), scope = randomUUID();
const own = MIGRATION_URLS.findIndex(url => url.pathname.endsWith("/0152_proof_replacement_commands.sql"));
const tables = ["app.stage_completion", "app.evidence_invalidation", "app.stage_review_event", "app.command_receipt", "app.evidence_link", "app.evidence_object", "app.watchdog_command_identity", "app.proof_application_response"];
beforeAll(async () => {
  const port = await freePort(62400, 400), directory = await mkdtemp(join(tmpdir(), "jg-migfix-3-upgrade-"));
  const credential = randomUUID();
  pg = new EmbeddedPostgres({ databaseDir: directory, user: "postgres", password: credential, port, persistent: true, createPostgresUser: process.getuid?.() === 0, initdbFlags: ["--lc-messages=C", "--encoding=UTF8"], onLog: () => undefined });
  await pg.initialise(); await pg.start();
  admin = new Pool({ host: "127.0.0.1", port, user: "postgres", password: credential, database: "postgres", max: 1 });
  await admin.query("CREATE TABLE public.jobguard_schema_migration(migration_name text PRIMARY KEY,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())");
  expect(own).toBeGreaterThan(0);
  for (const url of MIGRATION_URLS.slice(0, own)) {
    await admin.query(await readFile(url, "utf8"));
    await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name)VALUES($1)", [url.pathname.split("/").at(-1)]);
  }
  const user = randomUUID(), account = randomUUID(), upload = randomUUID(), link = randomUUID(), completion = randomUUID(), command = randomUUID(), invalidation = randomUUID();
  await admin.query("SELECT set_config('app.tenant_id',$1,false)",[tenant]);
  await admin.query("INSERT INTO control_plane.tenant(id)VALUES($1)", [tenant]);
  await admin.query("INSERT INTO identity.identity_user(id)VALUES($1)", [user]);
  await admin.query("INSERT INTO app.account(id,tenant_id,name)VALUES($1,$2,'Fictional account')", [account, tenant]);
  await admin.query("INSERT INTO app.membership(id,tenant_id,account_id,identity_user_id,role)VALUES($1,$2,$3,$4,'owner')", [actor, tenant, account, user]);
  await importWatchdogFixtureJob(admin, tenant, job);
  await admin.query("INSERT INTO app.scope_identity(id,tenant_id,job_id,state)VALUES($1,$2,$3,'confirmed')", [scope, tenant, job]);
  await admin.query("INSERT INTO app.evidence_upload(id,tenant_id,job_id,scope_item_id,object_key,expected_sha256,expected_content_type,maximum_bytes,retention_class,expires_at)VALUES($1,$2,$3,$4,$5,repeat('a',64),'image/png',100,'standard_evidence','2099-01-01')", [upload, tenant, job, scope, `fixture/${upload}`]);
  await admin.query("UPDATE app.evidence_upload SET state='verified',object_version_id='legacy-E1',server_verified_at=clock_timestamp() WHERE id=$1", [upload]);
  await admin.query("INSERT INTO app.evidence_object(id,tenant_id,upload_id,job_id,scope_item_id,kind,object_key,object_version_id,sha256,byte_length,content_type,evidence_type,retention_class,server_received_at,server_verified_at)VALUES($1,$2,$1,$3,$4,'original',$5,'legacy-E1',repeat('a',64),1,'image/png','electrical_certificate','standard_evidence',clock_timestamp(),clock_timestamp())", [upload, tenant, job, scope, `fixture/${upload}`]);
  await admin.query("INSERT INTO app.evidence_link(id,tenant_id,evidence_id,job_id,scope_item_id,required_evidence_type)VALUES($1,$2,$3,$4,$5,'electrical_certificate')", [link, tenant, upload, job, scope]);
  await admin.query("INSERT INTO app.stage_completion(id,tenant_id,job_id,scope_item_id,stage,evidence_link_id,command_id,completed_at)VALUES($1,$2,$3,$4,'electrical-stage',$5,$6,'2026-10-01 12:00:00.123456+00')", [completion, tenant, job, scope, link, command]);
  await admin.query("INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,result,actor_membership_id,completed_at)VALUES($1,$2,'proof.complete',$3,repeat('a',64),'succeeded',$4,$5,clock_timestamp())", [command, tenant, `${job}:${scope}:electrical-stage`, { completionId: completion, evidenceId: upload, state: "complete" }, actor]);
  await admin.query("INSERT INTO app.watchdog_command_identity(tenant_id,command_id,job_id,command_type,request_hash)VALUES($1,$2,$3,'proof.complete',repeat('a',64))", [tenant,command,job]);
  await admin.query("INSERT INTO app.proof_application_response(tenant_id,command_id,job_id,action,command_type,request_hash,response)VALUES($1,$2,$3,'complete','proof.complete',repeat('a',64),$4)", [tenant,command,job,{ completionId:completion,evidenceId:upload,version:"fixture.v1" }]);
  await admin.query("INSERT INTO app.evidence_invalidation(id,tenant_id,evidence_id,actor_membership_id,reason_code)VALUES($1,$2,$3,$4,'object_revoked')", [invalidation, tenant, upload, actor]);
  await admin.query("INSERT INTO app.stage_review_event(id,tenant_id,stage_completion_id,evidence_invalidation_id,event_type)VALUES($1,$2,$3,$4,'proof_rework_required')", [randomUUID(), tenant, completion, invalidation]);
  await admin.query("CREATE DATABASE migfix3_fresh");
  fresh = new Pool({ host: "127.0.0.1", port, user: "postgres", password: credential, database: "migfix3_fresh" });
}, 120000);
afterAll(async () => { await fresh?.end(); await admin?.end(); await pg?.stop(); });

it("[MIGFIX-3.U1] installs N alone, preserves old identities/columns/microseconds, then applies later migrations twice", async () => {
  const before = await proofBefore(admin, tables);
  for (const table of tables) expect(Object.keys(before[table]!.rows).length, `${table} has pre-existing rows`).toBeGreaterThan(0);
  const functions = (await admin.query("SELECT oid,pg_get_functiondef(oid) definition FROM pg_proc WHERE pronamespace='app'::regnamespace ORDER BY oid")).rows;
  const checks = (await admin.query("SELECT conname,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE contype='c' AND conrelid IN ('app.watchdog_command_identity'::regclass,'app.proof_application_response'::regclass) ORDER BY conname")).rows;
  await admin.query(await readFile(MIGRATION_URLS[own]!, "utf8"));
  await admin.query("INSERT INTO public.jobguard_schema_migration(migration_name)VALUES($1)", [MIGRATION_URLS[own]!.pathname.split("/").at(-1)]);
  expect(await proofDifferences(admin, before)).toEqual({ rows: [], types: [] });
  for (const previous of functions) expect((await admin.query("SELECT pg_get_functiondef($1::oid) definition", [previous.oid])).rows[0].definition).toBe(previous.definition);
  expect((await admin.query("SELECT conname,pg_get_constraintdef(oid) definition FROM pg_constraint WHERE contype='c' AND conrelid IN ('app.watchdog_command_identity'::regclass,'app.proof_application_response'::regclass) ORDER BY conname")).rows).toEqual(checks);
  await migrate(admin); await migrate(admin);
  expect(await proofDifferences(admin, before)).toEqual({ rows: [], types: [] });
  await migrate(fresh); await migrate(fresh);
  expect((await fresh.query("SELECT count(*)::int n FROM public.jobguard_schema_migration")).rows[0].n).toBe(MIGRATION_URLS.length);
  await rolledBack(admin, async db => {
    // Main's 0144 FK from job_site_source_receipt pins stage_completion.completed_at; this rolled-back control only needs the changed microsecond, so FK triggers are disabled inside the rolled-back transaction.
    await db.query("SET LOCAL session_replication_role=replica");
    await db.query("UPDATE app.stage_completion SET completed_at=completed_at+interval '1 microsecond' WHERE tenant_id=$1", [tenant]);
    expect((await proofDifferences(db, before)).rows).toHaveLength(1);
  });
  await rolledBack(admin, async db => {
    await db.query("ALTER TABLE app.command_receipt ALTER COLUMN semantic_key TYPE varchar(301)");
    expect((await proofDifferences(db, before)).types).toHaveLength(1);
  });
  await rolledBack(admin, async db => {
    await db.query("ALTER TABLE app.stage_completion ADD COLUMN later_nullable text");
    expect(await scratchReplaceFunction(db, "app.half_even_ratio(bigint,bigint,bigint)")).toBe(true);
    await db.query("INSERT INTO app.command_receipt(command_id,tenant_id,command_type,semantic_key,request_hash,status,actor_membership_id)VALUES($1::uuid,$2,'later.fixture',$1::text,repeat('b',64),'processing',$3)", [randomUUID(), tenant, actor]);
    expect(await proofDifferences(db, before)).toEqual({ rows: [], types: [] });
  });
}, 120000);
