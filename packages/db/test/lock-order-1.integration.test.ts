// Real PostgreSQL only. NOT RUN in the builder sandbox: it cannot start PostgreSQL.
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, expect, it } from "vitest";
import { SiteExtraRepository, WorkOrderRepository, demoFile, demoRow, derivedUuid, verifiedTenantContextFromMembership } from "../src/index.js";
import { cluster, type Cluster, type Fixture } from "./extra-fixtures.js";
import { siteFixture, chain, command } from "./site-extra-fixtures.js";

let c: Cluster;
beforeAll(async () => {
  c = await cluster();
  // New runtime connections inherit this, so a lock cycle cannot hide behind a long timeout.
  await c.admin.query("ALTER DATABASE jobguard_synthetic_demo SET deadlock_timeout = '100ms'");
  await c.admin.query("ALTER DATABASE jobguard_synthetic_demo SET statement_timeout = '10s'");
}, 180_000);
afterAll(async () => { await c?.close(); });

const request = (f: Fixture) => ({ commandId: randomUUID(), jobId: f.jobId, note: "Fictional concurrent site extra", description: "Fictional extra" });
const revise = (pool: Pool, f: Fixture, expectedRevision: number) => new WorkOrderRepository(pool).importCsv(f.p, {
  commandId: randomUUID(), name: "fictional-lock-order.csv", kind: "csv",
  csv: demoFile([demoRow(f.demo, 1, { expectedRevision, priority: expectedRevision % 2 ? "emergency" : "routine" })]),
});

/** Each participant owns a pre-connected pool with one connection; no race can share a session. */
async function connections<T>(work: (pools: Pool[]) => Promise<T>): Promise<T> {
  const pools = Array.from({ length: 3 }, () => new Pool({ ...c.runtime.options, password: c.runtime.options.password, max: 1 }));
  try {
    const pids = await Promise.all(pools.map(async pool => (await pool.query("SELECT pg_backend_pid() pid")).rows[0]!.pid));
    expect(new Set(pids).size).toBe(3);
    return await work(pools);
  } finally { await Promise.all(pools.map(pool => pool.end())); }
}

/** Release all commands from one barrier, after all participants have arrived. */
async function together(operations: Array<() => Promise<unknown>>) {
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  let arrived = 0;
  const pending = operations.map(async operation => {
    if (++arrived === operations.length) release();
    await barrier;
    return operation();
  });
  return Promise.allSettled(pending);
}

async function revisionState(f: Fixture) {
  return (await c.admin.query(`SELECT r.revision,r.id,
    (SELECT count(*)::int FROM app.work_order_revision WHERE tenant_id=$1 AND work_order_id=$2) total
    FROM app.work_order_current k JOIN app.work_order_revision r
    ON (r.tenant_id,r.work_order_id,r.id)=(k.tenant_id,k.work_order_id,k.revision_id)
    WHERE k.tenant_id=$1 AND k.work_order_id=$2`, [f.p.tenantId, f.orderId])).rows[0]!;
}

async function consistentCapture(f: Fixture, input: ReturnType<typeof request>, result: PromiseSettledResult<unknown>, baselines: string[]) {
  const rows = (await c.admin.query(`SELECT o.variation_id,o.work_order_revision_id,c.status,
    v.id variation,s.id scope,e.variation_id logged,r.id baseline
    FROM app.extra_origin o
    LEFT JOIN app.command_receipt c ON (c.tenant_id,c.command_id)=(o.tenant_id,o.command_id)
    LEFT JOIN app.variation v ON (v.tenant_id,v.job_id,v.id)=(o.tenant_id,o.job_id,o.variation_id)
    LEFT JOIN app.scope_identity s ON (s.tenant_id,s.job_id,s.id)=(v.tenant_id,v.job_id,v.scope_item_id)
    LEFT JOIN app.extra_event e ON (e.tenant_id,e.job_id,e.variation_id,e.command_id)=(o.tenant_id,o.job_id,o.variation_id,o.command_id) AND e.kind='logged'
    LEFT JOIN app.work_order_revision r ON (r.tenant_id,r.work_order_id,r.id)=(o.tenant_id,o.work_order_id,o.work_order_revision_id)
    WHERE o.tenant_id=$1 AND o.command_id=$2`, [f.p.tenantId, input.commandId])).rows;
  const id = derivedUuid(`extra:${f.p.tenantId}:${f.jobId}:${input.commandId}`);
  if (result.status === "fulfilled") {
    expect(result.value).toMatchObject({ variationId: id });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ variation_id: id, variation: id, logged: id, status: "succeeded", scope: expect.any(String), baseline: expect.any(String) });
    expect(baselines).toContain(rows[0]!.work_order_revision_id);
    expect((await c.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1 AND subject_ref=$2 AND event_type='contractor.extra.raised'", [f.p.tenantId, id])).rows[0]!.n).toBe(1);
  } else {
    expect(["STALE_REVISION", "NOT_FOUND", "EXTRA_FORBIDDEN"]).toContain((result.reason as { code?: string }).code);
    expect(rows).toEqual([]);
    expect((await c.admin.query("SELECT command_id FROM app.command_receipt WHERE tenant_id=$1 AND command_id=$2", [f.p.tenantId, input.commandId])).rows).toEqual([]);
    expect((await c.admin.query("SELECT id FROM app.variation WHERE tenant_id=$1 AND id=$2", [f.p.tenantId, id])).rows).toEqual([]);
  }
}

function revised(result: PromiseSettledResult<unknown>): number {
  if (result.status === "rejected") {
    expect(["STALE_REVISION", "NOT_FOUND", "EXTRA_FORBIDDEN"]).toContain((result.reason as { code?: string }).code);
    return 0;
  }
  const value = result.value as Awaited<ReturnType<typeof revise>>;
  expect(value.rows).toHaveLength(1);
  const row = value.rows[0]!;
  if (row.outcome === "rejected") {
    expect(["STALE_REVISION", "NOT_FOUND", "EXTRA_FORBIDDEN"]).toContain(row.errorCode);
    return 0;
  }
  expect(row.outcome).toBe("revised");
  expect(value.counts.revised).toBe(1);
  return 1;
}

it("[LOCK-ORDER-1(a)] holds the shared tenant administration lock before the origin foreign key can lock the work order", async () => {
  const f = await siteFixture(c), operative = f.members.operative;
  const observed: boolean[] = [];
  const pool = new Pool({ ...c.runtime.options, password: c.runtime.options.password, max: 1 });
  pool.on("connect", client => {
    const query = client.query.bind(client);
    // Observe actual PostgreSQL locks immediately before the real INSERT; no repository or database effect is faked.
    client.query = (async (sql: string, values?: unknown[]) => {
      if (sql.startsWith("INSERT INTO app.extra_origin(")) {
        const locks = await query(`SELECT EXISTS(SELECT 1 FROM pg_locks WHERE pid=pg_backend_pid()
          AND locktype='advisory' AND mode='ShareLock' AND granted AND objsubid=1
          AND classid::bigint=(hashtextextended($1,54)>>32)::bit(32)::bigint
          AND objid::bigint=hashtextextended($1,54)::bit(32)::bigint) held`, [f.p.tenantId]);
        observed.push(locks.rows[0]!.held as boolean);
      }
      return query(sql, values);
    }) as typeof client.query;
  });
  try {
    await new SiteExtraRepository(pool).logSiteExtra(verifiedTenantContextFromMembership(operative.member), operative.member, request(f));
    expect(observed).toEqual([true]);
  } finally { await pool.end(); }
});

it("[LOCK-ORDER-1(c)] 50 same-instant captures and baseline revisions use separate connections and leave consistent committed state", async () => {
  const f = await siteFixture(c), operative = f.members.operative;
  const context = verifiedTenantContextFromMembership(operative.member);
  let successes = 0, captures = 0;
  await connections(async ([capturePool, revisionPool]) => {
    for (let round = 0; round < 50; round++) {
      const before = await revisionState(f), input = request(f);
      const results = await together([
        () => new SiteExtraRepository(capturePool!).logSiteExtra(context, operative.member, input),
        () => revise(revisionPool!, f, before.revision),
      ]);
      const applied = revised(results[1]!); successes += applied;
      const after = await revisionState(f);
      expect(after.revision, `round ${round}`).toBe(before.revision + applied);
      expect(after.total, `round ${round}`).toBe(before.total + applied);
      if (results[0]!.status === "fulfilled") captures++;
      await consistentCapture(f, input, results[0]!, [before.id, after.id]);
    }
  });
  // This scenario changes neither authority nor the expected revision: it must make progress.
  expect(successes).toBe(50); expect(captures).toBe(50);
  expect((await revisionState(f)).total).toBe(51);
  expect((await c.admin.query("SELECT count(*)::int n FROM app.extra_origin WHERE tenant_id=$1 AND job_id=$2", [f.p.tenantId, f.jobId])).rows[0]!.n).toBe(50);
  await chain(c, f);
}, 120_000);

it("[LOCK-ORDER-1(d)] M31-S15 same-instant capture, revoke and revise have explicit outcomes", async () => {
  for (let round = 0; round < 4; round++) {
    const f = await siteFixture(c), operative = f.members.operative;
    const context = verifiedTenantContextFromMembership(operative.member), input = request(f);
    const before = await revisionState(f);
    await connections(async ([capturePool, revisionPool, revokePool]) => {
      const operations = [
        () => new SiteExtraRepository(capturePool!).logSiteExtra(context, operative.member, input),
        () => command({ ...c, runtime: revokePool! }, f, { kind: "grant.revoke", grantId: operative.grant }),
        () => revise(revisionPool!, f, before.revision),
      ];
      // Rotate arrival order while retaining a single simultaneous release.
      const order = [round % 3, (round + 1) % 3, (round + 2) % 3];
      const settled = await together(order.map(index => operations[index]!));
      const results = [0, 1, 2].map(index => settled[order.indexOf(index)]!);
      expect(results[1]!.status).toBe("fulfilled");
      expect(revised(results[2]!)).toBe(1);
      const after = await revisionState(f);
      expect(after.revision).toBe(2); expect(after.total).toBe(2); expect(after.id).not.toBe(before.id);
      await consistentCapture(f, input, results[0]!, [before.id, after.id]);
      for (const replay of [input, request(f)]) {
        await expect(new SiteExtraRepository(capturePool!).logSiteExtra(context, operative.member, replay)).rejects.toMatchObject({ code: "NOT_FOUND" });
      }
      await chain(c, f);
    });
  }
}, 120_000);
