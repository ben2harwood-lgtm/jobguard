/**
 * Wording for the fee basis under a recovery case. The reference fee is a JOB-level figure: one cap and one plan-fee credit are
 * shared by every case on the job, so a job's current liability is never attributed to a single case, and a reversal posts a
 * job-level compensation. This helper picks the honest sentence from the landing status and the posted amounts.
 */
export type FeeBasisInput = Readonly<{ feeJobLiabilityPence: number; approvedLandedNetPence: number; feeObligationsPostedPence: number; feeCompensationsPostedPence: number }>;

export function feeBasisNote(input: FeeBasisInput): string {
  const illustration = "(illustration only; nothing is charged)";
  if (input.approvedLandedNetPence > 0) {
    return input.feeJobLiabilityPence > 0
      ? `The fee liability shown is for the whole job: its cap and plan credit are shared by all of its cases ${illustration}`
      : `An approved qualifying landing exists; no fee liability remains for this job after the cap and plan credit ${illustration}`;
  }
  if (input.feeCompensationsPostedPence > 0) return `This case's approved landing was reversed. The compensation posted adjusts the job's shared fee; it is not a fee on this case ${illustration}`;
  if (input.feeJobLiabilityPence > 0) return `This case has no approved qualifying landing; the job's fee liability comes from its other cases ${illustration}`;
  return "No approved qualifying landing yet, so no fee exists";
}
