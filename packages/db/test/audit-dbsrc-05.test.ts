import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { hasCompleteImage } from "../src/evidence.js";

const invalidImages = [
  { name: "marker-only JPEG", bytes: Buffer.from([0xff, 0xd8, 0, 0, 0xff, 0xd9]), contentType: "image/jpeg" },
  { name: "header-only WebP", bytes: Buffer.from("RIFF0000WEBPx"), contentType: "image/webp" },
];

describe("AUDIT-FIX-DBSRC-05 image verification", () => {
  it.each(invalidImages)("rejects $name before registering proof", async ({ bytes, contentType }) => {
    expect(await hasCompleteImage(bytes, contentType)).toBe(false);
  });

  it.each(["jpeg", "webp", "png"] as const)("accepts a decodable synthetic %s control", async format => {
    const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#102030" } })
      .toFormat(format).toBuffer();
    expect(await hasCompleteImage(bytes, `image/${format}`)).toBe(true);
  });
  it("rejects complete bytes declared as another image format", async () => {
    const bytes = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#102030" } }).jpeg().toBuffer();
    expect(await hasCompleteImage(bytes, "image/webp")).toBe(false);
  });

  it.each(["jpeg", "webp"] as const)("rejects a truncated encoded %s with intact headers", async format => {
    const bytes = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#102030" } }).toFormat(format).toBuffer();
    expect(await hasCompleteImage(bytes.subarray(0, bytes.length - 8), `image/${format}`)).toBe(false);
  });
});
