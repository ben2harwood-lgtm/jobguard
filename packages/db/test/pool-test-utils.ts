import type { Pool } from "pg";

/**
 * Close test pools and let their socket shutdown events drain before terminating
 * an embedded Postgres process. node-postgres can resolve `Pool.end()` before
 * the final socket event has passed through the event loop; stopping Postgres
 * in that window reports a spurious FATAL 57P01 to Vitest.
 */
export async function closeTestPools(...pools: Array<Pool | undefined>): Promise<void> {
  await Promise.all(pools.map(async (pool) => pool?.end()));
  await new Promise<void>((resolve) => setTimeout(resolve, 25));
}
