import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { Pool } from "pg";
import { connectorInputV1, ConnectorInputError, type ConnectorInput } from "./inbound.js";

const fixture = z.string().regex(/^fixture:[a-z0-9_-]{1,112}$(?![\s\S])/u);
const capability = z.enum(["work_order", "billing_status", "materials_issue"]);
export const machineAuthorityV1 = z.object({
  tenantId: z.guid(), environment: z.literal("synthetic_demo"), clientContract: fixture,
  machineActor: z.guid(), capabilityVersion: z.number().int().positive(),
  capabilities: z.array(capability).min(1), keyRefs: z.array(fixture),
}).strict();
export type MachineAuthority = z.infer<typeof machineAuthorityV1>;
export const machineRequestV1 = z.object({
  version: z.literal("connector-machine-signature.v1"), connectionId: z.guid(),
  tenantId: z.guid(), environment: z.literal("synthetic_demo"), clientContract: fixture,
  keyRef: fixture, timestamp: z.string().regex(/^[0-9]{10}$(?![\s\S])/u),
  nonce: z.string().regex(/^[a-zA-Z0-9_-]{16,120}$(?![\s\S])/u), signature: z.string().regex(/^[a-f0-9]{64}$(?![\s\S])/u),
}).strict();
export type MachineRequest = z.infer<typeof machineRequestV1>;
export const MACHINE_PATH = "/connectors/machine/intake";
export const MACHINE_MAX_BYTES = 1_048_576;
/** All authority selectors are signed as well as method, exact path, timestamp, nonce and
 * raw body hash. No query-string aliases, cookie, tenant context or member session. */
export function machineSigningBytes(h: Omit<MachineRequest, "signature">, body: Uint8Array): string {
  return [h.version, "POST", MACHINE_PATH, h.connectionId, h.tenantId, h.environment,
    h.clientContract, h.keyRef, h.timestamp, h.nonce, createHash("sha256").update(body).digest("hex")].join("\n");
}
export interface MachineStore {
  authority(connectionId: string, token: string): Promise<MachineAuthority>;
  stage(connectionId: string, token: string, authority: MachineAuthority, request: MachineRequest, input: ConnectorInput): Promise<unknown>;
}
export interface FictionalMachineSecrets {
  token(connectionId: string): Promise<string>;
  key(fixtureLabel: string): Promise<Uint8Array>;
}
/** Dark application: no environment switch can register this service or controller.
 * Production secret resolution, endpoint and real credentials remain unavailable. */
export class FictionalMachineConnection {
  constructor(private readonly store: MachineStore, private readonly secrets: FictionalMachineSecrets,
    private readonly now: () => number = Date.now) {}
  async receive(method: string, path: string, rawHeaders: unknown, rawBody: Uint8Array) {
    try {
      if (method !== "POST" || path !== MACHINE_PATH || !(rawBody instanceof Uint8Array) || rawBody.byteLength > MACHINE_MAX_BYTES)
        throw new ConnectorInputError();
      const body = Buffer.from(rawBody), h = machineRequestV1.parse(rawHeaders);
      const fresh = () => Number.isSafeInteger(this.now()) && Math.abs(Math.floor(this.now() / 1000) - Number(h.timestamp)) <= 300;
      if (!fresh()) throw new ConnectorInputError();
      const token = await this.secrets.token(h.connectionId);
      const authority = machineAuthorityV1.parse(await this.store.authority(h.connectionId, token));
      if (authority.tenantId !== h.tenantId || authority.environment !== h.environment || authority.clientContract !== h.clientContract || !authority.keyRefs.includes(h.keyRef))
        throw new ConnectorInputError();
      const key = await this.secrets.key(h.keyRef);
      if (key.byteLength < 32) throw new ConnectorInputError();
      const signature = createHmac("sha256", key).update(machineSigningBytes(h, body)).digest();
      if (!timingSafeEqual(signature, Buffer.from(h.signature, "hex")) || !fresh()) throw new ConnectorInputError();
      const input = connectorInputV1.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)));
      if (input.kind === "export_delivery" || !authority.capabilities.includes(input.kind)) throw new ConnectorInputError();
      return await this.store.stage(h.connectionId, token, authority, h, input);
    } catch { throw new ConnectorInputError(); }
  }
}
export class PostgresMachineStore implements MachineStore {
  constructor(private readonly pool: Pick<Pool, "query">) {}
  async authority(c: string, token: string) {
    const result = await this.pool.query<{ value: unknown }>("SELECT connector.machine_authority($1,$2) value", [c, token]);
    return machineAuthorityV1.parse(result.rows[0]?.value);
  }
  async stage(c: string, token: string, authority: MachineAuthority, h: MachineRequest, input: ConnectorInput) {
    const result = await this.pool.query<{ value: unknown }>("SELECT connector.machine_stage($1,$2,$3::jsonb,$4,$5,$6::bigint,$7::jsonb) value",
      [c, token, JSON.stringify(authority), h.keyRef, h.nonce, h.timestamp, JSON.stringify(input)]);
    return result.rows[0]?.value;
  }
}
