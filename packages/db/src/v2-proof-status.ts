/**
 * V2-F2: whether a crew-brief task counts as complete. Derived only; nothing is refused or stored.
 * Later pieces (K5B stage due, G6 close-out, E4 afternoon check) must call these, not re-derive them.
 */
export const taskProofStatuses = ["open", "blocked", "changed", "done", "done_proof_missing",
  "done_proof_pending", "done_proof_rejected"] as const;
export type TaskProofStatus = typeof taskProofStatuses[number];

export type LatestProgress = {
  kind: "done" | "blocked" | "changed";
  photoReference: string | null;
  photoState: "not_uploaded" | "pending" | "quarantined" | "verified" | "rejected";
};

/**
 * `latest` is the task's highest-version progress row. `proofNeeded` must come from the brief
 * version that row was recorded against, not the newest brief.
 */
export function taskProofStatus(latest: LatestProgress | null | undefined, proofNeeded: readonly string[]): TaskProofStatus {
  if (!latest) return "open";
  if (latest.kind !== "done") return latest.kind;
  if (!proofNeeded.length) return "done";
  if (!latest.photoReference) return "done_proof_missing";
  switch (latest.photoState) {
    case "verified": return "done";
    case "pending": case "quarantined": return "done_proof_pending";
    case "rejected": return "done_proof_rejected";
    default: return "done_proof_missing";
  }
}

export function isTaskComplete(status: TaskProofStatus): boolean {
  return status === "done";
}
