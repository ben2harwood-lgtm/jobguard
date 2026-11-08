import { readFile } from "node:fs/promises";
import type { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { jobDoorsDatabase, type JobDoorsDatabase } from "./lp-job-doors-fixtures.js";
const migration = new URL("../migrations/0951_company_final_check.sql", import.meta.url);
const names = ["company_final_check_authority", "company_final_check_read", "company_final_check_terms",
  "company_final_check_disposition", "company_final_check_lock", "company_final_check_request_run", "company_final_check_reveal"];
let db: JobDoorsDatabase;
const definitions = async (owner: Pool) => (await owner.query(`SELECT n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) args,
  pg_get_functiondef(p.oid) definition,p.proacl::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('app','identity','control_plane','infrastructure') AND NOT (p.proname=ANY($1::text[]))
  ORDER BY n.nspname,p.proname,args`, [names])).rows;
const grants = async (owner: Pool) => (await owner.query(`SELECT n.nspname,c.relname,c.relacl::text,c.relowner::regrole::text
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('app','identity','control_plane','infrastructure') ORDER BY n.nspname,c.relname`)).rows;
beforeAll(async () => { db = await jobDoorsDatabase(true, "0951_company_final_check.sql"); }, 300_000);
afterAll(async () => { await db?.close(); });
it("adds only named company execution, preserving every predecessor routine definition and table grant", async () => {
  // Install dependency before its consumer (router renumbers the placeholders at landing).
  await db.owner.query(await readFile(new URL("../migrations/0956_bound_context_reader.sql", import.meta.url), "utf8"));
  const before = await definitions(db.owner), tableGrants = await grants(db.owner);
  await db.owner.query(await readFile(migration, "utf8"));
  expect(await definitions(db.owner)).toEqual(before);
  expect(await grants(db.owner)).toEqual(tableGrants);
  const functions = (await db.owner.query(`SELECT p.proname,p.proowner::regrole::text owner,p.prosecdef,
    has_function_privilege('jobguard_runtime',p.oid,'EXECUTE') runtime,
    EXISTS(SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee=0 AND a.privilege_type='EXECUTE') public,
    p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='app' AND p.proname=ANY($1::text[]) ORDER BY p.proname`, [names])).rows;
  expect(functions).toHaveLength(names.length);
  for (const row of functions) expect(row).toMatchObject({ owner: "jobguard_migration", public: false,
    runtime: row.proname !== "company_final_check_authority", prosecdef: row.proname !== "company_final_check_authority",
    proconfig: row.proname === "company_final_check_authority" ? ["search_path=pg_catalog, pg_temp"] : ["search_path=pg_catalog, pg_temp", "TimeZone=UTC"] });
});
it("mutation control: removing a read entry point's authority check breaks the unbound refusal assertion, then restores it", async () => {
  const client = await db.owner.connect();
  try {
    const original = (await client.query("SELECT pg_get_functiondef('app.company_final_check_read(uuid)'::regprocedure) definition")).rows[0].definition as string;
    await client.query("BEGIN");
    const mutant = original.replace("PERFORM app.company_final_check_authority(j,b);", "NULL; -- scratch mutation: removed authority check");
    expect(mutant).not.toBe(original);
    await client.query(mutant);
    await client.query("SET LOCAL ROLE jobguard_runtime");
    // This is the SAME security assertion used by the authority suite. Its
    // rejection matcher must fail on the mutant, rather than counting any error.
    await expect(async () => {
      await expect(client.query("SELECT app.company_final_check_read('10000000-0000-4000-8000-000000000001')"))
        .rejects.toMatchObject({ code: "42501" });
    }).rejects.toThrow();
    await client.query("ROLLBACK");
    expect((await client.query("SELECT pg_get_functiondef('app.company_final_check_read(uuid)'::regprocedure) definition")).rows[0].definition).toBe(original);
  } finally { await client.query("ROLLBACK"); client.release(); }
});
