import "server-only";
import { readSyntheticDemo } from "@jobguard/db";
import { SYNTHETIC_SESSION } from "@jobguard/api/workspace";
import { Pool } from "pg";
import type { JobSummary } from "./contracts";

export { SYNTHETIC_SESSION };
export function hasSyntheticSession(value: string | undefined) { return value === SYNTHETIC_SESSION; }

let runtimePool: Pool | undefined;
export function syntheticPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw Object.assign(new Error("Database configuration is unavailable"), { code: "DATABASE_UNAVAILABLE" });
  runtimePool ??= new Pool({ connectionString, max: 4, application_name: "jobguard-vercel-synthetic-demo" });
  return runtimePool;
}

/** There is deliberately no static/no-database success path. */
export async function syntheticWorkspace() {
  const seeded = await readSyntheticDemo(syntheticPool());
  return {
    tenants: [seeded.tenant],
    jobs: seeded.jobs.map((job): JobSummary => ({
      id: job.id, tenantId: seeded.tenant.id, title: job.title,
      customerLabel: "Synthetic customer · demo only", status: job.status as JobSummary["status"],
      document: { kind: "none", reference: null, delivery: "not_sent" }, customerPayment: "not_due",
      pilotNoCharge: true, updatedLabel: `Server revision ${job.revision}`,
    })),
  };
}
