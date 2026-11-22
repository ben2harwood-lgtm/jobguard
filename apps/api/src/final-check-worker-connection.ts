import type { Pool } from "pg";

/** Hold the job lock on the same connection used for all shadow writes. */
export async function withFinalCheckWorkerConnection<T>(
  pool: Pool, key: string, work: (pinned: Pool) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  const borrowed = new Proxy(client, { get(target, property) {
    if (property === "release") return () => undefined;
    const value: unknown = Reflect.get(target, property);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  const pinned = { connect: async () => borrowed, query: client.query.bind(client) } as unknown as Pool;
  try {
    await client.query("SELECT pg_advisory_lock(hashtextextended($1,1430))", [key]);
    return await work(pinned);
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(hashtextextended($1,1430))", [key]);
      client.release();
    } catch (error) {
      client.release(error instanceof Error ? error : true);
    }
  }
}
