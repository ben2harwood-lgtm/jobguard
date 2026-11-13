import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MissingObjectVersionError, S3PrivateVersionedStorage } from "../src/index.js";

vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl: vi.fn() }));

const key = "synthetic/photo.jpg";
const versionId = "synthetic-version-1";
const config = {
  S3_ENDPOINT: "https://storage.invalid",
  S3_BUCKET: "synthetic-evidence",
  S3_ACCESS_KEY_ID: "synthetic-key",
  S3_SECRET_ACCESS_KEY: "synthetic-secret",
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(getSignedUrl).mockReset();
});

describe("private storage requires immutable object versions", () => {
  it.each(["null", ""])("rejects download version %j before signing", invalidVersion => {
    const storage = new S3PrivateVersionedStorage(config);
    expect(() => storage.createDownloadUrl({ key, versionId: invalidVersion, expiresInSeconds: 60 }))
      .toThrow(MissingObjectVersionError);
    expect(getSignedUrl).not.toHaveBeenCalled();
  });

  it.each(["null", ""])("rejects read version %j before contacting S3", async invalidVersion => {
    const send = vi.spyOn(S3Client.prototype, "send").mockResolvedValue({});
    const storage = new S3PrivateVersionedStorage(config);
    await expect(storage.readExactVersion(key, invalidVersion)).rejects.toBeInstanceOf(MissingObjectVersionError);
    expect(send).not.toHaveBeenCalled();
  });

  it.each(["null", ""])("rejects delete version %j before contacting S3", async invalidVersion => {
    const send = vi.spyOn(S3Client.prototype, "send").mockResolvedValue({});
    const storage = new S3PrivateVersionedStorage(config);
    await expect(storage.deleteExactVersion(key, invalidVersion)).rejects.toBeInstanceOf(MissingObjectVersionError);
    expect(send).not.toHaveBeenCalled();
  });

  it("rejects a null HEAD version before fetching bytes", async () => {
    const send = vi.spyOn(S3Client.prototype, "send").mockResolvedValue({ VersionId: "null" });
    const storage = new S3PrivateVersionedStorage(config);
    await expect(storage.readExactVersion(key, versionId)).rejects.toBeInstanceOf(MissingObjectVersionError);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(HeadObjectCommand);
  });

  it("rejects a null GET version before reading its body", async () => {
    const readBody = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
    const send = vi.spyOn(S3Client.prototype, "send")
      .mockResolvedValueOnce({ VersionId: versionId })
      .mockResolvedValueOnce({ VersionId: "null", Body: { transformToByteArray: readBody } });
    const storage = new S3PrivateVersionedStorage(config);
    await expect(storage.readExactVersion(key, versionId)).rejects.toBeInstanceOf(MissingObjectVersionError);
    expect(send).toHaveBeenCalledTimes(2);
    expect(readBody).not.toHaveBeenCalled();
  });

  it("signs, reads and deletes a concrete version", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const send = vi.spyOn(S3Client.prototype, "send")
      .mockResolvedValueOnce({ VersionId: versionId })
      .mockResolvedValueOnce({ VersionId: versionId, ContentType: "image/jpeg",
        Body: { transformToByteArray: async () => bytes } })
      .mockResolvedValueOnce({});
    vi.mocked(getSignedUrl).mockResolvedValue("https://storage.invalid/synthetic-download");
    const storage = new S3PrivateVersionedStorage(config);

    await expect(storage.createDownloadUrl({ key, versionId, expiresInSeconds: 60 }))
      .resolves.toBe("https://storage.invalid/synthetic-download");
    const signedCommand = vi.mocked(getSignedUrl).mock.calls[0]?.[1];
    expect(signedCommand).toBeInstanceOf(GetObjectCommand);
    expect(signedCommand?.input).toEqual({ Bucket: config.S3_BUCKET, Key: key, VersionId: versionId });
    await expect(storage.readExactVersion(key, versionId)).resolves.toEqual({
      key, versionId, contentType: "image/jpeg", byteLength: 3, bytes,
    });
    await storage.deleteExactVersion(key, versionId);
    expect(send.mock.calls.map(([command]) => command.constructor)).toEqual([
      HeadObjectCommand, GetObjectCommand, DeleteObjectCommand,
    ]);
    for (const [command] of send.mock.calls) {
      expect(command.input).toEqual({ Bucket: config.S3_BUCKET, Key: key, VersionId: versionId });
    }
  });
});
