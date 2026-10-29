import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, link, readFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { VerifiedTenantContext } from "@jobguard/db";
import type { EmailForwardingPorts } from "./email-forwarding.connector.js";

const id = z.guid();
const hash = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
const configV1 = z.object({ version: z.literal("email-forwarding-config.v1"), environment: z.literal("synthetic_demo"), transport: z.literal("fixture"), enabled: z.literal(true) }).strict();
const intakeV1 = z.object({ version: z.literal("email-delivery.v1"), messageId: id, alias: z.string().regex(/^fixture-[a-z0-9-]{1,80}$/u), bytes: z.instanceof(Uint8Array) }).strict();
const bindingV1 = z.object({ tenantId: id, jobId: id }).strict();
const parsedV1 = z.object({ version: z.literal("email-mime.v1"), text: z.literal("Please fit an outside tap."),
  parts: z.array(z.object({ bytes: z.instanceof(Uint8Array), contentType: z.string().max(200), filename: z.string().max(300), encrypted: z.boolean(), readable: z.boolean() }).strict()).max(100) }).strict();
const reasons = ["unknown_alias", "oversized", "encrypted", "executable", "unreadable"] as const;
const receiptV1 = z.object({ version: z.literal("email-receipt.v1"), deliveryId: id, aliasHash: z.string().regex(/^[a-f0-9]{64}$/u),
  binding: bindingV1.nullable(), rawBase64: z.string(), rawSha256: z.string().regex(/^[a-f0-9]{64}$/u), byteLength: z.number().int().nonnegative(),
  objectVersionId: z.string().min(1), serverReceivedAt: z.iso.datetime(),
  quarantine: z.array(z.enum(reasons)), text: z.literal("Please fit an outside tap.").nullable(),
}).strict();
type Receipt = z.infer<typeof receiptV1>;
export class EmailDeliveryError extends Error {
  constructor(readonly code: "EMAIL_DELIVERY_DISABLED" | "INVALID_EMAIL_DELIVERY" | "EMAIL_DELIVERY_UNAVAILABLE" | "EMAIL_DELIVERY_CONFLICT") { super(code); }
}
export interface EmailDeliveryPorts {
  /** Trusted server alias registry. Unknown, retired or ambiguous aliases return null. */
  resolveAlias(alias: string): Promise<unknown>;
  authorizeJob(context: VerifiedTenantContext, jobId: string): Promise<boolean>;
  /** No MIME library is installed. Only an in-memory synthetic parser may implement this seam. */
  parseMime(bytes: Uint8Array): Promise<unknown>;
}

/** Private local synthetic object store; no production composition or ingress route.
 * Complete, fsynced receipts are atomically linked with exclusive creation. The winner
 * owns identity/time/version forever; retries cannot overwrite bytes or routing.
 * Filesystem owners remain trusted, as with other local synthetic infrastructure.
 */
export class EmailDeliveryStore implements EmailForwardingPorts {
  private readonly enabled: boolean;
  constructor(private readonly directory: string, private readonly ports: EmailDeliveryPorts, configuration?: unknown,
    private readonly now: () => string = () => new Date().toISOString()) {
    this.enabled = configV1.safeParse(configuration).success;
  }
  private assertEnabled(): void { if (!this.enabled) throw new EmailDeliveryError("EMAIL_DELIVERY_DISABLED"); }
  private async publish(name: string, value: unknown): Promise<boolean> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temporary = join(this.directory, `.pending-${randomUUID()}`);
    const file = await open(temporary, "wx", 0o600);
    try {
      await file.writeFile(JSON.stringify(value)); await file.sync(); await file.close();
      try { await link(temporary, join(this.directory, name)); }
      catch (error) { if ((error as NodeJS.ErrnoException).code === "EEXIST") return false; throw error; }
      const directory = await open(this.directory, "r");
      try { await directory.sync(); } finally { await directory.close(); }
      return true;
    } finally { await file.close(); await unlink(temporary); }
  }
  private async receipt(deliveryId: string): Promise<Receipt | null> {
    let bytes: string;
    try { bytes = await readFile(join(this.directory, `${deliveryId}.json`), "utf8"); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
    const receipt = receiptV1.parse(JSON.parse(bytes));
    const raw = Buffer.from(receipt.rawBase64, "base64");
    if (receipt.deliveryId !== deliveryId || raw.length !== receipt.byteLength || hash(raw) !== receipt.rawSha256 ||
      receipt.objectVersionId !== `sha256:${receipt.rawSha256}`) throw new Error("Invalid stored receipt");
    return receipt;
  }
  private async replay(existing: Receipt, rawSha256: string, aliasHash: string): Promise<Receipt> {
    if (existing.rawSha256 === rawSha256 && existing.aliasHash === aliasHash) return existing;
    // Flag contains hashes/identifiers only, never addresses, bytes or parser errors.
    await this.publish(`${existing.deliveryId}.conflict-${rawSha256}-${aliasHash}.json`, {
      version: "email-replay-conflict.v1", deliveryId: existing.deliveryId, rawSha256, aliasHash,
    });
    throw new EmailDeliveryError("EMAIL_DELIVERY_CONFLICT");
  }
  async receive(raw: unknown): Promise<Readonly<Receipt>> {
    this.assertEnabled();
    const parsed = intakeV1.safeParse(raw);
    if (!parsed.success) throw new EmailDeliveryError("INVALID_EMAIL_DELIVERY");
    // Snapshot before awaiting: mutable caller buffers must not change the stored original.
    const bytes = Buffer.from(parsed.data.bytes), input = parsed.data;
    const rawSha256 = hash(bytes), aliasHash = hash(input.alias);
    try {
      const existing = await this.receipt(input.messageId);
      if (existing) return structuredClone(await this.replay(existing, rawSha256, aliasHash));
      const binding = bindingV1.safeParse(await this.ports.resolveAlias(input.alias));
      const quarantine: Receipt["quarantine"] = [];
      let text: Receipt["text"] = null;
      if (!binding.success) quarantine.push("unknown_alias");
      if (bytes.length > 1_000_000) quarantine.push("oversized");
      if (!quarantine.length) {
        try {
          const mime = parsedV1.parse(await this.ports.parseMime(Buffer.from(bytes)));
          for (const part of mime.parts) {
            if (part.bytes.length > 100_000) quarantine.push("oversized");
            if (part.encrypted || /encrypted|pkcs7|zip|pdf/iu.test(part.contentType)) quarantine.push("encrypted");
            if (/\.(exe|com|bat|cmd|ps1|js|sh|scr|msi)$/iu.test(part.filename) ||
              /executable|javascript|shellscript/iu.test(part.contentType) ||
              Buffer.from(part.bytes).subarray(0, 2).toString() === "MZ") quarantine.push("executable");
            // No attachment validation/AV adapter installed: ALL attachments remain held.
            quarantine.push("unreadable");
          }
          if (!quarantine.length) text = mime.text;
        } catch { quarantine.push("unreadable"); }
      }
      const receipt = receiptV1.parse({ version: "email-receipt.v1", deliveryId: input.messageId, aliasHash,
        binding: binding.success ? binding.data : null, rawBase64: bytes.toString("base64"), rawSha256, byteLength: bytes.length,
        objectVersionId: `sha256:${rawSha256}`, serverReceivedAt: this.now(), quarantine: [...new Set(quarantine)], text });
      if (!await this.publish(`${input.messageId}.json`, receipt)) {
        const winner = await this.receipt(input.messageId); if (!winner) throw new Error();
        return structuredClone(await this.replay(winner, rawSha256, aliasHash));
      }
      return structuredClone(receipt);
    } catch (error) {
      if (error instanceof EmailDeliveryError) throw error;
      throw new EmailDeliveryError("EMAIL_DELIVERY_UNAVAILABLE");
    }
  }
  async authorizeJob(context: VerifiedTenantContext, jobId: string): Promise<boolean> {
    this.assertEnabled();
    return this.ports.authorizeJob(context, jobId);
  }
  /** Worker-facing source port only. Intake has no observation or shadow sink capability. */
  async readOriginal(context: VerifiedTenantContext, jobId: string, deliveryId: string): Promise<unknown> {
    this.assertEnabled();
    if (!id.safeParse(jobId).success || !id.safeParse(deliveryId).success) return null;
    try {
      if (!await this.ports.authorizeJob(context, jobId)) return null;
      const r = await this.receipt(deliveryId);
      if (!r || r.quarantine.length || !r.text || r.binding?.tenantId !== context.tenantId || r.binding.jobId !== jobId) return null;
      return { version: "email-forwarding-original.v1", tenantId: r.binding.tenantId, jobId, deliveryId,
        source: "email_forwarding", state: "verified", invalidated: false, text: r.text,
        evidence: { id: deliveryId, objectVersionId: `${r.objectVersionId}:text`, sha256: hash(r.text), serverReceivedAt: r.serverReceivedAt } };
    } catch { throw new EmailDeliveryError("EMAIL_DELIVERY_UNAVAILABLE"); }
  }
}
