import { createCipheriv, createDecipheriv, createHash } from "node:crypto";
import { TenantEnvelopeError, type TenantKmsPort, type WrappedDataKey } from "./tenant-envelope.js";

/** Synthetic in-memory KMS only. Stable fixture master keys, no credentials or
 * endpoints. Never use this derivation or this adapter for real data.
 * Retired versions can unwrap; revoked/denied versions cannot. Rotation retains
 * old material until an explicit revoke, making rollback/forward-fix possible.
 */
export class InMemoryTenantKms implements TenantKmsPort {
  readonly #versions = new Map<string, number>();
  readonly #revoked = new Set<string>();
  readonly #denied = new Set<string>();

  rotate(tenantId: string): number {
    const next = (this.#versions.get(tenantId) ?? 0) + 1;
    this.#versions.set(tenantId, next);
    return next;
  }
  deny(tenantId: string, denied = true): void {
    if (denied) this.#denied.add(tenantId); else this.#denied.delete(tenantId);
  }
  revoke(tenantId: string, version: number): void { this.#revoked.add(JSON.stringify([tenantId, version])); }

  private key(tenantId: string, version: number): Buffer {
    if (process.env.NODE_ENV === "production" || !/^synthetic-[a-z0-9-]{1,80}$/u.test(tenantId) ||
        !Number.isSafeInteger(version) || version < 1 || version > (this.#versions.get(tenantId) ?? 0) ||
        this.#denied.has(tenantId) || this.#revoked.has(JSON.stringify([tenantId, version]))) throw new TenantEnvelopeError();
    return createHash("sha256").update(JSON.stringify(["SYNTHETIC-ONLY", tenantId, version])).digest();
  }

  wrap(tenantId: string, dataKey: Uint8Array, context: string): WrappedDataKey {
    const keyVersion = this.#versions.get(tenantId) ?? 0;
    const key = this.key(tenantId, keyVersion);
    try {
      // Deterministic fake wrapping; data keys are fresh random bytes in the harness.
      const iv = createHash("sha256").update(dataKey).update(context).digest().subarray(0, 12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      cipher.setAAD(Buffer.from(JSON.stringify([tenantId, keyVersion, context])));
      const bytes = Buffer.concat([cipher.update(dataKey), cipher.final()]);
      return { keyVersion, sealed: { iv: iv.toString("hex"), tag: cipher.getAuthTag().toString("hex"), bytes: bytes.toString("hex") } };
    } finally { key.fill(0); }
  }

  unwrap(tenantId: string, wrapped: WrappedDataKey, context: string): Uint8Array {
    const key = this.key(tenantId, wrapped.keyVersion);
    try {
      const cipher = createDecipheriv("aes-256-gcm", key, Buffer.from(wrapped.sealed.iv, "hex"));
      cipher.setAAD(Buffer.from(JSON.stringify([tenantId, wrapped.keyVersion, context])));
      cipher.setAuthTag(Buffer.from(wrapped.sealed.tag, "hex"));
      return Buffer.concat([cipher.update(Buffer.from(wrapped.sealed.bytes, "hex")), cipher.final()]);
    } catch { throw new TenantEnvelopeError(); }
    finally { key.fill(0); }
  }
}
