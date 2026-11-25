import { createHash } from "node:crypto";
import {
  DeleteObjectCommand,
  GetBucketVersioningCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";

export const storageEnvironmentSchema = z.object({
  S3_ENDPOINT: z.string().refine(value => URL.canParse(value), "Invalid url"),
  S3_REGION: z.string().min(1).prefault("eu-west-2"),
  S3_BUCKET: z.string().min(3),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
});

export type StoredObject = {
  readonly key: string;
  readonly versionId: string;
  readonly contentType: string;
  readonly byteLength: number;
  readonly bytes: Uint8Array;
};

export interface PrivateVersionedStorage {
  createUploadUrl(input: { key: string; contentType: string; expiresInSeconds: number }): Promise<string>;
  createDownloadUrl(input: { key: string; versionId: string; expiresInSeconds: number }): Promise<string>;
  readExactVersion(key: string, versionId: string): Promise<StoredObject>;
  deleteExactVersion(key: string, versionId: string): Promise<void>;
}

export class MissingObjectVersionError extends Error {
  readonly code = "MISSING_OBJECT_VERSION";
  constructor() { super("A concrete object version is required"); this.name = "MissingObjectVersionError"; }
}

export class S3PrivateVersionedStorage implements PrivateVersionedStorage {
  readonly #client: S3Client;
  readonly #bucket: string;
  readonly #pilot: boolean;

  constructor(config: z.input<typeof storageEnvironmentSchema>, deployment = process.env) {
    const parsed = storageEnvironmentSchema.parse(config);
    this.#pilot = deployment.JOBGUARD_ENV === "pilot_no_charge";
    if (this.#pilot !== parsed.S3_BUCKET.startsWith("jobguard-pilot-") ||
        parsed.S3_BUCKET.startsWith("jobguard-pilot-restore-")) throw new Error("STORAGE_MODE_REFUSED");
    if (this.#pilot) {
      let raw: unknown;
      try { raw = JSON.parse(deployment.JOBGUARD_PILOT_RESOURCES ?? "null"); }
      catch { throw new Error("STORAGE_MODE_REFUSED"); }
      const binding = z.object({
        version: z.literal("pilot-resources.v1"),
        sha256: z.record(z.string(), z.string()),
      }).safeParse(raw);
      if (!binding.success || Object.entries(parsed).some(([key, value]) =>
        binding.data.sha256[key] !== createHash("sha256").update(value).digest("hex"))) throw new Error("STORAGE_MODE_REFUSED");
    }
    const clientConfig: S3ClientConfig = {
      endpoint: parsed.S3_ENDPOINT,
      region: parsed.S3_REGION,
      forcePathStyle: true,
      credentials: { accessKeyId: parsed.S3_ACCESS_KEY_ID, secretAccessKey: parsed.S3_SECRET_ACCESS_KEY },
    };
    this.#client = new S3Client(clientConfig);
    this.#bucket = parsed.S3_BUCKET;
  }

  async #assertObjectMode(key: string) {
    if (this.#pilot !== key.startsWith("pilot_no_charge/")) throw new Error("STORAGE_MODE_REFUSED");
    if (this.#pilot && key.split("/").some(part => !part || part === "." || part === ".." || !/^[a-zA-Z0-9_.-]+$/u.test(part))) {
      throw new Error("STORAGE_MODE_REFUSED");
    }
    if (this.#pilot) {
      const versioning = await this.#client.send(new GetBucketVersioningCommand({ Bucket: this.#bucket }));
      if (versioning.Status !== "Enabled") throw new Error("PILOT_BUCKET_VERSIONING_REQUIRED");
    }
  }

  async createUploadUrl(input: { key: string; contentType: string; expiresInSeconds: number }) {
    await this.#assertObjectMode(input.key);
    return getSignedUrl(this.#client, new PutObjectCommand({ Bucket: this.#bucket, Key: input.key,
      ContentType: input.contentType }), { expiresIn: input.expiresInSeconds });
  }

  createDownloadUrl(input: { key: string; versionId: string; expiresInSeconds: number }) {
    if (!input.versionId || input.versionId === "null") throw new MissingObjectVersionError();
    if (!this.#pilot && input.key.startsWith("pilot_no_charge/")) throw new Error("STORAGE_MODE_REFUSED");
    const sign = () => getSignedUrl(this.#client, new GetObjectCommand({ Bucket: this.#bucket, Key: input.key,
      VersionId: input.versionId }), { expiresIn: input.expiresInSeconds });
    return this.#pilot ? this.#assertObjectMode(input.key).then(sign) : sign();
  }

  async readExactVersion(key: string, versionId: string): Promise<StoredObject> {
    if (!versionId || versionId === "null") throw new MissingObjectVersionError();
    await this.#assertObjectMode(key);
    const head = await this.#client.send(new HeadObjectCommand({ Bucket: this.#bucket, Key: key, VersionId: versionId }));
    if (!head.VersionId || head.VersionId === "null" || (this.#pilot && head.VersionId !== versionId)) throw new MissingObjectVersionError();
    const result = await this.#client.send(new GetObjectCommand({ Bucket: this.#bucket, Key: key, VersionId: versionId }));
    if (!result.VersionId || result.VersionId === "null" || result.VersionId !== head.VersionId) throw new MissingObjectVersionError();
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) throw new Error("Object body is missing");
    return { key, versionId: result.VersionId, contentType: result.ContentType ?? head.ContentType ?? "application/octet-stream",
      byteLength: bytes.byteLength, bytes };
  }

  async deleteExactVersion(key: string, versionId: string): Promise<void> {
    if (!versionId || versionId === "null") throw new MissingObjectVersionError();
    await this.#assertObjectMode(key);
    await this.#client.send(new DeleteObjectCommand({ Bucket: this.#bucket, Key: key, VersionId: versionId }));
  }
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

export * from "./worm.js";
export * from "./timestamp.js";

export * from "./v2-filesystem.js";
