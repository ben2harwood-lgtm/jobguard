import type { Pool } from "pg";
import { z } from "zod";
import { recoveryAttributionRevisionV1 } from "@jobguard/core";
import { PracticeAccess } from "./practice-access.js";
import { FinalAccountLockApplication } from "./final-account-lock.application.js";
import { FinalCheckApplication } from "./final-check.application.js";
import { RecoveryAttributionApplication } from "./recovery-attribution.application.js";
import { attributionValueReceipt } from "./recovery-attribution-value.js";
import { CustomerInvoiceApplication } from "./customer-invoice.application.js";
import { ValueV3Application } from "./value/value-v3.application.js";
import { EvidencePackApplication } from "./evidence-pack.application.js";

export class ShadowDemoQueryError extends Error {
 readonly code = "INVALID_SHADOW_DEMO_QUERY";
 constructor() { super("INVALID_SHADOW_DEMO_QUERY"); }
}

/** Compose public producers only. No hidden sources, counts or detector imports.
 * Before lock even the reveal/history/pack ports are unreachable. A saved
 * assessment remains historical and unreviewed, including after a reversal. */
export class ShadowDemoApplication {
 private readonly access: PracticeAccess;
 constructor(private readonly pool: Pool, private readonly sessionId?: string) {
  this.access = new PracticeAccess(pool, sessionId);
 }
 async read(jobId: string, query: unknown = {}) {
  const auth = await this.access.job(jobId);
  if (!z.object({}).strict().safeParse(query).success) throw new ShadowDemoQueryError();
  const account = await new FinalAccountLockApplication(this.pool, this.sessionId).get(jobId);
  const invoices = await new CustomerInvoiceApplication(this.pool, this.sessionId).get(jobId);
  const value = await new ValueV3Application(this.pool, this.sessionId).readJob(jobId);
  // These are builder-visible records. Holding a signal cannot alter them.
  const visible = {
   version: "shadow-demo-report.v1" as const, environment: "synthetic_demo" as const,
   jobId, status: "incomplete" as const, realExternalActions: 0 as const,
   customerApproval: "not_ready_yet" as const, account, invoices, value,
  };
  if (!account.lock) return visible;
  const finalCheck = await new FinalCheckApplication(this.pool, this.sessionId).get(jobId);
  if (finalCheck.lockId !== account.lock.id) throw new Error("SHADOW_DEMO_SOURCE_REJECTED");
  if (finalCheck.state !== "completed") return { ...visible, finalCheck };
  const history = await new RecoveryAttributionApplication(this.pool, this.sessionId).get(jobId);
  const latest = new Map<string, z.infer<typeof recoveryAttributionRevisionV1>>();
  for (const raw of history.revisions) {
   const revision = recoveryAttributionRevisionV1.parse(raw);
   if (revision.tenantId !== auth.context.tenantId || revision.jobId !== jobId) throw new Error("SHADOW_DEMO_SOURCE_REJECTED");
   if (revision.lockId !== account.lock.id) throw new Error("SHADOW_DEMO_SOURCE_REJECTED");
   const key = JSON.stringify([revision.caseId, revision.workId, revision.lineId, revision.lockId]);
   const previous = latest.get(key);
   if (!previous || revision.revision > previous.revision) latest.set(key, revision);
  }
  // Never sum per-line rounded fees, or call an old eligible assessment current Q.
  const assessments = [...latest.values()].map(revision => ({
   assessment: revision, illustrationAsAssessed: attributionValueReceipt(revision),
  }));
  const packs = [];
  for (const caseId of new Set(assessments.map(item => item.assessment.caseId))) {
   packs.push({ caseId, result: await new EvidencePackApplication(this.pool).listV3(this.sessionId, caseId) });
  }
  return { ...visible, finalCheck, assessments, packs };
 }
}
