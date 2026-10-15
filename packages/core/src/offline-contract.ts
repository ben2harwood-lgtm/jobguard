import { z } from "zod";
import { logSiteExtraV1 } from "./site-extra.js";

const counter = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const uuidV7 = z.string().uuid().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu);
/** Every value here is client supplied. None is trusted server time, identity or authorization. */
export const offlineClientMetadataV1 = z.object({
 capturedAt: z.string().datetime(),
 hlc: z.object({ wallTimeMs: counter, logical: counter, nodeId: z.string().min(1).max(100).refine(value => /\S/u.test(value)) }).strict(),
}).strict();

/** A synthetic transport profile, not a new upload endpoint or a durable device queue. */
export const offlineIntentV1 = z.object({
 version: z.literal("offline-intent.v1"),
 jobId: z.string().uuid(),
 clientMetadata: offlineClientMetadataV1,
 body: logSiteExtraV1.extend({ commandId: uuidV7 }).strict(),
}).strict();
export type OfflineIntentV1 = z.infer<typeof offlineIntentV1>;

export class OfflineContractError extends Error {
 constructor(readonly code: "OFFLINE_INVALID_INTENT" | "OFFLINE_UNSUPPORTED_VERSION" | "OFFLINE_UNSUPPORTED_OPERATION") {
  super(code); this.name = "OfflineContractError";
 }
}
const versionProbe = z.object({ version: z.string().optional() }).passthrough();
const operationProbe = z.object({ body: versionProbe }).passthrough();
/** Unknown versions are refused explicitly; parsing never executes a command or grants permission. */
export function parseOfflineIntentV1(raw: unknown): OfflineIntentV1 {
 const version = versionProbe.safeParse(raw);
 if (version.success && version.data.version !== undefined && version.data.version !== "offline-intent.v1") throw new OfflineContractError("OFFLINE_UNSUPPORTED_VERSION");
 const operation = operationProbe.safeParse(raw);
 if (operation.success && operation.data.body.version !== undefined && operation.data.body.version !== "log-site-extra.v1") throw new OfflineContractError("OFFLINE_UNSUPPORTED_OPERATION");
 const parsed = offlineIntentV1.safeParse(raw);
 if (!parsed.success) throw new OfflineContractError("OFFLINE_INVALID_INTENT");
 return parsed.data;
}

/** Revalidate and forward only the existing selector/body. No metadata is forwarded or persisted. */
export function toLogSiteExtraV1(raw: unknown): { jobId: string; body: z.infer<typeof logSiteExtraV1> } {
 const intent = parseOfflineIntentV1(raw);
 return { jobId: intent.jobId, body: logSiteExtraV1.parse(intent.body) };
}

/** Classification only: there is no field merger, commercial executor, approval or receipt here. */
export const offlinePolicyV1 = Object.freeze({
 classes: Object.freeze(["allowlisted_non_commercial_field_merge", "append_only_facts", "validated_state_financial_commands"] as const),
 fieldMergeAllowlist: Object.freeze([] as const),
 operations: Object.freeze([Object.freeze({ version: "log-site-extra.v1", class: "append_only_facts" } as const)]),
 validatedCommandsRequire: Object.freeze(["current_server_authority", "applicable_revision_state_and_exact_approval"] as const),
 resultVersions: Object.freeze(["site-extra-logged.v1", "site-assigned-jobs.v1", "audit.v1"] as const),
});
