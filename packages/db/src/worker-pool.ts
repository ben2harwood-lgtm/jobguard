import { Pool } from "pg";
import { z } from "zod";

let configured: { url: string; pool: Pool } | undefined;
/** A separate secret, never inferred from or substituted with the web password. */
export async function outboundWorkerPool(_sourcePool?: Pool): Promise<Pool> {
  const url = z.string().url().parse(process.env.WORKER_DATABASE_URL);
  if (configured && configured.url !== url) throw new Error("WORKER_DATABASE_URL_CHANGED");
  configured ??= { url, pool: new Pool({ connectionString: url, application_name: "jobguard-outbound-worker", max: 2 }) };
  return configured.pool;
}
export async function closeOutboundWorkerPool(): Promise<void> {
  const previous = configured;
  configured = undefined;
  await previous?.pool.end();
}
