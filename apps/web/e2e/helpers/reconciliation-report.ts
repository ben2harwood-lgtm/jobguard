import { reconcileFinancialSnapshot } from "@jobguard/core";
export const reportId = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export const reportScope = { tenantId: reportId(1), jobId: reportId(2) };
export const reportFixture = () => {
 const invoiceId = reportId(3), paymentId = reportId(4);
 return { version: "financial-reconciliation-screen.v1" as const, jobId: reportScope.jobId, runId: reportId(20), report: reconcileFinancialSnapshot({
  version: "financial-reconciliation-snapshot.v1", environment: "synthetic_demo", ...reportScope,
  invoices: [{ ...reportScope, id: invoiceId, revision: reportId(5), net: 10000, vat: 2000, gross: 12000 }],
  provider: [
   { ...reportScope, id: paymentId, effectId: reportId(6), invoiceId, kind: "payment", amount: 12000, parentId: null, late: false },
   ...([ ["fee", 300, 7], ["refund", 1000, 9], ["payout", 9000, 11] ] as const).map(([kind, amount, n]) => ({ ...reportScope, id: reportId(n), effectId: reportId(n+1), invoiceId, kind, amount, parentId: paymentId, late: false })),
  ], journals: [],
 }) };
};
