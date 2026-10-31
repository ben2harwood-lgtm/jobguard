import { createHash } from "node:crypto";
import { z } from "zod";
import { jobSourceEvidenceV1, parseObservation, type Observation } from "@jobguard/core";
import type { VerifiedTenantContext } from "@jobguard/db";

const id = z.guid({ error: "Invalid uuid" });
const requestV1 = z.object({
  version: z.literal("email-forwarding-read.v1"), jobId: id, deliveryId: id,
}).strict();
const configurationV1 = z.object({
  version: z.literal("email-forwarding-config.v1"), environment: z.literal("synthetic_demo"),
  transport: z.literal("fixture"), enabled: z.literal(true),
}).strict();
// Only a reviewed fictional original is supported. No MIME parser or sender-derived authority.
const originalV1 = z.object({
  version: z.literal("email-forwarding-original.v1"), tenantId: id, jobId: id, deliveryId: id,
  source: z.literal("email_forwarding"), state: z.literal("verified"), invalidated: z.literal(false),
  evidence: jobSourceEvidenceV1, text: z.literal("Please fit an outside tap."),
}).strict();

export class EmailForwardingError extends Error {
  constructor(readonly code: "EMAIL_FORWARDING_DISABLED" | "INVALID_EMAIL_FORWARDING_INPUT" | "EMAIL_FORWARDING_UNAVAILABLE") { super(code); }
}
export interface EmailForwardingPorts {
  /** Recheck the persisted job against this whole verified context; never use From/To/Subject as authority. */
  authorizeJob(context: VerifiedTenantContext, jobId: string): Promise<boolean>;
  /** Server-owned immutable receipt, uniquely keyed by tenant/job/delivery; invalidated originals return null.
   * Retries return the same evidence identity/version/time. No caller-supplied evidence metadata. */
  readOriginal(context: VerifiedTenantContext, jobId: string, deliveryId: string): Promise<unknown>;
}

/** DARK worker source. Not registered in HTTP, Graphile or production composition.
 * Default off, fixture-only even when opted in; no provider, persistence or shadow capability.
 * Replays emit the same observation for the existing worker/sink's evidence deduplication.
 */
export class EmailForwardingConnector {
  private readonly enabled: boolean;
  constructor(private readonly ports: EmailForwardingPorts, configuration: unknown = undefined) {
    this.enabled = configurationV1.safeParse(configuration).success;
  }
  async read(context: VerifiedTenantContext, raw: unknown): Promise<readonly Observation[]> {
    if (!this.enabled) throw new EmailForwardingError("EMAIL_FORWARDING_DISABLED");
    const request = requestV1.safeParse(raw);
    if (!request.success) throw new EmailForwardingError("INVALID_EMAIL_FORWARDING_INPUT");
    try {
      if (!await this.ports.authorizeJob(context, request.data.jobId)) throw new Error();
      const original = originalV1.safeParse(await this.ports.readOriginal(context, request.data.jobId, request.data.deliveryId));
      if (!original.success) throw new Error();
      const source = original.data;
      if (source.tenantId !== context.tenantId || source.jobId !== request.data.jobId || source.deliveryId !== request.data.deliveryId ||
        createHash("sha256").update(source.text, "utf8").digest("hex") !== source.evidence.sha256) throw new Error();
      return [parseObservation({
        version: "observation.v1", tenantId: source.tenantId, jobId: source.jobId, kind: "customer_request",
        evidence: source.evidence, text: source.text,
        citations: [{ start: 0, end: source.text.length, quote: source.text }],
        facts: { workReference: "synthetic:outside-tap", scopeArea: "job", description: "outside tap", status: "requested",
          estimatedValuePence: null, safetyImplication: false, customerClearlyRequested: true, needsPriorWrittenAgreement: false,
          significantWork: null, activeDispute: false, silenceMateriallyWorsensDispute: false, disclosureDuty: false },
      })];
    } catch {
      // No original, addresses, provider error, signal existence or receipt internals in failures.
      throw new EmailForwardingError("EMAIL_FORWARDING_UNAVAILABLE");
    }
  }
}
