import { z } from "zod";
import type { Observation } from "./observation.js";
import {
  customerMessageInputV1, customerMessageV1, diaryEntryV1, diaryInputV1,
  JOB_DIARY_NOTICE, JOB_DIARY_NOTICE_VERSION,
} from "./job-sources.js";

const receipt = {
  version: z.literal("job-source-intake-receipt.v1"),
  jobId: z.string().uuid(),
  environment: z.literal("synthetic_demo"),
  realExternalActions: z.literal(0),
};

/** Shape validation only. Persisted authority and original-byte verification belong to the server. */
export const jobSourceIntakeReceiptV1 = z.discriminatedUnion("sourceKind", [
  z.object({
    ...receipt,
    sourceKind: z.literal("diary"),
    record: diaryEntryV1,
    notice: z.literal(JOB_DIARY_NOTICE),
    noticeVersion: z.literal(JOB_DIARY_NOTICE_VERSION),
  }).strict(),
  z.object({
    ...receipt,
    sourceKind: z.literal("customer_message"),
    record: customerMessageV1,
  }).strict(),
]).readonly();

export type JobSourceIntakeReceipt = z.infer<typeof jobSourceIntakeReceiptV1>;
export type JobSourceIntakeErrorCode =
  | "INVALID_JOB_SOURCE_INPUT"
  | "JOB_SOURCE_FORBIDDEN"
  | "SYNTHETIC_MODE_REQUIRED"
  | "IDEMPOTENCY_CONFLICT"
  | "SOURCE_NOT_FINALIZED"
  | "JOB_SOURCE_UNAVAILABLE";

/** Stable public failure; never carries raw input, SQL or lifecycle/admission errors. */
export class JobSourceIntakeError extends Error {
  constructor(readonly code: JobSourceIntakeErrorCode) {
    super(code);
    this.name = "JobSourceIntakeError";
  }
}

type SourceClassification<E extends string, O extends Observation["kind"], S extends boolean> = {
  readonly evidenceKind: E;
  readonly observationKind: O;
  readonly onSiteDiary: S;
};

export type JobSourceIntakeClassification =
  | SourceClassification<"job_diary_text", "note_or_voice", boolean>
  | SourceClassification<"customer_message_text", "customer_request", false>;

/** Source semantics only: onSiteDiary requests a later checked adapter, never authorizes activity. */
export function classifyJobSourceIntake(kind: unknown, input: unknown): JobSourceIntakeClassification {
  try {
    if (kind === "diary") {
      const parsed = diaryInputV1.safeParse(input);
      if (!parsed.success) throw new JobSourceIntakeError("INVALID_JOB_SOURCE_INPUT");
      return { evidenceKind: "job_diary_text", observationKind: "note_or_voice", onSiteDiary: parsed.data.onSite };
    }
    if (kind === "customer_message") {
      const parsed = customerMessageInputV1.safeParse(input);
      if (!parsed.success) throw new JobSourceIntakeError("INVALID_JOB_SOURCE_INPUT");
      return { evidenceKind: "customer_message_text", observationKind: "customer_request", onSiteDiary: false };
    }
    throw new JobSourceIntakeError("INVALID_JOB_SOURCE_INPUT");
  } catch {
    // Zod can itself throw when inspecting non-JSON objects. Never expose their errors.
    throw new JobSourceIntakeError("INVALID_JOB_SOURCE_INPUT");
  }
}
