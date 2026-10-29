import { createHmac, timingSafeEqual } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { parseConnectorEnvironment, type ConnectorEnvironment } from "@jobguard/config";

// Fictional transport profile only. No controller, socket, URL resolver or production switch.
export const SYNTHETIC_CONNECTOR_PROFILE = Object.freeze({ maxBytes: 16_384, skewSeconds: 300 });
const fixtureRef = z.string().max(120).regex(/^fixture:[a-z0-9_-]+$(?![\s\S])/u);
const base = {
  version: z.literal("connector-input.v1"),
  eventId: fixtureRef,
  subject: fixtureRef,
  revision: z.number().int().min(1).max(2_147_483_647),
};
export const connectorInputV1 = z.discriminatedUnion("kind", [
  z.object({ ...base, kind: z.literal("work_order"), document: fixtureRef }).strict(),
  z.object({ ...base, kind: z.literal("billing_status"), status: z.enum(["billed", "paid", "reversed"]) }).strict(),
]);
export type ConnectorInput = z.infer<typeof connectorInputV1>;
const receiptV1 = z.object({
  version: z.literal("connector-receipt.v1"), eventId: fixtureRef,
  state: z.literal("staged"), domainEffects: z.literal(0),
}).strict();
export type ConnectorReceipt = z.infer<typeof receiptV1>;
export class ConnectorInputError extends Error {
  readonly code = "CONNECTOR_INPUT_REFUSED";
  constructor() { super("Connector input refused"); this.name = "ConnectorInputError"; }
}

/** Secret bytes never appear in configuration, receipts, diagnostics or this module's logs.
 * Store resolves the CURRENT active key ring on every request; retiring a key takes effect
 * immediately, including duplicate requests. Production store/provisioning remains behind G5.
 */
export interface ConnectorSecretStore {
  read(ref: string): Promise<Readonly<{
    bindingId: string; databaseToken: string;
    signingKeys: Readonly<Record<string, Uint8Array>>;
  }>>;
}
export interface ConnectorIntake {
  stage(bindingId: string, databaseToken: string, input: ConnectorInput): Promise<ConnectorReceipt>;
}

/** Both webhook and API-push use the same authenticated raw-byte envelope. Channel is
 * signed, but excluded from source identity so a retry across channels cannot duplicate it.
 */
export class SyntheticConnectorInbound {
  private readonly config: ConnectorEnvironment;
  constructor(config: unknown, private readonly secrets: ConnectorSecretStore, private readonly intake: ConnectorIntake,
    private readonly now: () => number = Date.now) {
    this.config = parseConnectorEnvironment(config);
  }

  async receive(channel: "webhook" | "api_push", headers: unknown, bytes: Uint8Array): Promise<ConnectorReceipt> {
    try {
      if (channel !== "webhook" && channel !== "api_push") throw new ConnectorInputError();
      if (!(bytes instanceof Uint8Array) || bytes.byteLength > SYNTHETIC_CONNECTOR_PROFILE.maxBytes) throw new ConnectorInputError();
      // Copy before awaiting secret storage so a mutable caller cannot swap signed bytes.
      const body = Buffer.from(bytes);
      const h = z.object({ version: z.literal("connector-signature.v1"),
        keyId: z.string().max(80).regex(/^[a-z0-9_-]+$(?![\s\S])/u),
        timestamp: z.string().regex(/^[0-9]{10}$(?![\s\S])/u),
        signature: z.string().regex(/^[a-f0-9]{64}$(?![\s\S])/u),
      }).strict().parse(headers);
      const seconds = Math.floor(this.now() / 1000);
      if (!Number.isSafeInteger(seconds) || Math.abs(seconds - Number(h.timestamp)) > SYNTHETIC_CONNECTOR_PROFILE.skewSeconds) throw new ConnectorInputError();
      const stored = await this.secrets.read(this.config.CONNECTOR_CREDENTIAL_REF);
      z.guid().parse(stored.bindingId);
      if (Math.abs(Math.floor(this.now() / 1000) - Number(h.timestamp)) > SYNTHETIC_CONNECTOR_PROFILE.skewSeconds) throw new ConnectorInputError();
      const key = Object.hasOwn(stored.signingKeys, h.keyId) ? stored.signingKeys[h.keyId] : undefined;
      if (!key || key.byteLength < 32) throw new ConnectorInputError();
      const expected = createHmac("sha256", key)
        .update(`connector-signature.v1\n${channel}\n${h.keyId}\n${stored.bindingId}\n${h.timestamp}\n`).update(body).digest();
      if (!timingSafeEqual(expected, Buffer.from(h.signature, "hex"))) throw new ConnectorInputError();
      const input = connectorInputV1.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)));
      return receiptV1.parse(await this.intake.stage(stored.bindingId, stored.databaseToken, input));
    } catch {
      // Never propagate provider/store/driver/Zod errors containing credentials or bodies.
      throw new ConnectorInputError();
    }
  }
}

/** Dedicated connection authenticated only as jobguard_connector, never business runtime.
 * The database derives tenant/namespace from the secret-bound, expiring fixture binding.
 * One statement commits source identity, immutable receipt and audit atomically. Retrying
 * after a lost acknowledgement returns that receipt; it never repeats a business effect.
 */
export class PostgresConnectorIntake implements ConnectorIntake {
  constructor(private readonly pool: Pick<Pool, "query">) {}
  async stage(bindingId: string, databaseToken: string, input: ConnectorInput): Promise<ConnectorReceipt> {
    try {
      const result = await this.pool.query<{ receipt: unknown }>(
        "SELECT connector.intake($1::uuid,$2::text,$3::jsonb) AS receipt",
        [bindingId, databaseToken, JSON.stringify(connectorInputV1.parse(input))],
      );
      return receiptV1.parse(result.rows[0]?.receipt);
    } catch { throw new ConnectorInputError(); }
  }
}
