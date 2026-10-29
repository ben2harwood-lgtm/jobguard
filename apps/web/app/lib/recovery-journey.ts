import { z } from "zod";
import { successFeeAvailabilityV1 } from "@jobguard/core";
import { recoveryAllocationViewV1 } from "../../../api/src/recovery-allocation.contracts";

export const recoveryJourneyUnavailable = "Not ready yet";
export const recoveryJourneyMarkers = [
  ["success-fee-net-posted", "Success fee net posted"],
  ["fee-refunded-principal", "Fee refunded principal"],
  ["value-found-yours-before-tax", "Yours before tax"],
  ["unresolved-money-differences", "Unresolved money differences"],
] as const;

/** Read real job sources only. Reference calculators and fixture totals confer no completion authority. */
export async function readRecoveryJourney(jobId: string, read: typeof fetch, signal?: AbortSignal) {
  const job = z.string().uuid().parse(jobId);
  const base = `/api/jobs/${job}`;
  const [allocationResponse, feeResponse] = await Promise.all([
    read(`${base}/recovery-allocations`, { cache: "no-store", ...(signal ? { signal } : {}) }),
    read(`${base}/success-fees`, { cache: "no-store", ...(signal ? { signal } : {}) }),
  ]);
  // Access failures never become a report, including an apparently harmless empty one.
  if (!allocationResponse.ok || !feeResponse.ok) throw new Error("Recovery journey sources unavailable");
  const allocations = recoveryAllocationViewV1.parse(await allocationResponse.json());
  const fees = successFeeAvailabilityV1.parse(await feeResponse.json());
  if (allocations.jobId !== job || fees.jobId !== job) throw new Error("Recovery journey source mismatch");
  return { jobId: job, allocations, fees, complete: false as const, realExternalActions: 0 as const };
}
export type RecoveryJourneySnapshot = Awaited<ReturnType<typeof readRecoveryJourney>>;

/** Links go to the existing command workbenches; opening one does not mark it done. */
export function recoveryJourneySteps(jobId: string) {
  const job = z.string().uuid().parse(jobId), base = `/jobs/${job}`;
  return [
    { title: "Confirm the £18,800 baseline, send, accept and start", href: `${base}#quote` },
    { title: "Record verified proof", href: `${base}#work-proof` },
    { title: "Check materials before locking the final account", href: `${base}#things-to-check` },
    { title: "Lock the final account and issue the £22,560 customer invoice", href: `${base}#final-account-title` },
    { title: "Open two withheld-payment cases: £320 and £2,500", href: `${base}#recovery-cases` },
    { title: "Review eligibility, inspect the evidence pack and approve exact pursuit", href: `${base}#recovery-cases` },
    { title: "Match settled fake receipts of £384 and £3,000", href: `${base}#practice-receipts` },
    { title: "Review and approve exact landing allocations", href: `${base}#recovery-allocations` },
    { title: "Post the v3 success fee (M4-9-S)", href: null },
    { title: "Approve an issued v3 fee statement (M4-10-S)", href: null },
    { title: "Simulate collection (M4-12-S)", href: null },
    { title: "Reverse the £3,000 receipt and its allocation", href: `${base}#recovery-allocations` },
    { title: "Compensate the fee and refund £250 (M4-9-S / M4-12-S)", href: null },
    { title: "Reconcile both books (M4-17-S)", href: null },
    { title: "Inspect fee qualification sources (SV-6)", href: null },
  ];
}
