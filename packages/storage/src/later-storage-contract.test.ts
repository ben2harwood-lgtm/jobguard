import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MissingObjectVersionError, S3PrivateVersionedStorage, sha256, storageEnvironmentSchema } from "./index.js";

const sdk = vi.hoisted(() => ({ send: vi.fn(), sign: vi.fn() }));

vi.mock("@aws-sdk/client-s3", async (importOriginal) => ({
  ...await importOriginal<typeof import("@aws-sdk/client-s3")>(),
  S3Client: class { send = sdk.send; },
}));
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: sdk.sign }));

const objectKey = "synthetic/evidence";
const versionId = "immutable-version-1";
const invalidVersions = [undefined, null, "", "null", " ", "\t"];

function storage() {
  const credentials = Object.fromEntries(
    ["S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"].map((name) => [name, randomUUID()]),
  );
  return new S3PrivateVersionedStorage(storageEnvironmentSchema.parse({
    ...credentials,
    S3_ENDPOINT: "https://storage.invalid",
    S3_BUCKET: "synthetic-evidence",
  }));
}

async function expectVersionFailure(action: () => unknown) {
  const result = Promise.resolve().then(action);
  await expect(result).rejects.toBeInstanceOf(MissingObjectVersionError);
  await expect(result).rejects.toMatchObject({ code: "MISSING_OBJECT_VERSION" });
}

describe("LATER-B4 immutable storage version contract", () => {
  beforeEach(() => {
    sdk.send.mockReset();
    sdk.sign.mockReset();
    sdk.sign.mockResolvedValue("https://storage.invalid/signed");
  });

  it.each(invalidVersions)("L044 rejects missing empty and literal-null versions before signing: %j", async (invalid) => {
    const adapter = storage();
    await expectVersionFailure(() => adapter.createDownloadUrl({
      key: objectKey, versionId: invalid as string, expiresInSeconds: 60,
    }));
    expect(sdk.sign).not.toHaveBeenCalled();
    expect(sdk.send).not.toHaveBeenCalled();
  });

  it.each(invalidVersions)("L044 rejects invalid returned HEAD versions before retrieving bytes: %j", async (invalid) => {
    sdk.send.mockResolvedValueOnce({ VersionId: invalid });
    await expectVersionFailure(() => storage().readExactVersion(objectKey, versionId));
    expect(sdk.send).toHaveBeenCalledTimes(1);
    expect(sdk.send.mock.calls[0]?.[0]).toBeInstanceOf(HeadObjectCommand);
  });

  it("L044 rejects a returned HEAD version different from the requested version before GET", async () => {
    sdk.send.mockResolvedValue({
      VersionId: "different-version",
      Body: { transformToByteArray: async () => new TextEncoder().encode("abc") },
    });
    await expectVersionFailure(() => storage().readExactVersion(objectKey, versionId));
    expect(sdk.send).toHaveBeenCalledTimes(1);
  });

  it.each([...invalidVersions, "different-version"])("L044 rejects invalid or mismatched returned GET versions: %j", async (invalid) => {
    const readBytes = vi.fn().mockResolvedValue(new TextEncoder().encode("abc"));
    sdk.send.mockResolvedValueOnce({ VersionId: versionId }).mockResolvedValueOnce({
      VersionId: invalid, Body: { transformToByteArray: readBytes },
    });
    await expectVersionFailure(() => storage().readExactVersion(objectKey, versionId));
    expect(sdk.send).toHaveBeenCalledTimes(2);
    expect(readBytes).not.toHaveBeenCalled();
  });

  it("L045 hash matches known SHA-256 vector and changes with bytes", () => {
    expect(sha256(new Uint8Array())).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    const bytes = new TextEncoder().encode("abc");
    const digest = sha256(bytes);
    expect(digest).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    bytes[2] = 100;
    expect(sha256(bytes)).not.toBe(digest);
  });

  it("L045 supplied metadata cannot substitute for server-calculated content hash through actual reads", async () => {
    const bytes = new TextEncoder().encode("abc");
    const metadata = { sha256: "0".repeat(64) };
    sdk.send.mockResolvedValueOnce({ VersionId: versionId, Metadata: metadata, ContentLength: 999 })
      .mockResolvedValueOnce({
        VersionId: versionId, Metadata: metadata, ContentLength: 999,
        Body: { transformToByteArray: async () => bytes },
      });
    const result = await storage().readExactVersion(objectKey, versionId);
    expect(result.byteLength).toBe(3);
    expect(result.bytes).toEqual(bytes);
    expect(sha256(result.bytes)).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256(result.bytes)).not.toBe(metadata.sha256);
  });

  it.each(invalidVersions)("L046 actual storage operations reject absent or mutable versions: %j", async (invalid) => {
    const adapter = storage();
    const version = invalid as string;
    await expectVersionFailure(() => adapter.createDownloadUrl({ key: objectKey, versionId: version, expiresInSeconds: 60 }));
    await expectVersionFailure(() => adapter.readExactVersion(objectKey, version));
    await expectVersionFailure(() => adapter.deleteExactVersion(objectKey, version));
    expect(sdk.sign).not.toHaveBeenCalled();
    expect(sdk.send).not.toHaveBeenCalled();
  });

  it("L046 valid immutable versions still work through signing reading and deletion commands", async () => {
    const adapter = storage();
    const bytes = new TextEncoder().encode("abc");
    sdk.send.mockResolvedValueOnce({ VersionId: versionId, ContentType: "image/png" })
      .mockResolvedValueOnce({ VersionId: versionId, Body: { transformToByteArray: async () => bytes } })
      .mockResolvedValueOnce({});
    await expect(adapter.createDownloadUrl({ key: objectKey, versionId, expiresInSeconds: 60 }))
      .resolves.toBe("https://storage.invalid/signed");
    const signed = sdk.sign.mock.calls[0];
    expect(signed?.[1]).toBeInstanceOf(GetObjectCommand);
    expect(signed?.[1].input).toEqual({ Bucket: "synthetic-evidence", Key: objectKey, VersionId: versionId });
    expect(signed?.[2]).toEqual({ expiresIn: 60 });
    await expect(adapter.readExactVersion(objectKey, versionId)).resolves.toEqual({
      key: objectKey, versionId, contentType: "image/png", byteLength: 3, bytes,
    });
    await expect(adapter.deleteExactVersion(objectKey, versionId)).resolves.toBeUndefined();
    expect(sdk.send).toHaveBeenCalledTimes(3);
    for (const [index, commandType] of [HeadObjectCommand, GetObjectCommand, DeleteObjectCommand].entries()) {
      const command = sdk.send.mock.calls[index]?.[0];
      expect(command).toBeInstanceOf(commandType);
      expect(command.input).toEqual({ Bucket: "synthetic-evidence", Key: objectKey, VersionId: versionId });
    }
  });

  it("L046 upload signing still creates a version without requiring an existing version", async () => {
    await expect(storage().createUploadUrl({ key: objectKey, contentType: "image/png", expiresInSeconds: 60 }))
      .resolves.toBe("https://storage.invalid/signed");
    expect(sdk.sign.mock.calls[0]?.[1]).toBeInstanceOf(PutObjectCommand);
    expect(sdk.sign.mock.calls[0]?.[1].input).toEqual({
      Bucket: "synthetic-evidence", Key: objectKey, ContentType: "image/png",
    });
  });
});
