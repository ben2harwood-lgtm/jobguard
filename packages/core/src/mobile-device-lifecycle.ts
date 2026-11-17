import { MobileAuthContractError, mobileCleanupV1, mobileReadEvaluationV1, type MobilePartitionV1 } from "./mobile-auth.js";

export type MobileReadOutcomeV1 = "valid" | "expired" | "revoked" | "wrong_partition" | "reconnect_required" | "cleanup_required" | "recovery_required";
export interface MobileReadDecisionV1 {
 readonly version: "mobile-read-decision.v1";
 readonly environment: "synthetic_demo";
 readonly outcome: MobileReadOutcomeV1;
 readonly canRead: boolean;
}
function decision(outcome: MobileReadOutcomeV1): MobileReadDecisionV1 {
 return { version: "mobile-read-decision.v1", environment: "synthetic_demo", outcome, canRead: outcome === "valid" };
}
function samePartition(a: MobilePartitionV1, b: MobilePartitionV1): boolean {
 return a.userId === b.userId && a.tenantId === b.tenantId && a.membershipId === b.membershipId
  && a.mobileSessionId === b.mobileSessionId && a.deviceInstanceId === b.deviceInstanceId;
}

/** A pure specimen decision, never a substitute for encrypted native access or server revalidation. */
export function evaluateMobileReadV1(raw: unknown): MobileReadDecisionV1 {
 const parsed = mobileReadEvaluationV1.safeParse(raw);
 if (!parsed.success) return decision("recovery_required");
 const { policy, partition, localMetadata, lease, authority, reconnectRequired, clock } = parsed.data;
 if (!localMetadata) return decision("cleanup_required");
 if (!samePartition(partition, localMetadata.partition) || (lease && !samePartition(partition, lease.partition))) return decision("wrong_partition");
 if (authority === "revoked") return decision("revoked");
 if (authority === "expired") return decision("expired");
 if (localMetadata.localSchemaVersion !== 1) return decision("recovery_required");
 if (reconnectRequired || !lease || clock.status !== "trusted_fixture") return decision("reconnect_required");
 // Subtraction remains exact: both operands are ordered nonnegative safe integers.
 if (lease.expiresAtMs - lease.issuedAtMs > policy.readLeaseDurationMs || clock.nowMs < lease.issuedAtMs) return decision("reconnect_required");
 if (clock.nowMs >= lease.expiresAtMs) return decision("expired");
 return decision("valid");
}

export interface MobileCleanupPlanV1 {
 readonly version: "mobile-cleanup-plan.v1";
 readonly environment: "synthetic_demo";
 readonly reason: "logout" | "tenant_switch";
 readonly partition: MobilePartitionV1;
 readonly outcome: "cleanup_required" | "policy_hold";
 readonly unsyncedWork: "none" | "present" | "unknown";
 readonly serverRevocation: "policy_required";
 readonly requiredResources: readonly ["secure_keys", "database_cache", "media_cache", "sensitive_pending_content"];
}

/** Obligations only: no file/key/queue operation or instruction to discard unsynced content. */
export function planMobileCleanupV1(raw: unknown): MobileCleanupPlanV1 {
 const parsed = mobileCleanupV1.safeParse(raw);
 if (!parsed.success) throw new MobileAuthContractError("MOBILE_AUTH_INVALID_INPUT");
 const { reason, partition, unsyncedWork } = parsed.data;
 return {
  version: "mobile-cleanup-plan.v1", environment: "synthetic_demo", reason, partition, unsyncedWork,
  outcome: unsyncedWork === "none" ? "cleanup_required" : "policy_hold", serverRevocation: "policy_required",
  requiredResources: ["secure_keys", "database_cache", "media_cache", "sensitive_pending_content"],
 };
}
