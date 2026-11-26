import type { BriefProgress } from "@jobguard/api/workspace";

export function progressPhotoLabel(row: Pick<BriefProgress, "photoReference" | "photoState">): string {
  if (!row.photoReference) return "No photo attached";
  return { not_uploaded: "Photo not uploaded", pending: "Photo upload pending", quarantined: "Photo being checked",
    verified: "Photo verified · file integrity checked", rejected: "Photo rejected" }[row.photoState];
}

export type TaskStatus = "open" | "blocked" | "changed" | "done" | "done_proof_missing" | "done_proof_pending" | "done_proof_rejected";

/** V2-F2: the plain reason a task is or is not complete. Null when there is nothing to say yet. */
export function taskStatusLabel(status: TaskStatus | undefined): string | null {
  switch (status) {
    case "done": return "Done";
    case "done_proof_missing": return "Done, but the proof photo is missing";
    case "done_proof_pending": return "Done, proof photo still uploading or being checked";
    case "done_proof_rejected": return "Done, but the proof photo was rejected: add another";
    case "blocked": return "Blocked";
    case "changed": return "Changed";
    default: return null;
  }
}

/** V2-F2: the task stays open until its proof photo is verified, so offer Done with a new photo again. */
export function needsNewProofPhoto(status: TaskStatus | undefined): boolean {
  return status === "done_proof_missing" || status === "done_proof_pending" || status === "done_proof_rejected";
}
