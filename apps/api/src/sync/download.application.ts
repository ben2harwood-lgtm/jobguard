import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  deriveSyncTokenClaimsV1, evaluateSyncDownloadV1, pageSyncDownloadV1, planSyncReconcileV1,
  syncAuthorityFactsV1, syncSubscriptionRequestV1, syncTokenClaimsV1,
} from "@jobguard/core";

const uuid = z.guid();
const seconds = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const snapshotV1 = z.object({
  version: z.literal("sync-server-snapshot.v1"), environment: z.literal("synthetic_demo"),
  sessionId: uuid, userId: uuid, activeTenantId: uuid,
  generation: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  authority: syncAuthorityFactsV1.nullable(), source: z.array(z.unknown()).max(200000),
}).strict();

/** Trusted server boundary: authenticate the opaque session and atomically read CURRENT membership,
 * active tenant, assignments and replication rows. Never implement this with client-supplied facts.
 * Advance the durable generation on revoke/switch/reauthorize, including transitions back to an old scope.
 * This dark slice has only deterministic test adapters; it is not wired to a provider or HTTP route. */
export interface SyntheticSyncStore {
  readCurrentSession(sessionToken: string): Promise<unknown>;
}
const subscriptionV1 = z.object({ version: z.literal("sync-server-subscribe.v1"), request: syncSubscriptionRequestV1 }).strict();
const downloadV1 = z.object({
  version: z.literal("sync-server-download.v1"), request: syncSubscriptionRequestV1,
  token: z.string().min(1).max(8192), afterJobId: uuid.nullable(), pageSize: z.number().int().min(1).max(1000),
  delivered: z.array(uuid).max(100000),
}).strict();
const envelopeV1 = z.object({
  version: z.literal("synthetic-sync-envelope.v1"), claims: syncTokenClaimsV1,
  sessionId: uuid, scopeHash: z.string().regex(/^[a-f0-9]{64}$/u),
}).strict();
const audience = "jobguard-synthetic-sync-only";
// Deliberately public specimen key, never a provider credential. Live mode is always refused.
const syntheticKey = "jobguard-M3-3-public-synthetic-signing-key-NOT-A-SECRET";
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const sign = (body: string) => createHmac("sha256", syntheticKey).update(body).digest();

export class SyncServerError extends Error {
  constructor(readonly code: "SYNC_DISABLED" | "SYNC_INVALID_INPUT" | "SYNC_UNAVAILABLE" | "SYNC_AUTHORITY_REQUIRED") {
    super(code); this.name = "SyncServerError";
  }
}

/** Synthetic application only. Defaults off even in synthetic_demo. No env switch can enable live use. */
export class SyntheticSyncDownloadApplication {
  constructor(
    private readonly store: SyntheticSyncStore,
    private readonly config: { environment?: string; enabled?: boolean } = {},
    private readonly nowSeconds: () => number = () => Math.floor(Date.now() / 1000),
  ) {}

  private assertEnabled() {
    if (this.config.environment !== "synthetic_demo" || this.config.enabled !== true) throw new SyncServerError("SYNC_DISABLED");
  }

  private async current(sessionToken: string, request: z.infer<typeof syncSubscriptionRequestV1>) {
    if (!z.string().min(1).max(4096).safeParse(sessionToken).success) throw new SyncServerError("SYNC_AUTHORITY_REQUIRED");
    let raw: unknown;
    try { raw = await this.store.readCurrentSession(sessionToken); }
    catch { throw new SyncServerError("SYNC_UNAVAILABLE"); }
    const parsed = snapshotV1.safeParse(raw);
    if (!parsed.success) throw new SyncServerError("SYNC_AUTHORITY_REQUIRED");
    const snapshot = parsed.data;
    const authority = snapshot.authority;
    const bound = authority && authority.userId === snapshot.userId && authority.tenantId === snapshot.activeTenantId
      && request.requestedTenantId === snapshot.activeTenantId;
    const facts = {
      version: "sync-download-facts.v1", environment: "synthetic_demo", request,
      authority: bound ? authority : null, source: [] as unknown[],
    };
    // A refused principal must not observe source quality (or lose its cleanup instruction).
    if (evaluateSyncDownloadV1(facts).outcome === "allowed") facts.source = snapshot.source;
    // Include the role and full assignments: a role/assignment change invalidates an old subscription,
    // even if an adapter fails to advance its generation. Duplicates/order never expand authority.
    const scopeHash = digest({ request: { ...request, jobIds: request.jobIds ? [...new Set(request.jobIds)].sort() : null },
      authority: authority ? { ...authority, assignedJobIds: [...new Set(authority.assignedJobIds)].sort() } : null });
    return { snapshot, facts, scopeHash };
  }

  async subscribe(sessionToken: string, raw: unknown) {
    this.assertEnabled();
    const input = subscriptionV1.safeParse(raw);
    if (!input.success) throw new SyncServerError("SYNC_INVALID_INPUT");
    const { snapshot, facts, scopeHash } = await this.current(sessionToken, input.data.request);
    if (evaluateSyncDownloadV1(facts).outcome !== "allowed") throw new SyncServerError("SYNC_AUTHORITY_REQUIRED");
    const now = seconds.safeParse(this.nowSeconds());
    if (!now.success || now.data > Number.MAX_SAFE_INTEGER - 60) throw new SyncServerError("SYNC_UNAVAILABLE");
    const claims = deriveSyncTokenClaimsV1({ version: "sync-token-input.v1", environment: "synthetic_demo", facts,
      generation: snapshot.generation, issuedAtSeconds: now.data, expiresAtSeconds: now.data + 60, audience });
    const body = Buffer.from(JSON.stringify({ version: "synthetic-sync-envelope.v1", claims, sessionId: snapshot.sessionId, scopeHash })).toString("base64url");
    return { version: "sync-server-token.v1" as const, environment: "synthetic_demo" as const, token: `${body}.${sign(body).toString("base64url")}`, expiresAtSeconds: claims.exp };
  }

  private validToken(token: string, current: Awaited<ReturnType<SyntheticSyncDownloadApplication["current"]>>) {
    const parts = token.split(".");
    if (parts.length !== 2 || !parts.every(p => /^[A-Za-z0-9_-]+$/u.test(p))) return false;
    const [body, signature] = parts as [string, string];
    const supplied = Buffer.from(signature, "base64url");
    const expected = sign(body);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return false;
    try {
      const envelope = envelopeV1.safeParse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
      if (!envelope.success) return false;
      const { claims, sessionId, scopeHash } = envelope.data;
      const { snapshot } = current;
      const now = this.nowSeconds();
      return seconds.safeParse(now).success && claims.iat <= now && claims.exp > now && claims.exp - claims.iat === 60
        && claims.aud === audience && sessionId === snapshot.sessionId && claims.sub === snapshot.userId
        && claims.tenantId === snapshot.activeTenantId && claims.membershipId === snapshot.authority?.membershipId
        && claims.generation === snapshot.generation && scopeHash === current.scopeHash;
    } catch { return false; }
  }

  async download(sessionToken: string, raw: unknown) {
    this.assertEnabled();
    const input = downloadV1.safeParse(raw);
    if (!input.success) throw new SyncServerError("SYNC_INVALID_INPUT");
    const { request, token, afterJobId, pageSize, delivered } = input.data;
    let current: Awaited<ReturnType<SyntheticSyncDownloadApplication["current"]>> | undefined;
    try { current = await this.current(sessionToken, request); }
    catch (error) {
      if (!(error instanceof SyncServerError) || error.code !== "SYNC_AUTHORITY_REQUIRED") throw error;
    }
    const facts = current && this.validToken(token, current) ? current.facts : {
      version: "sync-download-facts.v1", environment: "synthetic_demo", request, authority: null, source: [],
    };
    // Reconcile the entire current projection, never just this page (which would purge later pages).
    const decision = evaluateSyncDownloadV1(facts);
    const cleanup = planSyncReconcileV1({ version: "sync-reconcile.v1", delivered, decision });
    const page = pageSyncDownloadV1({ facts, afterJobId, pageSize });
    return { version: "sync-server-download-result.v1" as const, page, cleanup,
      resync: page.outcome === "refused" ? "required" as const : "none" as const };
  }
}
