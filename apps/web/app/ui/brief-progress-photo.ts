import type { BriefProgress } from "@jobguard/api/workspace";

export function progressPhotoLabel(row: Pick<BriefProgress, "photoReference" | "photoState">): string {
  if (!row.photoReference) return "No photo attached";
  return { not_uploaded: "Photo not uploaded", pending: "Photo upload pending", quarantined: "Photo being checked",
    verified: "Photo verified · file integrity checked", rejected: "Photo rejected" }[row.photoState];
}
