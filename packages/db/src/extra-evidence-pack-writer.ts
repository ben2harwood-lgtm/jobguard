import { z } from "zod";
import type { Pool } from "pg";
import type { PrivateVersionedStorage } from "@jobguard/storage";
import { manifestDigest } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext, type TenantTransaction } from "./tenant-context.js";
import { loadExtraEvidenceSources } from "./extra-evidence-pack-sources.js";
import { assembleExtraSourcePack } from "./extra-evidence-pack-repository.js";

const commandV1 = z.object({ version: z.literal("create-extra-evidence-pack.v1"), commandId: z.guid(),
  jobId: z.guid(), extraId: z.guid(), expectedManifestDigest: z.string().regex(/^[a-f0-9]{64}$/u) }).strict();
const resultV1 = z.object({ version: z.literal("extra-evidence-pack-stored.v1"), packId: z.guid(),
  manifestDigest: z.string().regex(/^[a-f0-9]{64}$/u), contentVersion: z.literal("extra-source-pack.v1") }).strict();
export class ExtraPackWriterError extends Error {
  constructor(readonly code: "EXTRA_PACK_INVALID_COMMAND" | "EXTRA_PACK_DIGEST_MISMATCH" | "EXTRA_PACK_COMMAND_CONFLICT" | "EXTRA_PACK_FORBIDDEN" | "EXTRA_PACK_SOURCE_CHANGED") {
    super(code); this.name = "ExtraPackWriterError";
  }
}

/** Internal server adapter only: callers supply an expected digest, never artifact content or an actor id. */
export class ExtraEvidencePackWriter {
  constructor(private readonly pool: Pool, private readonly storage: PrivateVersionedStorage) {}
  async create(context: VerifiedTenantContext, raw: unknown) {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new ExtraPackWriterError("EXTRA_PACK_FORBIDDEN");
    const parsed = commandV1.safeParse(raw);
    if (!parsed.success) throw new ExtraPackWriterError("EXTRA_PACK_INVALID_COMMAND");
    const input = parsed.data;
    const call = async (db: TenantTransaction, artifact: unknown = null) => {
      const value = (await db.$client.query<{ result: unknown }>(
        "SELECT app.store_extra_pack_artifact($1,$2,$3,$4,$5::jsonb) result",
        [input.commandId, input.jobId, input.extraId, input.expectedManifestDigest, artifact === null ? null : JSON.stringify(artifact)],
      )).rows[0]?.result;
      return value === null ? null : resultV1.parse(value);
    };
    try {
      const prepared = await withTenant(this.pool, context, async db => {
        const replay = await call(db);
        if (replay) return { replay };
        const loaded = await loadExtraEvidenceSources(db, { version: "extra-source-query.v1", jobId: input.jobId, extraId: input.extraId });
        return { loaded };
      });
      if (prepared.replay) return prepared.replay;
      // Exact private object reads occur only after the first transaction has committed.
      const artifact = await assembleExtraSourcePack(prepared.loaded, this.storage);
      if (manifestDigest(artifact.integrity.manifest) !== input.expectedManifestDigest) throw new ExtraPackWriterError("EXTRA_PACK_DIGEST_MISMATCH");
      return await withTenant(this.pool, context, async db => {
        const replay = await call(db); // Recheck current actor/grant; acquire the same job lock as approval writers.
        if (replay) return replay;
        const current = await loadExtraEvidenceSources(db, { version: "extra-source-query.v1", jobId: input.jobId, extraId: input.extraId });
        if (JSON.stringify(current) !== JSON.stringify(prepared.loaded)) throw new ExtraPackWriterError("EXTRA_PACK_SOURCE_CHANGED");
        const stored = await call(db, artifact);
        if (!stored) throw new ExtraPackWriterError("EXTRA_PACK_INVALID_COMMAND");
        return stored;
      });
    } catch (error) {
      const message = (error as Error).message;
      if (message === "REQUEST_BINDING_REFUSED") throw new ExtraPackWriterError("EXTRA_PACK_FORBIDDEN");
      if (["EXTRA_PACK_COMMAND_CONFLICT", "EXTRA_PACK_FORBIDDEN", "EXTRA_PACK_DIGEST_MISMATCH", "EXTRA_PACK_INVALID_COMMAND"].includes(message)) {
        throw new ExtraPackWriterError(message as ExtraPackWriterError["code"]);
      }
      throw error;
    }
  }
}
