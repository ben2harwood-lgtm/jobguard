import { z } from "zod";
import demoInputs from "../../../../../docs/fixtures/small-builder-demo-inputs.json";
import { finalAccountResponseV1 } from "@jobguard/api/final-account-contracts";
import { practiceInvoiceResponseV1 } from "@jobguard/api/customer-invoice-contracts";
import { receiptBaseSources, mappedValueReceipt, recoveryAttributionRevisionV1 } from "@jobguard/core";
import { finalCheckReadV1 } from "../../ui/final-check-reveal-view";
const uuid = z.string().uuid();
// Use DEMO-P1's fictional source recipe; this is input, never an end-state seed.
export const shadowCaptureText = demoInputs.recipes.find(recipe => recipe.family === "shadow-30000")!.source.text;
export const shadowReportV1 = z.object({
 version: z.literal("shadow-demo-report.v2"), environment: z.literal("synthetic_demo"),
 jobId: uuid, status: z.enum(["incomplete", "complete"]), realExternalActions: z.literal(0),
 customerApproval: z.object({
  state: z.enum(["not_ready_yet", "awaiting_customer", "approved"]),
  approvals: z.array(z.object({ variationId: uuid, approvedAt: z.string().datetime(), method: z.literal("customer_portal") }).strict()),
 }).strict(),
 account: z.object({ jobId: uuid, account: finalAccountResponseV1.shape.account,
  captures: z.array(z.object({ id: uuid, description: z.string(), state: z.string(), origin: z.enum(["builder_logged", "final_review"]), netPence: z.number().int().safe().nullable() })),
  lock: z.object({ id: uuid, finalAccountRevisionId: uuid, lockedAt: z.string(), digest: z.string() }).nullable(),
 }),
 invoices: practiceInvoiceResponseV1,
 value: z.union([
  z.object({ version: z.literal("job-value.v3"), environment: z.literal("synthetic_demo"), jobId: uuid,
   status: z.literal("incomplete"), reason: z.literal("producer_bindings_held"),
   producers: z.object({ sources: z.literal("HELD"), derivation: z.literal("HELD"),
    subscription: z.literal("HELD"), postedMoney: z.literal("HELD") }).strict(), asOf: z.null(), receipt: z.null(),
  }).strict(),
  z.object({ version: z.literal("job-value.v3"), environment: z.literal("synthetic_demo"), jobId: uuid,
   status: z.literal("mapped"), receipt: mappedValueReceipt,
  }).strict(),
 ]),
 finalCheck: finalCheckReadV1.optional(),
 assessments: z.array(z.object({ assessment: recoveryAttributionRevisionV1, illustrationAsAssessed: z.object({ assessmentId: uuid, qualification: z.literal("unreviewed"), productionEnabled: z.literal(false), realExternalActions: z.literal(0), display: z.object({ recovered: z.string().nullable(), fee: z.string(), yoursBeforeVatAndTax: z.string().nullable() }) }) })).optional(),
 packs: z.array(z.object({ caseId: uuid, result: z.unknown() })).optional(),
}).strict();
export type ShadowReport = z.infer<typeof shadowReportV1>;
export function parseShadowReport(raw: unknown, jobId: string): ShadowReport {
 const report = shadowReportV1.parse(raw);
 if ([report.jobId, report.account.jobId, report.invoices.jobId, report.value.jobId].some(id => id !== jobId)) throw new Error("Wrong job report");
 if (report.value.status === "mapped" && (receiptBaseSources(report.value.receipt).jobId !== jobId || receiptBaseSources(report.value.receipt).lockId !== report.account.lock?.id)) throw new Error("Wrong value report");
 if (!report.account.lock && (report.finalCheck || report.assessments || report.packs)) throw new Error("Pre-lock disclosure refused");
 if (report.finalCheck?.lockId && report.finalCheck.lockId !== report.account.lock?.id) throw new Error("Wrong lock report");
 for (const { assessment, illustrationAsAssessed } of report.assessments ?? []) {
  if (assessment.jobId !== jobId || assessment.lockId !== report.account.lock?.id || illustrationAsAssessed.assessmentId !== assessment.assessmentId) throw new Error("Wrong attribution report");
 }
 // The server decides completion from saved records; refuse a report that contradicts its own parts.
 if (report.status === "complete" && (report.customerApproval.state !== "approved" || report.value.status !== "mapped" || report.invoices.invoices.length !== 1 || !report.packs?.length)) throw new Error("Wrong completion report");
 return report;
}

export function shadowApprovalLabel(report: ShadowReport) {
 return report.customerApproval.state === "approved" ? "Step 6: approved by the customer." : report.customerApproval.state === "awaiting_customer" ? "Step 6: awaiting customer approval." : "Step 6: complete the Final Check first.";
}
