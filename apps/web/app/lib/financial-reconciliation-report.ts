import { z } from "zod";
import { MAX_MONEY_PENCE } from "@jobguard/core";
const money = z.object({ pence: z.number().int().safe().min(-MAX_MONEY_PENCE).max(MAX_MONEY_PENCE), currency: z.literal("GBP") }).strict();
export const reconciliationReportResponseV1 = z.object({
 version: z.literal("financial-reconciliation-screen.v1"), jobId: z.string().uuid(), runId: z.string().uuid(),
 report: z.object({
  version: z.literal("financial-reconciliation-report.v1"), sourceHash: z.string().regex(/^[a-f0-9]{64}$/u),
  productionEnabled: z.literal(false), referenceOnly: z.literal(true), authoritativeSourceVerification: z.literal(false), realExternalActions: z.literal(0),
  balances: z.object({ invoicedGross: money, invoiceOutstanding: money, journalPayments: money, journalRefunds: money, journalFees: money, journalPayouts: money,
   invoicedNet: money, vat: money, grossCharged: money, refunds: money, providerFees: money, netPayout: money, bankObserved: money,
   outstandingClearing: money, payoutInTransit: money, allocated: money, reserved: money }).strict(),
  queue: z.array(z.object({ differenceId: z.string().regex(/^[a-f0-9]{64}$/u), code: z.string(), refs: z.array(z.string().uuid()), expected: money.nullable(), observed: money.nullable() }).strict()).max(100_000),
 }).strict(),
}).strict();
export type ReconciliationReportResponse = z.infer<typeof reconciliationReportResponseV1>;
