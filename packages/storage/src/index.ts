import { createHash } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { z } from "zod";

export const storageEnvironmentSchema = z.object({
  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1).default("eu-west-2"),
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

  constructor(config: z.input<typeof storageEnvironmentSchema>) {
    const parsed = storageEnvironmentSchema.parse(config);
    const clientConfig: S3ClientConfig = {
      endpoint: parsed.S3_ENDPOINT,
      region: parsed.S3_REGION,
      forcePathStyle: true,
      credentials: { accessKeyId: parsed.S3_ACCESS_KEY_ID, secretAccessKey: parsed.S3_SECRET_ACCESS_KEY },
    };
    this.#client = new S3Client(clientConfig);
    this.#bucket = parsed.S3_BUCKET;
  }

  createUploadUrl(input: { key: string; contentType: string; expiresInSeconds: number }) {
    return getSignedUrl(this.#client, new PutObjectCommand({ Bucket: this.#bucket, Key: input.key,
      ContentType: input.contentType }), { expiresIn: input.expiresInSeconds });
  }

  createDownloadUrl(input: { key: string; versionId: string; expiresInSeconds: number }) {
    if (!input.versionId) throw new MissingObjectVersionError();
    return getSignedUrl(this.#client, new GetObjectCommand({ Bucket: this.#bucket, Key: input.key,
      VersionId: input.versionId }), { expiresIn: input.expiresInSeconds });
  }

  async readExactVersion(key: string, versionId: string): Promise<StoredObject> {
    if (!versionId) throw new MissingObjectVersionError();
    const head = await this.#client.send(new HeadObjectCommand({ Bucket: this.#bucket, Key: key, VersionId: versionId }));
    if (!head.VersionId) throw new MissingObjectVersionError();
    const result = await this.#client.send(new GetObjectCommand({ Bucket: this.#bucket, Key: key, VersionId: versionId }));
    if (!result.VersionId || result.VersionId !== head.VersionId) throw new MissingObjectVersionError();
    const bytes = await result.Body?.transformToByteArray();
    if (!bytes) throw new Error("Object body is missing");
    return { key, versionId: result.VersionId, contentType: result.ContentType ?? head.ContentType ?? "application/octet-stream",
      byteLength: bytes.byteLength, bytes };
  }

  async deleteExactVersion(key: string, versionId: string): Promise<void> {
    if (!versionId) throw new MissingObjectVersionError();
    await this.#client.send(new DeleteObjectCommand({ Bucket: this.#bucket, Key: key, VersionId: versionId }));
  }
}

export function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
