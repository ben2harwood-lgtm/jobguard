import { z } from "zod";
import { offlineClientMetadataV1 } from "./offline-contract.js";

const milliseconds = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const duration = milliseconds.positive();
const specimenPolicyVersion = z.literal("fictional_mobile_auth_policy_v1");

/** A selector only. Source credentials, membership and transport are outside this pure boundary. */
export const mobileExchangeV1 = z.object({
 version: z.literal("mobile-exchange.v1"), requestedTenantId: z.string().uuid(),
}).strict();

const credentialSpecimen = z.string().regex(/^[A-Za-z0-9_-]{43}$/u);
/** Internal synthetic shapes only; no public transport or credential issuer is registered. */
export const mobileAccessV1 = z.object({ version: z.literal("mobile-access.v1"), credential: credentialSpecimen }).strict();
export const mobileRefreshV1 = z.object({ version: z.literal("mobile-refresh.v1"), credential: credentialSpecimen }).strict();

export const mobilePartitionV1 = z.object({
 userId: z.string().uuid(), tenantId: z.string().uuid(), membershipId: z.string().uuid(), mobileSessionId: z.string().uuid(),
 // Reuse the merged opaque correlation shape; this does not freeze the native identifier protocol.
 deviceInstanceId: offlineClientMetadataV1.shape.hlc.shape.nodeId,
}).strict();
export type MobilePartitionV1 = z.infer<typeof mobilePartitionV1>;

/** Explicit fictional inputs, with no approved-policy branch or fallback values. */
export const mobileAuthPolicySpecimenV1 = z.object({
 version: z.literal("mobile-auth-policy-specimen.v1"), environment: z.literal("synthetic_demo"), policyVersion: specimenPolicyVersion,
 accessDurationMs: duration, refreshDurationMs: duration, sessionDurationMs: duration, readLeaseDurationMs: duration,
}).strict().superRefine((policy, ctx) => {
 for (const field of ["accessDurationMs", "refreshDurationMs", "readLeaseDurationMs"] as const) {
  if (policy[field] > policy.sessionDurationMs) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: "duration exceeds specimen session bound" });
 }
});

/** Validating metadata neither issues a lease nor authenticates its assertions. */
export const mobileReadLeaseV1 = z.object({
 version: z.literal("mobile-read-lease.v1"), environment: z.literal("synthetic_demo"), leaseId: z.string().uuid(),
 partition: mobilePartitionV1, policyVersion: specimenPolicyVersion, issuedAtMs: milliseconds, expiresAtMs: milliseconds,
}).strict().refine(lease => lease.expiresAtMs > lease.issuedAtMs, { message: "expiry must follow issue time", path: ["expiresAtMs"] });

export const mobileLocalMetadataV1 = z.object({
 version: z.literal("mobile-local-metadata.v1"), partition: mobilePartitionV1, localSchemaVersion: duration,
}).strict();

export const mobileReadEvaluationV1 = z.object({
 version: z.literal("mobile-read-evaluation.v1"), policy: mobileAuthPolicySpecimenV1, partition: mobilePartitionV1,
 localMetadata: mobileLocalMetadataV1.nullable(), lease: mobileReadLeaseV1.nullable(),
 authority: z.enum(["valid", "expired", "revoked"]), reconnectRequired: z.boolean(),
 clock: z.object({ status: z.enum(["trusted_fixture", "unverified", "anomaly"]), nowMs: milliseconds }).strict(),
}).strict();

export const mobileCleanupV1 = z.object({
 version: z.literal("mobile-cleanup.v1"), reason: z.enum(["logout", "tenant_switch"]), partition: mobilePartitionV1,
 unsyncedWork: z.enum(["none", "present", "unknown"]),
}).strict();

/** No raw input, Zod issues or provider details may escape this parser boundary. */
export class MobileAuthContractError extends Error {
 constructor(readonly code: "MOBILE_AUTH_INVALID_INPUT" | "MOBILE_AUTH_POLICY_REQUIRED") {
  super(code); this.name = "MobileAuthContractError";
 }
}

export function parseMobileExchangeV1(raw: unknown): z.infer<typeof mobileExchangeV1> {
 const result = mobileExchangeV1.safeParse(raw);
 if (!result.success) throw new MobileAuthContractError("MOBILE_AUTH_INVALID_INPUT");
 return result.data;
}
export function parseMobileAccessV1(raw: unknown): z.infer<typeof mobileAccessV1> {
 const result = mobileAccessV1.safeParse(raw);
 if (!result.success) throw new MobileAuthContractError("MOBILE_AUTH_INVALID_INPUT");
 return result.data;
}
export function parseMobileAuthPolicySpecimenV1(raw: unknown): z.infer<typeof mobileAuthPolicySpecimenV1> {
 const result = mobileAuthPolicySpecimenV1.safeParse(raw);
 if (!result.success) throw new MobileAuthContractError("MOBILE_AUTH_POLICY_REQUIRED");
 return result.data;
}
