import { z } from "zod";
import { closeoutQuestionText, closeoutQuestionVersion, completeSiteVisitV1, siteAssignedJobsV1, startSiteVisitV1 } from "./site-visit.js";
import { logSiteExtraV4, residentConfirmationStatementV1, siteExtraContentSha256V1 } from "./site-extra-evidence.js";
import { offlineCaptureItemV1 } from "./offline-capture.js";
import { parseOfflineIntentV1 } from "./offline-contract.js";

const uuid = z.guid();
export class OperativeViewError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "NOT_ASSIGNED" | "CONFIRMATION_MISMATCH") {
    super(code); this.name = "OperativeViewError";
  }
}
function parse<T>(schema: z.ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw new OperativeViewError("INVALID_INPUT");
  return result.data;
}
const assignedInput = z.object({ assigned: siteAssignedJobsV1, jobId: uuid }).strict();
function assignedJob(assigned: unknown, jobId: unknown) {
  const input = parse(assignedInput, { assigned, jobId });
  const job = input.assigned.jobs.find(row => row.jobId === input.jobId);
  if (!job) throw new OperativeViewError("NOT_ASSIGNED");
  return job;
}

/** Screen data only, from the current user's authenticated assigned-job response (or its
 * leased, user/tenant-partitioned cache). This function authenticates nobody. Download
 * admission remains evaluateSyncDownloadV1/server membership; never pass replication rows here.
 * Resident contacts, addresses, prices and authority fields are absent from this contract. */
export function operativeAssignedJobsViewV1(raw: unknown) {
  const assigned = parse(siteAssignedJobsV1, raw);
  return { ...assigned, version: "operative-assigned-jobs-view.v1" as const,
    jobs: assigned.jobs.map(job => ({ ...job, visitState: job.openVisitId ? "open" as const : "not_started" as const })),
    requiresCurrentServerAuthorityOnUpload: true as const };
}

const visitInput = z.object({ assigned: siteAssignedJobsV1, jobId: uuid, commandId: uuid,
  closeoutAnswer: z.enum(["yes", "no"]).nullable(), online: z.boolean() }).strict();
/** No visit id is accepted from the screen: only the caller's current own open visit.
 * Visits are not supported by the current offline dispatcher. A held intent is never completion. */
export function planOperativeVisitV1(raw: unknown) {
  const input = parse(visitInput, raw), job = assignedJob(input.assigned, input.jobId);
  const question = { version: closeoutQuestionVersion, text: closeoutQuestionText };
  const base = { version: "operative-visit-plan.v1" as const, environment: "synthetic_demo" as const,
    jobId: job.jobId, question, onlineOnly: true as const, recorded: false as const };
  if (job.openVisitId && input.closeoutAnswer === null)
    return { ...base, state: "held" as const, reason: "closeout_answer_required" as const };
  const body = job.openVisitId
    ? completeSiteVisitV1.parse({ version: "complete-site-visit.v1", commandId: input.commandId, closeoutAnswer: input.closeoutAnswer })
    : startSiteVisitV1.parse({ version: "start-site-visit.v1", commandId: input.commandId });
  const intent = { method: "POST" as const,
    path: `/contractor/jobs/${job.jobId}/site-visits/${job.openVisitId ? `${job.openVisitId}/complete` : "start"}`, body };
  return input.online ? { ...base, state: "ready_for_server_validation" as const, intent }
    : { ...base, state: "held" as const, reason: "online_required" as const, intent };
}

const extraInput = z.object({ assigned: siteAssignedJobsV1, jobId: uuid, online: z.boolean(),
  draft: logSiteExtraV4.omit({ photoEvidenceId: true, residentConfirmation: true }),
  photo: offlineCaptureItemV1, shownContentSha256: z.string().regex(/^[0-9a-f]{64}$/u).nullable(),
}).strict();
/** Same v4 command and content hash as web. A resident confirmation is a statement on the
 * operative's device, not verified resident identity or contractor approval. No contacts are stored.
 * Preserve the exact returned intent/command id on uncertain outcomes; edits need a new command.
 * The server still verifies evidence, current assignment and content before writing origin. */
export function planOperativeExtraV1(raw: unknown) {
  const input = parse(extraInput, raw), job = assignedJob(input.assigned, input.jobId);
  const { photo, draft } = input;
  if (photo.jobId !== job.jobId || photo.kind !== "photo") throw new OperativeViewError("INVALID_INPUT");
  const base = { version: "operative-extra-plan.v1" as const, environment: "synthetic_demo" as const,
    jobId: job.jobId, onlineOnly: true as const, recorded: false as const,
    residentStatement: residentConfirmationStatementV1, originAuthority: "server_on_upload" as const };
  // A client hash is not a finalized photo. Keep local media and intent for M3-5; never
  // downgrade a photo/confirmation draft into the text-only offline command.
  if (photo.status !== "verified") return { ...base, state: "held" as const, reason: "photo_not_verified" as const,
    captureStatus: photo.status };
  const contentSha256 = siteExtraContentSha256V1({ jobId: job.jobId, description: draft.description,
    note: draft.note, photoSha256: photo.serverVerification!.sha256 });
  if (input.shownContentSha256 === null) return { ...base, state: "held" as const,
    reason: "resident_confirmation_required" as const, contentSha256 };
  if (input.shownContentSha256 !== contentSha256) throw new OperativeViewError("CONFIRMATION_MISMATCH");
  const body = logSiteExtraV4.parse({ ...draft, photoEvidenceId: photo.serverVerification!.evidenceId,
    residentConfirmation: { shownContentSha256: contentSha256 } });
  const intent = { method: "POST" as const, path: `/contractor/jobs/${job.jobId}/site-extras`, body };
  return input.online ? { ...base, state: "ready_for_server_validation" as const, contentSha256, intent }
    : { ...base, state: "held" as const, reason: "online_required" as const, contentSha256, intent };
}

/** Text-only capture uses the existing offline contract unchanged. Client capture time/HLC
 * stay labelled metadata; neither chooses the raising user, server ordering nor agreement.
 * This returns queue intent, never a logged-extra receipt. Reinstall retains the original ID. */
export function operativeOfflineExtraV1(rawAssigned: unknown, rawIntent: unknown) {
  const intent = parseOfflineIntentV1(rawIntent);
  assignedJob(rawAssigned, intent.jobId);
  return { version: "operative-offline-extra-view.v1" as const, environment: "synthetic_demo" as const,
    state: "queued_intent" as const, recorded: false as const, intent,
    originAuthority: "server_on_upload" as const, requiresCurrentServerAuthorityOnUpload: true as const };
}
