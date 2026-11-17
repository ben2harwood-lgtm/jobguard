// 0518: every guide helper refuses outside the synthetic database, even for a complete, valid set of real inputs.
// Its own file: copying the database stops the fixture's other connections.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { Pool } from "pg";
import { closeFinalCheckFixture, createFinalCheckFixture, seedFinalCheckJob, type FinalCheckFixture } from "./final-check-fixture.js";
import { guideFixture, hash, link, type Job } from "./shadow-demo-guide-fixture.js";

let f: FinalCheckFixture, a: Awaited<ReturnType<ReturnType<typeof guideFixture>["locked"]>>, open: Job, outside: Pool, outsideAdmin: Pool, linkInput: ReturnType<typeof link>;
const run = async (session: { job: string; digest: string }, fn: "hold" | "state" | "inputs" | "link") => {
 const client = await outside.connect();
 const sql = { hold: "SELECT app.demo_request_source_hold($1,$2,$3)", state: "SELECT app.demo_source_hold_state($1,$2,$3)", inputs: "SELECT app.demo_shadow_review_inputs($1,$2,$3)", link: "SELECT app.demo_issue_customer_link($1,$2,$3,$4,$5,$6)" }[fn];
 const args = fn === "link" ? [a.tenantId, session.job, a.customer, session.digest, linkInput.digest, linkInput.path] : [a.tenantId, session.job, session.digest];
 try {
  await client.query("BEGIN"); await client.query("SELECT set_config('app.tenant_id',$1,true)", [a.tenantId]);
  await client.query(sql, args); return { allowed: true };
 } catch (error) { return { refused: (error as Error).message, code: (error as { code?: string }).code }; }
 finally { await client.query("ROLLBACK").catch(() => undefined); client.release(); }
};
beforeAll(async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); f = await createFinalCheckFixture();
 for (const pool of [f.admin, f.runtime, f.shadow]) pool.on("error", () => undefined);
 a = await guideFixture(f).locked(); open = await seedFinalCheckJob(f); linkInput = link(a, a.customer);
 const user = (await f.runtime.query("SELECT current_user u")).rows[0].u as string, config = (f.admin as unknown as { options: { host: string; port: number; password: string } }).options;
 const base = { host: config.host, port: config.port, password: config.password };
 const control = new Pool({ ...base, user: "postgres", database: "postgres" });
 await control.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='jobguard_synthetic_demo' AND pid<>pg_backend_pid()");
 await control.query("CREATE DATABASE jobguard_not_synthetic TEMPLATE jobguard_synthetic_demo"); await control.end();
 outside = new Pool({ ...base, user, database: "jobguard_not_synthetic", max: 1 }); outsideAdmin = new Pool({ ...base, user: "postgres", database: "jobguard_not_synthetic", max: 1 });
 outside.on("error", () => undefined); outsideAdmin.on("error", () => undefined);
}, 600000);
afterAll(async () => { await outside?.end(); await outsideAdmin?.end(); await closeFinalCheckFixture(f); vi.unstubAllEnvs(); });
const synthetic = { refused: "SYNTHETIC_MODE_REQUIRED", code: "42501" };
it("the owner's real session, job, lock and found extra are still refused by database name on all four helpers", async () => {
 expect(await run({ job: open.jobId, digest: open.digest }, "hold")).toEqual(synthetic);
 expect(await run({ job: open.jobId, digest: open.digest }, "state")).toEqual(synthetic);
 expect(await run({ job: a.jobId, digest: a.digest }, "inputs")).toEqual(synthetic);
 expect(await run({ job: a.jobId, digest: a.digest }, "link")).toEqual(synthetic);
});
it("a made-up session gets the same answer from the read helpers as in the demo, and the writers refuse by name", async () => {
 const made = { job: randomUUID(), digest: hash(randomUUID()) };
 for (const fn of ["state", "inputs"] as const) expect(await run(made, fn)).toMatchObject({ refused: "FINAL_CHECK_FORBIDDEN" });
 for (const fn of ["hold", "link"] as const) expect(await run(made, fn)).toEqual(synthetic);
});
it("nothing is written outside the synthetic database", async () => {
 expect((await outsideAdmin.query("SELECT (SELECT count(*)::int FROM infrastructure.demo_source_hold_request) holds,(SELECT count(*)::int FROM app.customer_portal_grant) grants")).rows[0]).toEqual({ holds: 0, grants: 0 });
});
