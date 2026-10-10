import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authenticatePracticeSession, PracticeAccessError, withTenant } from "@jobguard/db";
import { readSyntheticDemo } from "@jobguard/db";
import { SYNTHETIC_SESSION as WORKSPACE_SYNTHETIC_SESSION } from "@jobguard/api/workspace";
import { Pool } from "pg";
import type { JobSummary } from "./contracts";

export const SYNTHETIC_SESSION = WORKSPACE_SYNTHETIC_SESSION;
/** Cookie shape only; mode and persisted membership are enforced by syntheticPool/workspace and PracticeAccess. */
export function hasSyntheticSession(value: string | undefined) { return !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value); }

const poolRegistry = globalThis as typeof globalThis & { __jobguardSyntheticPool?: Pool };
export function syntheticPool() {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw Object.assign(new Error("Synthetic workflow is unavailable"), {code:"UNAUTHENTICATED"});
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw Object.assign(new Error("Database configuration is unavailable"), { code: "DATABASE_UNAVAILABLE" });
  poolRegistry.__jobguardSyntheticPool ??= new Pool({ connectionString, max: 12, application_name: "jobguard-vercel-synthetic-demo" });
  return poolRegistry.__jobguardSyntheticPool;
}

export async function closeSyntheticPool() {
  const pool = poolRegistry.__jobguardSyntheticPool;
  delete poolRegistry.__jobguardSyntheticPool;
  if (pool) await pool.end();
}

/** There is deliberately no static/no-database success path. */
export async function syntheticWorkspace() {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw Object.assign(new Error("Synthetic session is unavailable"), {code:"UNAUTHENTICATED"});
  const token=(await cookies()).get("jg_session")?.value;
  const auth=await authenticatePracticeSession(syntheticPool(),token);
  const seeded = await readSyntheticDemo(syntheticPool());
  const jobs=await withTenant(syntheticPool(),auth.context,async db=>(await db.$client.query<{id:string;title:string;status:string;revision:number;customerLabel?:string;siteLabel?:string}>("SELECT id,title,status,revision FROM app.job WHERE tenant_id=$1 AND practice_session_digest=$2 AND practice_scenario='home' ORDER BY created_at,id",[auth.context.tenantId,auth.digest])).rows);
  return {
    tenants: seeded.tenants,
    jobs: jobs.map((job): JobSummary => ({
      id: job.id, tenantId: seeded.tenant.id, title: job.title,
      customerLabel: job.customerLabel??"Details needed", siteLabel: job.siteLabel||"Details needed", status: job.status as JobSummary["status"],
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

export function practiceFailure(error:unknown) {
 if(!(error instanceof PracticeAccessError))return null;
 return NextResponse.json({code:error.code},{status:error.code==="UNAUTHENTICATED"?401:error.code==="NOT_FOUND"?404:403,headers:{"Cache-Control":"no-store"}});
}
