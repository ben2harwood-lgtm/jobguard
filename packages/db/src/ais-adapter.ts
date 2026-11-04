import { createHash } from "node:crypto";
import { z } from "zod";
import { MAX_MONEY_PENCE } from "@jobguard/core";

const ref = z.string().regex(/^fake_[a-zA-Z0-9_-]{1,100}$/u);
export const aisBindingV1 = z.object({ version: z.literal("ais-binding.v1"), tenantId: z.guid(), connectionId: z.guid(), stateHash: z.string().regex(/^[a-f0-9]{64}$/u) }).strict();
export type AisBinding = z.infer<typeof aisBindingV1>;
export const aisGrantV1 = z.object({ version: z.literal("ais-grant.v1"), environment: z.literal("synthetic_demo"), accountRef: ref,
  token: z.string().regex(/^fake_token_[a-f0-9]{64}$/u) }).strict();
export type AisGrant = z.infer<typeof aisGrantV1>;
export const aisObservationV1 = z.object({
  version: z.literal("ais-observation.v1"), accountRef: ref, movementRef: ref, providerRef: ref,
  revision: z.number().int().positive().max(1_000_000), status: z.enum(["pending", "settled", "reversed"]),
  amount: z.object({ pence: z.number().int().safe().min(-MAX_MONEY_PENCE).max(MAX_MONEY_PENCE), currency: z.literal("GBP") }).strict(),
  bookedOn: z.iso.date(),
}).strict();
export type AisObservation = z.infer<typeof aisObservationV1>;
export const aisPageV1 = z.object({ version: z.literal("ais-page.v1"), observations: z.array(aisObservationV1).max(100), nextCursor: ref.nullable() }).strict();
export type AisPage = z.infer<typeof aisPageV1>;
export const aisWindowV1 = z.object({ version: z.literal("ais-window.v1"), from: z.iso.date(), to: z.iso.date(), cursor: ref.nullable() }).strict()
  .refine(v => v.from <= v.to, "Invalid window");
export type AisWindow = z.infer<typeof aisWindowV1>;
export class AisError extends Error {
  constructor(readonly code: "AIS_DARK_ONLY" | "AIS_INVALID" | "AIS_CALLBACK_INVALID" | "AIS_TOKEN_REVOKED" | "AIS_PROVIDER_FAILED") { super(code); this.name = "AisError"; }
}
export function aisParse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new AisError("AIS_INVALID");
  return result.data;
}
export const aisHash = (value: string) => createHash("sha256").update(value).digest("hex");

/** Server adapter seam. No implementation here can make a network request. */
export interface AisAdapter {
  readonly environment: "synthetic_demo";
  exchange(binding: AisBinding, code: string): Promise<AisGrant>;
  pull(token: string, accountRef: string, window: AisWindow): Promise<AisPage>;
}
/** Tokens never enter SQL, audit, responses, exports, or sync. A real vault is a separate release prerequisite. */
export interface AisTokenVault {
  put(connectionId: string, token: string): Promise<void>;
  get(connectionId: string): Promise<string | undefined>;
  revoke(connectionId: string): Promise<void>;
}
export class SyntheticAisTokenVault implements AisTokenVault {
  #tokens = new Map<string, string>();
  async put(id: string, token: string) { this.#tokens.set(id, token); }
  async get(id: string) { return this.#tokens.get(id); }
  async revoke(id: string) { this.#tokens.delete(id); }
}
/** TrueLayer-shaped deterministic fixtures, deliberately not a vendor SDK or live capability.
 * Stable movementRef is fixture lineage, not an assumption about real provider IDs.
 * A future real adapter must quarantine observations when lineage cannot be proven.
 */
export class FakeTrueLayerAisAdapter implements AisAdapter {
  readonly environment = "synthetic_demo" as const;
  #codes = new Map<string, { binding: AisBinding; accountRef: string; token: string }>();
  #grants = new Map<string, { accountRef: string; pages: ReadonlyMap<string, AisPage> }>();
  register(raw: AisBinding, accountRef: string, pages: ReadonlyMap<string, AisPage>): string {
    const binding = aisParse(aisBindingV1, raw);
    aisParse(ref, accountRef);
    const code = `fake_${aisHash(JSON.stringify(binding))}`;
    const token = `fake_token_${aisHash(code)}`;
    this.#codes.set(code, { binding, accountRef, token });
    this.#grants.set(token, { accountRef, pages: new Map([...pages].map(([key, page]) => [key, aisParse(aisPageV1, page)])) });
    return code;
  }
  async exchange(binding: AisBinding, code: string) {
    const grant = this.#codes.get(code);
    if (!grant || JSON.stringify(grant.binding) !== JSON.stringify(aisParse(aisBindingV1, binding))) throw new AisError("AIS_CALLBACK_INVALID");
    return aisParse(aisGrantV1, { version: "ais-grant.v1", environment: "synthetic_demo", accountRef: grant.accountRef, token: grant.token });
  }
  async pull(token: string, accountRef: string, raw: AisWindow): Promise<AisPage> {
    const window = aisParse(aisWindowV1, raw), grant = this.#grants.get(token);
    if (!grant || grant.accountRef !== accountRef) throw new AisError("AIS_TOKEN_REVOKED");
    const page = grant.pages.get(window.cursor ?? "first");
    if (!page) throw new AisError("AIS_PROVIDER_FAILED");
    const parsed = aisParse(aisPageV1, page);
    if (parsed.observations.some(o => o.accountRef !== accountRef || o.bookedOn < window.from || o.bookedOn > window.to)) throw new AisError("AIS_PROVIDER_FAILED");
    return parsed;
  }
  revokeToken(token: string) { this.#grants.delete(token); }
}
