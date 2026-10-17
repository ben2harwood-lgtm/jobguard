import { z } from "zod";
import {
  FreeFirstJobError, freeFirstJobEndPreviewInputV1, freeFirstJobPreviewInputV1,
  parseFreeFirstJob, previewFreeFirstJob, previewFreeFirstJobEnd,
} from "@jobguard/core";

export const freeFirstJobQueryV1 = z.object({ version: z.literal("free-first-job-query.v1") }).strict().readonly();
export const freeFirstJobReadSnapshotV1 = z.object({
  version: z.literal("free-first-job-read-snapshot.v1"), environment: z.literal("synthetic_demo"),
  tenantId: z.string().uuid(), jobId: z.string().uuid(), eligibility: freeFirstJobPreviewInputV1,
  timeline: freeFirstJobEndPreviewInputV1.nullable(),
}).strict().refine(value => value.eligibility.tenantId === value.tenantId && value.eligibility.jobId === value.jobId &&
  (value.timeline === null || (value.timeline.tenantId === value.tenantId && value.timeline.jobId === value.jobId)),
"All server facts must bind the same tenant and requested job").readonly();

/** No implementation is supplied until the parent provides persisted identity/authority/ledger seams.
 * Must authenticate current session and job permission before reading facts, including on repeat reads.
 * null means the same refusal for every unauthorised/unknown job. Never accept caller-supplied facts.
 */
export interface FreeFirstJobReadPort {
  environment(): string | undefined;
  authorizeAndRead(sessionHandle: unknown, jobId: string): Promise<unknown | null>;
}

/** Uncomposed read-only seam, no route, command, activation, provider or persistence implementation. */
export class FreeFirstJobApplication {
  constructor(private readonly source: FreeFirstJobReadPort) {}
  async read(sessionHandle: unknown, jobId: string, rawQuery: unknown) {
    this.assertSynthetic();
    const rawSnapshot = await this.source.authorizeAndRead(sessionHandle, jobId);
    this.assertSynthetic();
    if (rawSnapshot === null) throw new FreeFirstJobError("FREE_FIRST_JOB_ACCESS_DENIED");
    parseFreeFirstJob(freeFirstJobQueryV1, rawQuery);
    const snapshot = parseFreeFirstJob(freeFirstJobReadSnapshotV1, rawSnapshot);
    if (snapshot.jobId !== jobId) throw new FreeFirstJobError("INVALID_FREE_FIRST_JOB_INPUT");
    return Object.freeze({
      version: "free-first-job-read-result.v1" as const, environment: "synthetic_demo" as const,
      hypothetical: true as const, realExternalActions: 0 as const,
      eligibility: previewFreeFirstJob(snapshot.eligibility),
      timeline: snapshot.timeline === null ? null : previewFreeFirstJobEnd(snapshot.timeline),
    });
  }
  private assertSynthetic() {
    if (this.source.environment() !== "synthetic_demo") throw new FreeFirstJobError("FREE_FIRST_JOB_SYNTHETIC_ONLY");
  }
}
