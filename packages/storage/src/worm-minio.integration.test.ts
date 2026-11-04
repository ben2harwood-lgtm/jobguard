import { randomUUID } from "node:crypto";
import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { expect, it } from "vitest";
import { LocalMinioWormStorage } from "./worm.js";

// Explicit opt-in: this is a local MinIO test, not evidence of production S3 semantics.
it.skipIf(process.env.JOBGUARD_TEST_LOCAL_MINIO !== "1")("local MinIO enforces exact-version compliance retention and hold/release", async () => {
  const config = { S3_ENDPOINT: "http://127.0.0.1:9000", S3_REGION: "eu-west-2",
    S3_BUCKET: `synthetic-worm-${randomUUID()}`, S3_ACCESS_KEY_ID: "synthetic-local",
    S3_SECRET_ACCESS_KEY: "synthetic-local-secret" };
  const storage = new LocalMinioWormStorage(config, true);
  const client = new S3Client({ endpoint: config.S3_ENDPOINT, region: config.S3_REGION, forcePathStyle: true,
    credentials: { accessKeyId: config.S3_ACCESS_KEY_ID, secretAccessKey: config.S3_SECRET_ACCESS_KEY }, maxAttempts: 1 });
  await client.send(new CreateBucketCommand({ Bucket: config.S3_BUCKET, ObjectLockEnabledForBucket: true }));
  const tenantId = "10000000-0000-4000-8000-000000000001";
  const key = `synthetic/tenants/${tenantId}/original`;
  const target = { Bucket: config.S3_BUCKET, Key: key };
  const original = await client.send(new PutObjectCommand({ ...target, Body: "synthetic-original" }));
  expect(original.VersionId).toBeTruthy();
  const version = { tenantId, key, versionId: original.VersionId! };
  const until = new Date(Math.floor(Date.now() / 1000) * 1000 + 60_000).toISOString();
  await storage.retain(version, until);
  await storage.hold(version, false);
  expect((await storage.read(version)).retainUntil).toBe(until);
  await expect(storage.retain(version, new Date(Date.parse(until) - 30_000).toISOString())).rejects.toMatchObject({ name: "AccessDenied" });
  await expect(client.send(new DeleteObjectCommand({ ...target, VersionId: version.versionId }))).rejects.toMatchObject({ name: "AccessDenied" });
  const replacement = await client.send(new PutObjectCommand({ ...target, Body: "synthetic-replacement" }));
  expect(replacement.VersionId).not.toBe(version.versionId);
  const held = { ...version, versionId: replacement.VersionId! };
  await storage.hold(held, true);
  expect((await storage.read(held)).held).toBe(true);
  await expect(client.send(new DeleteObjectCommand({ ...target, VersionId: held.versionId }))).rejects.toMatchObject({ name: "AccessDenied" });
  await storage.hold(held, false);
  expect((await storage.read(held)).held).toBe(false);
  expect((await storage.read(version)).retainUntil).toBe(until);
  const bytes = await client.send(new GetObjectCommand({ ...target, VersionId: version.versionId }));
  expect(await bytes.Body!.transformToString()).toBe("synthetic-original");
  // No cleanup deletion: the local fixture stays locked until expiry; CI's disposable container is discarded.
}, 30_000);
