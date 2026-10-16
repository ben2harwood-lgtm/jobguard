import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authenticatePracticeSession, JobPartiesRepository, PracticeAccessError, withTenant } from "@jobguard/db";
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

type HomeDocument = {
  job_id: string; document_id: string; kind: "quote" | "invoice"; reference: string;
  send_id: string | null; status: string | null; adapter: string | null; delivered: boolean;
};

function documentSummary(document: HomeDocument | undefined): JobSummary["document"] {
  if (!document) return { kind: "none", reference: null, delivery: "not_sent" };
  // These adapters record simulated delivery only. A successful provider call
  // on any other adapter is insufficient without its persisted delivery fact.
  const simulatedDelivery = document.status === "succeeded" && document.adapter === (document.kind === "quote" ? "fake_quote_delivery" : "fake_invoice_delivery");
  const delivery = document.delivered || simulatedDelivery ? "delivered"
    : !document.send_id ? "not_sent"
    : document.status === "outcome_unknown" ? "outcome_unknown"
    : ["pending", "executing", "retryable"].includes(document.status ?? "") ? "queued"
    : "unknown";
  return { kind: document.kind, reference: document.reference, delivery };
}

/** There is deliberately no static/no-database success path. */
export async function syntheticWorkspace() {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw Object.assign(new Error("Synthetic session is unavailable"), {code:"UNAUTHENTICATED"});
  const token=(await cookies()).get("jg_session")?.value;
  const auth=await authenticatePracticeSession(syntheticPool(),token);
  const seeded = await readSyntheticDemo(syntheticPool());
  const { jobs } = await new JobPartiesRepository(syntheticPool()).list(auth.context, auth.membershipId, auth.digest);
  // Scope by the repository's authorized job identities, including captured and
  // adopted jobs. Document and send identities are joined together in one read.
  const documents = await withTenant(syntheticPool(), auth.context, async db => (await db.$client.query<HomeDocument>(`
    WITH documents AS (
      SELECT d.job_id,d.id document_id,'quote'::text kind,d.reference,d.document_version,0 priority,d.created_at,
        s.id send_id,o.status,o.adapter,
        EXISTS(SELECT 1 FROM app.quote_delivery_event e WHERE (e.tenant_id,e.quote_send_id)=(d.tenant_id,s.id) AND e.fact='delivered') delivered
      FROM app.quote_document_version d
      LEFT JOIN LATERAL (
        SELECT s.id,s.outbox_action_id FROM app.quote_send s
        WHERE (s.tenant_id,s.job_id,s.document_id,s.content_hash)=(d.tenant_id,d.job_id,d.id,d.content_hash)
        ORDER BY s.issued_at DESC,s.id DESC LIMIT 1
      ) s ON true
      LEFT JOIN app.action_outbox o ON (o.tenant_id,o.id)=(d.tenant_id,s.outbox_action_id)
      WHERE d.tenant_id=$1 AND d.job_id=ANY($2::uuid[])
      UNION ALL
      SELECT i.job_id,i.id,'invoice'::text,i.invoice_number,0,1,i.created_at,
        i.authorization_id,o.status,o.adapter,false
      FROM app.customer_invoice i
      LEFT JOIN app.action_outbox o ON (o.tenant_id,o.authorization_id)=(i.tenant_id,i.authorization_id)
        AND o.action_type='final_account.issue' AND o.content_hash=i.pdf_sha256
      WHERE i.tenant_id=$1 AND i.job_id=ANY($2::uuid[])
    )
    SELECT DISTINCT ON(job_id) * FROM documents
    ORDER BY job_id,priority DESC,document_version DESC,created_at DESC,document_id DESC
  `, [auth.context.tenantId, jobs.map(job => job.id)])).rows);
  const documentsByJob = new Map(documents.map(document => [document.job_id, document]));
  return {
    tenants: seeded.tenants,
    jobs: jobs.map((job): JobSummary => ({
      id: job.id, tenantId: auth.context.tenantId, title: job.title,
      customerLabel: job.customerLabel??"Details needed", siteLabel: job.siteLabel||"Details needed", status: job.status as JobSummary["status"],
      document: documentSummary(documentsByJob.get(job.id)),
      customerPayment: "not_due",
      pilotNoCharge: true, updatedLabel: `Server revision ${job.revision}`,
    })),
  };
}

export function practiceFailure(error:unknown) {
 if(!(error instanceof PracticeAccessError))return null;
 return NextResponse.json({code:error.code},{status:error.code==="UNAUTHENTICATED"?401:error.code==="NOT_FOUND"?404:403,headers:{"Cache-Control":"no-store"}});
}
