import { createHash } from "node:crypto";
import { GetBucketVersioningCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { afterEach, expect, it, vi } from "vitest";
import { S3PrivateVersionedStorage } from "./index.js";

const config = {
  S3_ENDPOINT: "https://storage.invalid",
  S3_REGION: "fictional-region",
  S3_BUCKET: "jobguard-pilot-evidence",
  S3_ACCESS_KEY_ID: "fictional-pilot-access",
  S3_SECRET_ACCESS_KEY: "fictional-pilot-storage-secret",
};
const sha256 = Object.fromEntries(Object.entries(config).map(([key, value]) => [key, createHash("sha256").update(value).digest("hex")]));
const pilot = { JOBGUARD_ENV: "pilot_no_charge", JOBGUARD_PILOT_RESOURCES: JSON.stringify({ version: "pilot-resources.v1", sha256 }) };
const practice = { JOBGUARD_ENV: "synthetic_demo" };
const pilotKey = "pilot_no_charge/tenant/job/fictional-photo";

afterEach(() => vi.restoreAllMocks());

it("refuses crossed buckets and substituted credentials or endpoint before creating an adapter", () => {
  expect(() => new S3PrivateVersionedStorage(config, practice)).toThrow("STORAGE_MODE_REFUSED");
  expect(() => new S3PrivateVersionedStorage({ ...config, S3_BUCKET: "practice-bucket" }, pilot)).toThrow("STORAGE_MODE_REFUSED");
  expect(() => new S3PrivateVersionedStorage({ ...config, S3_SECRET_ACCESS_KEY: "wrong-secret" }, pilot)).toThrow("STORAGE_MODE_REFUSED");
  expect(() => new S3PrivateVersionedStorage({ ...config, S3_ENDPOINT: "https://practice-storage.invalid" }, pilot)).toThrow("STORAGE_MODE_REFUSED");
});

it("refuses cross-mode objects before storage I/O", async () => {
  const send = vi.spyOn(S3Client.prototype, "send");
  const pilotStorage = new S3PrivateVersionedStorage(config, pilot);
  const practiceStorage = new S3PrivateVersionedStorage({ ...config, S3_BUCKET: "practice-bucket" }, practice);
  await expect(pilotStorage.readExactVersion("fixture/object", "object-version")).rejects.toThrow("STORAGE_MODE_REFUSED");
  await expect(practiceStorage.readExactVersion(pilotKey, "object-version")).rejects.toThrow("STORAGE_MODE_REFUSED");
  await expect(pilotStorage.createUploadUrl({ key: "pilot_no_charge/../fixture", contentType: "image/png", expiresInSeconds: 60 }))
    .rejects.toThrow("STORAGE_MODE_REFUSED");
  expect(send).not.toHaveBeenCalled();
});

it("requires versioning and exact object versions with no fallback to the current version", async () => {
  const send = vi.spyOn(S3Client.prototype, "send")
    .mockResolvedValueOnce({ Status: "Suspended" } as never)
    .mockResolvedValueOnce({ Status: "Enabled" } as never)
    .mockResolvedValueOnce({ VersionId: "different-version" } as never);
  const storage = new S3PrivateVersionedStorage(config, pilot);
  await expect(storage.readExactVersion(pilotKey, "requested-version")).rejects.toThrow("PILOT_BUCKET_VERSIONING_REQUIRED");
  await expect(storage.readExactVersion(pilotKey, "requested-version")).rejects.toThrow("A concrete object version is required");
  expect(send.mock.calls.map(([command]) => command.constructor)).toEqual([
    GetBucketVersioningCommand, GetBucketVersioningCommand, HeadObjectCommand,
  ]);
});
