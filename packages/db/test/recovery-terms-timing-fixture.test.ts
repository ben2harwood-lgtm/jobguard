import { EventEmitter } from "node:events";
import { Pool, type PoolClient } from "pg";
import { expect, it, vi } from "vitest";
import { practiceMaterialPool } from "../src/practice-session.js";
import { beforeTermsCommitPool } from "./recovery-terms-timing-fixture.js";

// Real pg.Pool.query callback dispatch; only its network transport is fake.
function fixture() {
 const pool = new Pool(), result = { rows: [{ begin_installed: true }] };
 const query = vi.fn((sql: unknown, values?: unknown, callback?: (error: null, result: unknown) => void) => {
  const done = typeof values === "function" ? values as typeof callback : callback;
  if (done) { queueMicrotask(() => done(null, result)); return; }
  return Promise.resolve(result);
 });
 const client = Object.assign(new EventEmitter(), { query, release: vi.fn() }) as unknown as PoolClient;
 const connect = vi.spyOn(pool, "connect").mockImplementation(((callback?: (error: null, client: PoolClient, release: PoolClient["release"]) => void) => {
  if (callback) { callback(null, client, client.release); return; }
  return Promise.resolve(client);
 }) as Pool["connect"]);
 return { pool, client, connect, query, result };
}
it("LP-5 schema probes use native connect(callback) through both transaction and practice proxies", async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 const f = fixture(), barrier = vi.fn(async () => undefined);
 try {
  const intercepted = beforeTermsCommitPool(f.pool, barrier), scoped = practiceMaterialPool(intercepted, "a".repeat(64));
  const probing = scoped.query("SELECT to_regprocedure('app.begin_command(text,uuid,text,text,jsonb,jsonb,jsonb)') IS NOT NULL AS begin_installed");
  // A promise-only connect override would ignore this callback and hang probing.
  expect(f.connect).toHaveBeenCalledWith(expect.any(Function));
  expect(await probing).toEqual(f.result);expect(barrier).not.toHaveBeenCalled();
  expect(f.client.release).toHaveBeenCalledOnce();
  const client = await scoped.connect();await client.query("BEGIN");await client.query("COMMIT");client.release();
  expect(barrier).toHaveBeenCalledExactlyOnceWith(f.client);
  expect(f.client.release).toHaveBeenCalledTimes(2);
  expect(f.query.mock.calls.map(([sql]) => sql)).toContain("SELECT set_config('app.practice_material_digest', $1, true)");
  expect(f.query.mock.calls.map(([sql]) => sql)).toContain("COMMIT");
 } finally { vi.unstubAllEnvs(); await f.pool.end(); }
});
it.each(["commit", "rollback"] as const)("the %s barrier waits without consuming another pool connection", async outcome => {
 const f = fixture();let release!: () => void;
 const waiting = new Promise<void>(resolve => { release = resolve; });
 const barrier = vi.fn(async (client: PoolClient) => {
  await waiting;
  if (outcome === "rollback") { await client.query("ROLLBACK"); throw new Error("DW3 injected rollback"); }
 });
 try {
  const client = await beforeTermsCommitPool(f.pool, barrier).connect();
  const committing = client.query("COMMIT");
  expect(barrier).toHaveBeenCalledExactlyOnceWith(f.client);expect(f.query).not.toHaveBeenCalled();
  expect(f.connect).toHaveBeenCalledTimes(1);release();
  if (outcome === "rollback") await expect(committing).rejects.toThrow("DW3 injected rollback");else await committing;
  expect(f.query.mock.calls.map(([sql]) => sql)).toEqual([outcome === "rollback" ? "ROLLBACK" : "COMMIT"]);
  client.release();
 } finally { release(); await f.pool.end(); }
});
