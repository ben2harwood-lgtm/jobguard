import "server-only";
import { readSyntheticDemo } from "@jobguard/db";
import { SYNTHETIC_SESSION as WORKSPACE_SYNTHETIC_SESSION } from "@jobguard/api/workspace";
import { Pool } from "pg";
import type { JobSummary } from "./contracts";

export const SYNTHETIC_SESSION = WORKSPACE_SYNTHETIC_SESSION;
export function hasSyntheticSession(value: string | undefined) { return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value); }

const poolRegistry = globalThis as typeof globalThis & { __jobguardSyntheticPool?: Pool };
export function syntheticPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw Object.assign(new Error("Database configuration is unavailable"), { code: "DATABASE_UNAVAILABLE" });
  poolRegistry.__jobguardSyntheticPool ??= new Pool({ connectionString, max: 4, application_name: "jobguard-vercel-synthetic-demo" });
  return poolRegistry.__jobguardSyntheticPool;
}

export async function closeSyntheticPool() {
  const pool = poolRegistry.__jobguardSyntheticPool;
  delete poolRegistry.__jobguardSyntheticPool;
  if (pool) await pool.end();
}

/** There is deliberately no static/no-database success path. */
export async function syntheticWorkspace() {
  const seeded = await readSyntheticDemo(syntheticPool());
  return {
    tenants: seeded.tenants,
    jobs: seeded.jobs.map((job): JobSummary => ({
      id: job.id, tenantId: seeded.tenant.id, title: job.title,
      customerLabel: "Synthetic customer · demo only", status: job.status as JobSummary["status"],
      document: job.title === "Kitchen extension"
        ? { kind: "quote", reference: "Q-1007", delivery: "delivered" }
        : job.title === "Loft conversion"
          ? { kind: "quote", reference: "Q-1008", delivery: "queued" }
          : { kind: "none", reference: null, delivery: "not_sent" },
      customerPayment: "not_due",
      pilotNoCharge: true, updatedLabel: `Server revision ${job.revision}`,
    })),
  };
}
