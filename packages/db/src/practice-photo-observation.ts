import type { Observation } from "@jobguard/core";

/** Server-generated PNG hashes only. These are fictional captions, never image
 * recognition. The caller must first establish finalized, job-bound evidence. */
export function decodePracticePhoto(sha256: string, paintedWallsSha256: string, drainageSha256?: string): Pick<Observation, "text" | "facts" | "citations"> | null {
 const drainage = drainageSha256 !== undefined && sha256 === drainageSha256;
 if (!drainage && sha256 !== paintedWallsSha256) return null;
 const text = drainage ? "Fictional practice photo: fitted garden drainage. Estimated extra: £500 net." : "Practice photo: painted walls";
 return { text, citations: [{ start: 0, end: text.length, quote: text }], facts: {
  workReference: drainage ? "practice:garden-drainage" : "practice:painted-walls", scopeArea: "job",
  description: drainage ? "fitted garden drainage" : "painted walls", status: "completed", estimatedValuePence: drainage ? 50000 : null,
  safetyImplication: false, customerClearlyRequested: false, needsPriorWrittenAgreement: false, significantWork: null,
  activeDispute: false, silenceMateriallyWorsensDispute: false, disclosureDuty: false,
 } };
}
