import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";

const id = z.string().regex(/^synthetic-[a-z0-9-]{1,80}$/u);
const bindingSchema = z.object({
  version: z.literal(1), tenantId: id, jobId: id, objectId: id, objectVersionId: id,
  field: z.literal("evidence-metadata"),
}).strict();
export type EnvelopeBinding = z.infer<typeof bindingSchema>;
const routeSchema = z.object({
  version: z.literal(1), tenantId: id, jobId: id,
  destinationTenantId: id, destinationJobId: id,
  topology: z.literal("shared_rls").default("shared_rls"),
  channel: z.enum(["repository", "cache", "worker", "sync", "export", "restore"]),
}).strict();
export type SyntheticTenantRoute = z.infer<typeof routeSchema>;
const sealedSchema = z.object({
  iv: z.string().regex(/^[a-f0-9]{24}$/u),
  tag: z.string().regex(/^[a-f0-9]{32}$/u),
  bytes: z.string().max(32768).regex(/^(?:[a-f0-9]{2})*$/u),
}).strict();
type Sealed = z.infer<typeof sealedSchema>;
const wrappedSchema = z.object({ keyVersion: z.number().int().positive().max(1000000), sealed: sealedSchema }).strict();
export type WrappedDataKey = z.infer<typeof wrappedSchema>;
const envelopeSchema = z.object({
  version: z.literal(1), binding: bindingSchema, wrappedKey: wrappedSchema, ciphertext: sealedSchema,
}).strict();
export type TenantEnvelope = z.infer<typeof envelopeSchema>;
const metadataSchema = z.object({
  version: z.literal(1), classification: z.literal("synthetic-fixture"),
  label: z.enum(["practice-photo", "practice-document", "practice-note"]),
}).strict();
export type SyntheticEvidenceMetadata = z.infer<typeof metadataSchema>;

export class TenantEnvelopeError extends Error {
  readonly code = "TENANT_ENVELOPE_REFUSED";
  constructor() { super("Synthetic tenant encryption operation refused"); this.name = "TenantEnvelopeError"; }
}

/** Server-owned routing assertion, not authentication. Callers must already verify
 * membership/job authority; queued payloads and destination ids grant no access.
 * Only shared RLS is supported. This seam never chooses a connection or credential.
 */
export function assertSyntheticRoute(route: unknown, binding: EnvelopeBinding): SyntheticTenantRoute {
  const parsed = routeSchema.safeParse(route);
  if (!parsed.success) throw new TenantEnvelopeError();
  const r = parsed.data;
  if (r.tenantId !== binding.tenantId || r.jobId !== binding.jobId ||
      r.destinationTenantId !== r.tenantId || r.destinationJobId !== r.jobId) throw new TenantEnvelopeError();
  return r;
}

/** KMS must enforce tenant encryption context and version status on every call.
 * There is deliberately no plaintext-key cache or vendor adapter in this slice.
 */
export interface TenantKmsPort {
  wrap(tenantId: string, dataKey: Uint8Array, context: string): WrappedDataKey;
  unwrap(tenantId: string, wrapped: WrappedDataKey, context: string): Uint8Array;
}

function seal(key: Uint8Array, plaintext: Uint8Array, context: string): Sealed {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context));
  const bytes = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { iv: iv.toString("hex"), tag: cipher.getAuthTag().toString("hex"), bytes: bytes.toString("hex") };
}
function open(key: Uint8Array, sealed: Sealed, context: string): Buffer {
  const cipher = createDecipheriv("aes-256-gcm", key, Buffer.from(sealed.iv, "hex"));
  cipher.setAAD(Buffer.from(context));
  cipher.setAuthTag(Buffer.from(sealed.tag, "hex"));
  return Buffer.concat([cipher.update(Buffer.from(sealed.bytes, "hex")), cipher.final()]);
}

/** DARK: defaults disabled, production always refused. Not wired to any live
 * repository, upload, worker, export or restore path. Only fixed synthetic metadata
 * is accepted, so this harness cannot ingest arbitrary personal/free-text fields.
 */
export class SyntheticTenantEnvelopeStore {
  constructor(private readonly kms: TenantKmsPort, private readonly enabled = false) {}

  private run<T>(work: () => T): T {
    try {
      if (!this.enabled || process.env.NODE_ENV === "production") throw new TenantEnvelopeError();
      return work();
    } catch { throw new TenantEnvelopeError(); }
  }

  encrypt(route: unknown, binding: unknown, metadata: unknown): TenantEnvelope {
    return this.run(() => {
      const b = bindingSchema.parse(binding);
      assertSyntheticRoute(route, b);
      const value = metadataSchema.parse(metadata);
      const context = JSON.stringify(b);
      const key = randomBytes(32);
      try {
        return { version: 1, binding: b, wrappedKey: this.kms.wrap(b.tenantId, key, context),
          ciphertext: seal(key, Buffer.from(JSON.stringify(value)), context) };
      } finally { key.fill(0); }
    });
  }

  private read(route: unknown, expected: unknown, input: unknown) {
    const b = bindingSchema.parse(expected);
    assertSyntheticRoute(route, b);
    const envelope = envelopeSchema.parse(input);
    const context = JSON.stringify(b);
    if (JSON.stringify(envelope.binding) !== context) throw new TenantEnvelopeError();
    const key = this.kms.unwrap(b.tenantId, envelope.wrappedKey, context);
    try {
      const plaintext = open(key, envelope.ciphertext, context);
      try {
        const metadata = metadataSchema.parse(JSON.parse(plaintext.toString("utf8")));
        return { envelope, context, metadata };
      } finally { plaintext.fill(0); }
    } finally { key.fill(0); }
  }

  decrypt(route: unknown, expected: unknown, envelope: unknown): SyntheticEvidenceMetadata {
    return this.run(() => this.read(route, expected, envelope).metadata);
  }

  /** Copy-on-write: caller retains original until replacement is durably saved.
   * No in-place mutation, no key deletion/revocation, no false rollback claim.
   * Replays remain readable; there is no commercial command or business effect.
   */
  rewrap(route: unknown, expected: unknown, input: unknown): TenantEnvelope {
    return this.run(() => {
      const { envelope, context } = this.read(route, expected, input);
      const key = this.kms.unwrap(envelope.binding.tenantId, envelope.wrappedKey, context);
      try {
        return { ...envelope, wrappedKey: this.kms.wrap(envelope.binding.tenantId, key, context) };
      } finally { key.fill(0); }
    });
  }
}
