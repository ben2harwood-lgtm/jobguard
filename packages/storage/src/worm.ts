import {
  GetObjectLegalHoldCommand, GetObjectRetentionCommand, HeadObjectCommand, PutObjectLegalHoldCommand,
  PutObjectRetentionCommand, S3Client,
} from "@aws-sdk/client-s3";
import { z } from "zod";
import { storageEnvironmentSchema } from "./index.js";

export class WormBoundaryError extends Error {
  constructor(readonly code: "DARK_ONLY" | "INVALID_INPUT" | "NOT_AUTHORIZED" | "REPLAY_CONFLICT" | "OUTCOME_UNKNOWN") {
    super(code); this.name = "WormBoundaryError";
  }
}

// These are fixture classes, not D07-approved periods. No production activation switch exists.
export const syntheticRetentionClasses = Object.freeze({
  synthetic_evidence: 24 * 60 * 60 * 1000,
  synthetic_checkpoint: 48 * 60 * 60 * 1000,
});
const versionSchema = z.object({
  tenantId: z.uuid(), key: z.string().min(1), versionId: z.string().min(1).refine(v => v !== "null"),
}).strict();
export type WormVersion = z.infer<typeof versionSchema>;
const commandSchema = z.object({
  schemaVersion: z.literal(1), commandId: z.uuid(), actorId: z.uuid(), tenantId: z.uuid(),
  evidence: versionSchema.extend({ status: z.literal("verified"), synthetic: z.literal(true) }).strict(),
  approval: z.object({
    resolution: z.literal("approved"), tenantId: z.uuid(), actorId: z.uuid(),
    key: z.string(), versionId: z.string(), action: z.enum(["retain", "hold", "release"]),
    policyVersion: z.literal("synthetic_d07_v1"), expiresAt: z.iso.datetime(),
    retentionClass: z.enum(["synthetic_evidence", "synthetic_checkpoint"]), retainUntil: z.iso.datetime(),
  }).strict(),
  action: z.enum(["retain", "hold", "release"]),
  retentionClass: z.enum(["synthetic_evidence", "synthetic_checkpoint"]),
  retainUntil: z.iso.datetime(),
}).strict();
export type SyntheticWormCommand = z.infer<typeof commandSchema>;
export interface WormStorage {
  read(version: WormVersion): Promise<{ retainUntil: string | null; held: boolean }>;
  retain(version: WormVersion, until: string): Promise<void>;
  hold(version: WormVersion, held: boolean): Promise<void>;
}

export function assertSyntheticVersion(version: WormVersion): void {
  const parsed = versionSchema.safeParse(version);
  if (!parsed.success || !version.key.startsWith(`synthetic/tenants/${version.tenantId}/`) ||
      version.key.split("/").some(part => part === ".." || part === ".")) {
    throw new WormBoundaryError("INVALID_INPUT");
  }
}

/** Local MinIO only. Disabled by default; never accepts a production endpoint. */
export class LocalMinioWormStorage implements WormStorage {
  readonly #client: S3Client;
  readonly #bucket: string;
  constructor(config: z.input<typeof storageEnvironmentSchema>, enabled = false) {
    const parsed = storageEnvironmentSchema.parse(config);
    const endpoint = new URL(parsed.S3_ENDPOINT);
    if (!enabled || !["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname) ||
        endpoint.protocol !== "http:" || endpoint.username || endpoint.password ||
        !parsed.S3_BUCKET.startsWith("synthetic-")) throw new WormBoundaryError("DARK_ONLY");
    this.#bucket = parsed.S3_BUCKET;
    this.#client = new S3Client({ endpoint: parsed.S3_ENDPOINT, region: parsed.S3_REGION, forcePathStyle: true,
      credentials: { accessKeyId: parsed.S3_ACCESS_KEY_ID, secretAccessKey: parsed.S3_SECRET_ACCESS_KEY },
      maxAttempts: 1, followRegionRedirects: false });
  }
  #target(version: WormVersion) {
    assertSyntheticVersion(version);
    return { Bucket: this.#bucket, Key: version.key, VersionId: version.versionId };
  }
  async #writeTarget(version: WormVersion) {
    const target = this.#target(version);
    const head = await this.#client.send(new HeadObjectCommand(target)).catch(() => {
      // No mutation has been sent: a failed preflight is a refusal, not an unknown write.
      throw new WormBoundaryError("INVALID_INPUT");
    });
    if (head.VersionId !== version.versionId || !Number.isSafeInteger(head.ContentLength) ||
        head.ContentLength! < 0) {
      throw new WormBoundaryError("INVALID_INPUT");
    }
    return target;
  }
  async read(version: WormVersion) {
    const target = this.#target(version);
    const retention = await this.#client.send(new GetObjectRetentionCommand(target));
    const hold = await this.#client.send(new GetObjectLegalHoldCommand(target));
    if (hold.LegalHold?.Status !== "ON" && hold.LegalHold?.Status !== "OFF") {
      throw new WormBoundaryError("INVALID_INPUT");
    }
    return { retainUntil: retention.Retention?.RetainUntilDate?.toISOString() ?? null,
      held: hold.LegalHold.Status === "ON" };
  }
  async retain(version: WormVersion, until: string) {
    if (!z.iso.datetime().safeParse(until).success) throw new WormBoundaryError("INVALID_INPUT");
    await this.#write(new PutObjectRetentionCommand({ ...await this.#writeTarget(version),
      Retention: { Mode: "COMPLIANCE", RetainUntilDate: new Date(until) } }));
  }
  async hold(version: WormVersion, held: boolean) {
    if (typeof held !== "boolean") throw new WormBoundaryError("INVALID_INPUT");
    await this.#write(new PutObjectLegalHoldCommand({ ...await this.#writeTarget(version),
      LegalHold: { Status: held ? "ON" : "OFF" } }));
  }
  async #write(command: PutObjectLegalHoldCommand | PutObjectRetentionCommand) {
    try { await this.#client.send(command); }
    catch (error) {
      // An explicit access denial proves refusal. Other failures may follow an
      // accepted write and must retain the existing unknown-outcome handling.
      if (error instanceof Error && error.name === "AccessDenied" &&
          "$metadata" in error && (error.$metadata as { httpStatusCode?: number })?.httpStatusCode === 403) {
        throw new WormBoundaryError("NOT_AUTHORIZED");
      }
      throw error;
    }
  }
}

/** In-memory synthetic harness only: not a durable command store or an application authorization boundary. */
export class SyntheticRetentionWorkflow {
  readonly #attempts = new Map<string, { payload: string; outcome: "applied" | "outcome_unknown" | "refused"; refusalCode?: WormBoundaryError["code"] }>();
  readonly events: Readonly<{ commandId: string; action: string; outcome: string }>[] = [];
  #tail: Promise<unknown> = Promise.resolve();
  constructor(private readonly storage: WormStorage, private readonly enabled = false) {}
  execute(input: unknown, context: { tenantId: string; actorId: string; retentionOfficer: boolean }, now: Date) {
    // Serialize the fixture harness, including concurrent duplicate attempts.
    const result = this.#tail.then(() => this.#execute(input, context, now));
    this.#tail = result.catch(() => undefined);
    return result;
  }
  async #execute(input: unknown, context: { tenantId: string; actorId: string; retentionOfficer: boolean }, now: Date) {
    if (!this.enabled) throw new WormBoundaryError("DARK_ONLY");
    const parsed = commandSchema.safeParse(input);
    if (!parsed.success || !Number.isFinite(now.getTime())) throw new WormBoundaryError("INVALID_INPUT");
    const c = parsed.data;
    assertSyntheticVersion({ tenantId: c.evidence.tenantId, key: c.evidence.key, versionId: c.evidence.versionId });
    if (!context.retentionOfficer || context.tenantId !== c.tenantId || context.actorId !== c.actorId ||
        c.evidence.tenantId !== c.tenantId || c.approval.tenantId !== c.tenantId ||
        c.approval.actorId !== c.actorId || c.approval.key !== c.evidence.key ||
        c.approval.versionId !== c.evidence.versionId || c.approval.action !== c.action ||
        c.approval.retentionClass !== c.retentionClass || c.approval.retainUntil !== c.retainUntil ||
        Date.parse(c.approval.expiresAt) <= now.getTime()) throw new WormBoundaryError("NOT_AUTHORIZED");
    const id = `${c.tenantId}/${c.commandId}`;
    const payload = JSON.stringify(c);
    const prior = this.#attempts.get(id);
    if (prior) {
      if (prior.payload !== payload) throw new WormBoundaryError("REPLAY_CONFLICT");
      if (prior.outcome === "outcome_unknown") throw new WormBoundaryError("OUTCOME_UNKNOWN");
      if (prior.outcome === "refused") throw new WormBoundaryError(prior.refusalCode!);
      return "applied" as const;
    }
    const target = { tenantId: c.evidence.tenantId, key: c.evidence.key, versionId: c.evidence.versionId };
    const until = Date.parse(c.retainUntil);
    if (c.action === "retain" && (until <= now.getTime() ||
        until > now.getTime() + syntheticRetentionClasses[c.retentionClass])) throw new WormBoundaryError("INVALID_INPUT");
    const current = await this.storage.read(target);
    if (c.action === "retain" && current.retainUntil && Date.parse(current.retainUntil) > until) {
      throw new WormBoundaryError("INVALID_INPUT"); // Never shorten retention, including after hold release.
    }
    this.#attempts.set(id, { payload, outcome: "outcome_unknown" });
    try {
      if (c.action === "retain") await this.storage.retain(target, c.retainUntil);
      else await this.storage.hold(target, c.action === "hold");
    } catch (error) {
      if (error instanceof WormBoundaryError && error.code !== "OUTCOME_UNKNOWN") {
        this.#attempts.set(id, { payload, outcome: "refused", refusalCode: error.code });
        this.events.push({ commandId: c.commandId, action: c.action, outcome: "refused" });
        throw error;
      }
      this.events.push({ commandId: c.commandId, action: c.action, outcome: "outcome_unknown" });
      throw new WormBoundaryError("OUTCOME_UNKNOWN");
    }
    this.#attempts.set(id, { payload, outcome: "applied" });
    this.events.push({ commandId: c.commandId, action: c.action, outcome: "applied" });
    return "applied" as const;
  }
}
