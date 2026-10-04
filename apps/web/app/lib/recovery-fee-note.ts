/**
 * Wording for the fee basis under a recovery case. A zero fee does NOT mean no qualifying landing exists:
 * the v1 cap and plan-fee credit can offset a qualifying landing completely, so the landing status decides.
 */
export function feeBasisNote(input: Readonly<{ feeIllustrativePence: number; approvedLandedNetPence: number }>): string {
  if (input.feeIllustrativePence > 0) return "Reference fee on approved qualifying landings (illustration only; nothing is charged)";
  if (input.approvedLandedNetPence > 0) return "An approved qualifying landing exists; no additional fee after the cap and plan credit (illustration only; nothing is charged)";
  return "No approved qualifying landing yet, so no fee exists";
}
