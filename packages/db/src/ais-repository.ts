import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
import { aisBindingV1, aisGrantV1, aisHash, aisPageV1, aisParse, aisWindowV1, AisError, type AisAdapter, type AisGrant, type AisTokenVault } from "./ais-adapter.js";

const resultV1 = z.object({ connectionId: z.guid(), stateHash: z.string().regex(/^[a-f0-9]{64}$/u), accountRef: z.string().nullable(),
  status: z.enum(["awaiting_consent", "linked", "revoked", "unlinked", "token_revoked", "expired"]), changed: z.boolean(), actor: z.guid() }).strict();
const callbackV1 = z.object({ version: z.literal("ais-callback.v1"), state: z.guid(), code: z.string().min(1).max(200) }).strict();
const digestV1 = z.string().regex(/^[a-f0-9]{64}$/u);
const idV1 = z.guid();
type Result = z.infer<typeof resultV1>;
type Stop = "revoked" | "unlinked" | "token_revoked";
export class AisRepositoryError extends Error {
  constructor(readonly code: string) { super(code); this.name = "AisRepositoryError"; }
}

/** Internal dark seam; not wired to HTTP, sync, exports, a scheduler or recovery posting.
 * Every call authenticates the existing synthetic owner/admin session in SQL. Adapter
 * calls happen outside transactions; SQL rechecks consent/ownership after each call.
 */
export class DarkAisRepository {
  constructor(private readonly pool: Pool, private readonly adapter: AisAdapter, private readonly vault: AisTokenVault,
    private readonly environment: string = process.env.JOBGUARD_ENV ?? "unconfigured") {}

  private async command(ctx: VerifiedTenantContext, digest: string, id: string, op: string, value: unknown): Promise<Result> {
    if (this.environment !== "synthetic_demo" || this.adapter.environment !== "synthetic_demo") throw new AisError("AIS_DARK_ONLY");
    aisParse(digestV1, digest); aisParse(idV1, id);
    try {
      return await withTenant(this.pool, ctx, async db => {
        const response = await db.$client.query<{ result: unknown }>("SELECT app.dark_ais($1,$2,$3,$4,$5::jsonb) AS result", [ctx.tenantId, digest, id, op, JSON.stringify(value)]);
        return aisParse(resultV1, response.rows[0]?.result);
      });
    } catch (error) {
      // Never return SQL values, session material, bank data or provider exceptions.
      const message = error instanceof Error ? error.message : "";
      const code = /^(AIS_[A-Z_]+)$/u.exec(message)?.[1];
      throw new AisRepositoryError(code ?? "AIS_FORBIDDEN");
    }
  }

  async start(ctx: VerifiedTenantContext, digest: string, raw: unknown) {
    const input = aisParse(z.object({ version: z.literal("ais-start.v1"), connectionId: idV1, expiresAt: z.iso.datetime() }).strict(), raw);
    const state = randomUUID();
    await this.command(ctx, digest, input.connectionId, "start", { stateHash: aisHash(state), expiresAt: input.expiresAt });
    // No provider URL exists. A synthetic harness explicitly supplies this nonce to its fake consent fixture.
    return { version: "ais-consent.v1" as const, connectionId: input.connectionId, state, environment: "synthetic_demo" as const };
  }

  async callback(ctx: VerifiedTenantContext, digest: string, connectionId: string, raw: unknown) {
    const input = aisParse(callbackV1, raw), current = await this.command(ctx, digest, connectionId, "inspect", {});
    if (current.status !== "awaiting_consent" || current.stateHash !== aisHash(input.state)) throw new AisError("AIS_CALLBACK_INVALID");
    const binding = aisParse(aisBindingV1, { version: "ais-binding.v1", tenantId: ctx.tenantId, connectionId, stateHash: current.stateHash });
    let grant: AisGrant;
    try { grant = aisParse(aisGrantV1, await this.adapter.exchange(binding, input.code)); } catch { throw new AisError("AIS_CALLBACK_INVALID"); }
    const linked = await this.command(ctx, digest, connectionId, "link", { stateHash: current.stateHash, accountRef: grant.accountRef });
    // Only the callback that consumed consent may write the vault. Recheck after
    // that write so an unlink during exchange/storage cannot leave a usable token.
    // A crash between link and vault storage leaves no credential: pull records
    // token_revoked, requiring fresh consent rather than silently reusing a code.
    try {
      await this.vault.put(connectionId, grant.token);
      if ((await this.command(ctx, digest, connectionId, "inspect", {})).status !== "linked") throw new AisRepositoryError("AIS_INACTIVE");
    } catch {
      await this.vault.revoke(connectionId);
      throw new AisError("AIS_TOKEN_REVOKED");
    }
    return this.publicState(linked);
  }

  async stop(ctx: VerifiedTenantContext, digest: string, connectionId: string, kind: Stop) {
    aisParse(z.enum(["revoked", "unlinked", "token_revoked"]), kind);
    // Durable stop precedes vault revocation. If vault removal fails, retry stop;
    // already-stopped consent can never pull or ingest, even with a cached token.
    const state = await this.command(ctx, digest, connectionId, kind, {});
    await this.vault.revoke(connectionId);
    return this.publicState(state);
  }

  async pull(ctx: VerifiedTenantContext, digest: string, connectionId: string, raw: unknown) {
    const window = aisParse(aisWindowV1, raw);
    if ((Date.parse(window.to) - Date.parse(window.from)) / 86_400_000 > 366) throw new AisError("AIS_INVALID");
    const current = await this.command(ctx, digest, connectionId, "inspect", {});
    if (current.status !== "linked" || !current.accountRef) throw new AisRepositoryError("AIS_INACTIVE");
    const token = await this.vault.get(connectionId);
    if (!token) { await this.stop(ctx, digest, connectionId, "token_revoked"); throw new AisError("AIS_TOKEN_REVOKED"); }
    let page;
    try { page = aisParse(aisPageV1, await this.adapter.pull(token, current.accountRef, window)); }
    catch (error) {
      if (error instanceof AisError && error.code === "AIS_TOKEN_REVOKED") {
        await this.stop(ctx, digest, connectionId, "token_revoked"); throw error;
      }
      throw new AisError("AIS_PROVIDER_FAILED");
    }
    if (page.observations.some(o => o.accountRef !== current.accountRef || o.bookedOn < window.from || o.bookedOn > window.to)) throw new AisError("AIS_PROVIDER_FAILED");
    const result = await this.command(ctx, digest, connectionId, "page", { window, page });
    // Only progress, never observations, tokens, case status or fee authority.
    return { version: "ais-pull.v1" as const, changed: result.changed, nextCursor: page.nextCursor };
  }

  async read(ctx: VerifiedTenantContext, digest: string, connectionId: string) {
    return this.publicState(await this.command(ctx, digest, connectionId, "inspect", {}));
  }
  private publicState(result: Result) { return { version: "ais-status.v1" as const, connectionId: result.connectionId, status: result.status }; }
}
