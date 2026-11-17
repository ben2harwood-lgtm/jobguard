import { buildExtraSourcePack } from "@jobguard/core";
import { createHash } from "node:crypto";
import type { PrivateVersionedStorage } from "@jobguard/storage";
import { ExtraSourceError, type ExtraEvidenceSources } from "./extra-evidence-pack-sources.js";

/** Second phase after withTenant commits. This module receives no pool/transaction; storage I/O never holds business locks. */
export async function assembleExtraSourcePack(loaded: ExtraEvidenceSources, storage: PrivateVersionedStorage) {
  const sources = loaded.sources.map(s => ({ ...s }));
  for (const original of loaded.originalObjects) {
    const source = sources.find(s => s.sourceId === original.sourceId);
    if (!source) throw new ExtraSourceError("EXTRA_SOURCE_INVALID");
    try {
      const stored = await storage.readExactVersion(original.key, original.versionId);
      if (stored.key !== original.key || stored.versionId !== original.versionId || stored.byteLength !== stored.bytes.length || stored.bytes.length !== original.byteLength || stored.contentType !== original.contentType || createHash("sha256").update(stored.bytes).digest("hex") !== original.sha256) throw new ExtraSourceError("EXTRA_SOURCE_INVALID");
      source.content = JSON.stringify({ record: source.content, originalBytesBase64: Buffer.from(stored.bytes).toString("base64") });
    } catch { throw new ExtraSourceError("EXTRA_SOURCE_INVALID"); }
  }
  return buildExtraSourcePack(loaded.jobId, loaded.extraId, sources, loaded.omissions);
}
