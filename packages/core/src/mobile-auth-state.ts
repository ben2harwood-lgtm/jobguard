import { z } from "zod";
import { mobilePartitionV1 } from "./mobile-auth.js";

const time = z.number().int().nonnegative().safe();
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
const reason = z.enum(["logout", "revoke", "tenant_switch", "reuse"]);
const device = z.object({ userId: z.guid(), tenantId: z.guid(), deviceDigest: digest, revokedAtMs: time.optional(), reason: reason.optional() }).strict();
const family = z.object({
 partition: mobilePartitionV1, sourceSessionId: z.guid(), deviceKey: z.string(), expiresAtMs: time,
 accessDigest: digest, accessExpiresAtMs: time, refreshDigest: digest, refreshExpiresAtMs: time,
 usedRefresh: z.array(digest), leaseId: z.guid(), leaseIssuedAtMs: time, leaseExpiresAtMs: time,
 revokedAtMs: time.optional(), reason: reason.optional(),
}).strict();
/** Internal synthetic identity state, never a sync projection or a public response. */
export const mobileAuthStateV1 = z.object({
 version: z.literal("mobile-auth-state.v1"), environment: z.literal("synthetic_demo"),
 devices: z.array(z.tuple([z.string(), device])),
 families: z.array(z.tuple([z.guid(), family])),
 commands: z.array(z.tuple([z.string(), digest])),
}).strict();
export type MobileAuthStateV1 = z.infer<typeof mobileAuthStateV1>;
export interface SyntheticMobileAuthStore {
 /** Serialize across instances; commit returned state before returning the result. Throwing rolls back. */
 transaction<T>(work: (state: MobileAuthStateV1) => Promise<{ state: MobileAuthStateV1; result: T }>): Promise<T>;
}
export const emptyMobileAuthStateV1 = (): MobileAuthStateV1 => ({ version: "mobile-auth-state.v1", environment: "synthetic_demo", devices: [], families: [], commands: [] });
