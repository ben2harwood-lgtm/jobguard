import { Pool, type PoolClient } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ContractorRepository, prepareWorkOrderDemo, seedNorthsideDemo, type AuthenticatedMembership, type VerifiedTenantContext } from "../src/index.js";
import { cluster, type Cluster } from "./extra-fixtures.js";
import { startSession } from "./contractor-practice-session-fixtures.js";

const paths = [
  { name: "work order", key: 56, run: (pool: Pool, p: AuthenticatedMembership, _context: VerifiedTenantContext) => prepareWorkOrderDemo(pool, p) },
  { name: "nested Northside", key: 57, run: seedNorthsideDemo },
];
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
};
afterEach(() => vi.restoreAllMocks());

describe("cleanup (no PostgreSQL)", () => {
  for (const path of paths) {
    for (const stage of ["BEGIN", "acquire", "seed"] as const) {
      for (const brokenRollback of [false, true]) {
        it(`${path.name}: preserves ${stage} failure and ${brokenRollback ? "discards" : "releases"} the client`, async () => {
          const original = new Error(`fictional ${stage} failure`);
          const query = vi.fn(async (sql: string) => {
            if ((stage === "BEGIN" && sql === "BEGIN") || (stage === "acquire" && sql.includes("pg_advisory_xact_lock"))) throw original;
            if (brokenRollback && sql === "ROLLBACK") throw new Error("fictional rollback failure");
            return { rows: [] };
          });
          const release = vi.fn();
          const pool = { connect: vi.fn(async () => ({ query, release })) } as unknown as Pool;
          vi.spyOn(ContractorRepository.prototype, "query").mockRejectedValue(original);
          const principal = { tenantId: "fictional" } as AuthenticatedMembership;
          await expect(path.run(pool, principal, {} as VerifiedTenantContext)).rejects.toBe(original);
          expect(query.mock.calls.at(-1)).toEqual(["ROLLBACK"]);
          expect(release).toHaveBeenCalledExactlyOnceWith(brokenRollback);
          if (stage === "seed") expect(query.mock.calls.slice(0, 2)).toEqual([
            ["BEGIN"], [`SELECT pg_advisory_xact_lock(hashtextextended($1,${path.key}))`, [principal.tenantId]],
          ]);
        });
      }
    }
  }
});

// Real PostgreSQL proofs run in CI; no hosted transaction-pooler claim is made.
describe("PostgreSQL seed serialization", () => {
  let c: Cluster;
  beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await cluster(); }, 240_000);
  afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });
  const poolForRequest = () => new Pool({ ...c.runtime.options, max: 3, maxUses: 1, connectionTimeoutMillis: 10_000 });

  // Wrap only the dedicated first checkout. Repository transactions still use
  // the real pool, including the two nested coordinator checkouts in Northside.
  function observe(pool: Pool, key: number, hold = false, fail?: "seed" | "rollback" | "seed+rollback") {
    const acquired = deferred(), resume = deferred();
    const state = { pid: 0, released: vi.fn(), acquired, resume };
    const connect = pool.connect.bind(pool);
    vi.spyOn(pool, "connect").mockImplementationOnce((async () => {
      const client = await connect();
      const proxy = {
        query: async (sql: string, args?: unknown[]) => {
          if (sql === "ROLLBACK" && (fail === "rollback" || fail === "seed+rollback")) throw new Error("fictional rollback failure");
          const result = await client.query(sql, args);
          if (sql.includes(`pg_advisory_xact_lock(hashtextextended($1,${key}))`)) {
            state.pid = (await client.query("SELECT pg_backend_pid() pid")).rows[0].pid;
            acquired.resolve();
            if (hold) await resume.promise;
            if (fail === "seed" || fail === "seed+rollback") throw new Error("fictional acquired seed failure");
          }
          if (sql === "ROLLBACK") {
            // Inspect before release: maxUses=1 would otherwise hide a leaked
            // session lock by destroying the backend when it returns to the pool.
            expect((await c.admin.query("SELECT 1 FROM pg_locks WHERE pid=$1 AND locktype='advisory'", [state.pid])).rows).toEqual([]);
          }
          return result;
        },
        release: (discard: boolean) => { state.released(discard); client.release(discard); },
      } as unknown as PoolClient;
      return proxy;
    }) as Pool["connect"]);
    return state;
  }

  async function counts(tenant: string) {
    const tables = ["client_organisation", "client_contract_version", "sor_version", "site_revision", "contractor_member", "work_order", "command_receipt", "audit_event"];
    return Promise.all(tables.map(async table => (await c.admin.query(`SELECT count(*)::int n FROM app.${table} WHERE tenant_id=$1`, [tenant])).rows[0].n));
  }
  async function available(tenant: string, key: number) {
    const client = await c.admin.connect();
    try {
      await client.query("BEGIN");
      return (await client.query("SELECT pg_try_advisory_xact_lock(hashtextextended($1,$2)) ok", [tenant, key])).rows[0].ok;
    } finally { await client.query("ROLLBACK"); client.release(); }
  }

  for (const path of paths) {
    it(`${path.name}: concurrent requests serialize, retain the stored seed, and release transaction-owned locks on early return`, async () => {
      const session = await startSession(c);
      const firstPool = poolForRequest(), secondPool = poolForRequest();
      const first = observe(firstPool, path.key, true), second = observe(secondPool, path.key, true);
      const one = path.run(firstPool, session.p, session.context);
      let two: ReturnType<typeof path.run> | undefined;
      try {
        await first.acquired.promise;
        expect(await available(session.p.tenantId, path.key)).toBe(false);
        two = path.run(secondPool, session.p, session.context);
        // A real ungranted advisory lock proves the second seed is waiting.
        await vi.waitFor(async () => {
          const locks = await c.admin.query(`SELECT granted FROM pg_locks WHERE locktype='advisory'
            AND (classid::bigint << 32 | objid::bigint)=hashtextextended($1,$2) AND objsubid=1`, [session.p.tenantId, path.key]);
          expect(locks.rows).toEqual(expect.arrayContaining([{ granted: true }, { granted: false }]));
        }, { timeout: 10_000 });
        first.resume.resolve();
        const seed = await one;
        await second.acquired.promise;
        const before = await counts(session.p.tenantId);
        expect(before[0]).toBe(path.key === 57 ? 3 : 1);
        expect(before[5]).toBe(path.key === 57 ? 2000 : 0);
        second.resume.resolve();
        expect(await two).toEqual(seed);
        expect(await counts(session.p.tenantId)).toEqual(before);
        expect(first.released).toHaveBeenCalledExactlyOnceWith(false);
        expect(second.released).toHaveBeenCalledExactlyOnceWith(false);
        // A session-owned lock would survive ROLLBACK. Single-use clients are
        // destroyed on release, so also check disappearance BEFORE release below.
        expect(await available(session.p.tenantId, path.key)).toBe(true);
      } finally {
        first.resume.resolve(); second.resume.resolve();
        await Promise.allSettled([one, ...(two ? [two] : [])]);
        await Promise.all([firstPool.end(), secondPool.end()]);
      }
    }, 600_000);

    it(`${path.name}: acquired failure rolls back, permits retry, and failed rollback destroys the backend`, async () => {
      const session = await startSession(c);
      for (const failure of ["seed", "seed+rollback", "rollback"] as const) {
        const pool = poolForRequest();
        const state = observe(pool, path.key, false, failure);
        try {
          await expect(path.run(pool, session.p, session.context)).rejects.toThrow(
            failure === "rollback" ? "fictional rollback failure" : "fictional acquired seed failure");
          expect(state.released).toHaveBeenCalledExactlyOnceWith(failure !== "seed");
          await vi.waitFor(async () => expect(await available(session.p.tenantId, path.key)).toBe(true));
          const next = await pool.connect();
          try { expect((await next.query("SELECT pg_backend_pid() pid")).rows[0].pid).not.toBe(state.pid); }
          finally { next.release(); }
          // Retry uses the same stored seed after a successful seed whose cleanup failed.
          expect(await path.run(pool, session.p, session.context)).toBeDefined();
        } finally { await pool.end(); }
      }
    }, 600_000);
  }
});
