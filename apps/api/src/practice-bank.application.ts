import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AisError, AisRepositoryError, aisHash, type DarkAisRepository, type FakeTrueLayerAisAdapter, type AisPage, type SyntheticAisTokenVault } from "@jobguard/db";
import { resolveVerifiedTenantContext, type TenantRequestCredentials } from "./auth/principal-bridge.js";
import { identityStatus } from "./auth/identity-http.js";
import type { IdentityApplication } from "./auth/identity.application.js";

const commandV1 = z.discriminatedUnion("operation", [
  z.object({ version: z.literal("ais-practice-command.v1"), operation: z.literal("start") }).strict(),
  z.object({ version: z.literal("ais-practice-command.v1"), operation: z.enum(["approve-fake-consent", "pull", "revoke", "unlink"]), connectionId: z.guid() }).strict(),
]);
type Pending = { digest: string; state: string; code: string };
export type PracticeBankMemory = { pending: Map<string, Pending>; adapter: FakeTrueLayerAisAdapter; vault: SyntheticAisTokenVault; pages: ReadonlyMap<string, AisPage> };
type Repository = Pick<DarkAisRepository, "start" | "callback" | "stop" | "pull" | "movements">;
/** A company session owns consent. Browser input never contains a nonce or fake code. */
export class PracticeBankApplication {
  constructor(private readonly identity: IdentityApplication, private readonly repository: Repository, private readonly memory: PracticeBankMemory) {}
  async read(credentials: TenantRequestCredentials) {
    this.assertMode();
    const context = await resolveVerifiedTenantContext(this.identity.provider, credentials, this.identity.allowedOrigin);
    const digest = this.identity.provider.digest(`session:${credentials.sessionToken}`);
    const view = await this.repository.movements(context, digest);
    const credentialsUnavailable = view.connection?.status === "linked" && !await this.memory.vault.get(view.connection.connectionId);
    return { ...view, credentialsUnavailable };
  }
  async command(credentials: TenantRequestCredentials, raw: unknown) {
    this.assertMode();
    const context = await resolveVerifiedTenantContext(this.identity.provider, credentials, this.identity.allowedOrigin);
    const digest = this.identity.provider.digest(`session:${credentials.sessionToken}`);
    const parsed = commandV1.safeParse(raw);
    if (!parsed.success) throw new AisError("AIS_INVALID");
    const input = parsed.data;
    if (input.operation === "start") {
      const previous = await this.repository.movements(context, digest);
      if (previous.connection && ["linked", "awaiting_consent"].includes(previous.connection.status)) {
        await this.repository.stop(context, digest, previous.connection.connectionId, "unlinked");
        this.memory.pending.delete(previous.connection.connectionId);
      }
      const consent = await this.repository.start(context, digest, { version: "ais-start.v1", connectionId: randomUUID(), expiresAt: new Date(Date.now() + 3_600_000).toISOString() });
      const code = this.memory.adapter.register({ version: "ais-binding.v1", tenantId: context.tenantId,
        connectionId: consent.connectionId, stateHash: aisHash(consent.state) }, "fake_practice_account", this.memory.pages);
      this.memory.pending.set(consent.connectionId, { digest, state: consent.state, code });
    } else if (input.operation === "approve-fake-consent") {
      // Authenticate ownership in SQL before accessing process-held consent material.
      await this.repository.movements(context, digest, input.connectionId);
      const pending = this.memory.pending.get(input.connectionId);
      if (!pending || pending.digest !== digest) throw new AisError("AIS_CALLBACK_INVALID");
      this.memory.pending.delete(input.connectionId);
      await this.repository.callback(context, digest, input.connectionId, { version: "ais-callback.v1", state: pending.state, code: pending.code });
    } else if (input.operation === "pull") {
      await this.repository.pull(context, digest, input.connectionId, { version: "ais-window.v1", from: "2026-10-01", to: "2026-10-31", cursor: null });
    } else {
      await this.repository.stop(context, digest, input.connectionId, input.operation === "revoke" ? "revoked" : "unlinked");
      this.memory.pending.delete(input.connectionId);
    }
    return this.repository.movements(context, digest);
  }
  private assertMode() { if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new AisError("AIS_DARK_ONLY"); }
}
export function practiceBankFailure(error: unknown) {
  if (error instanceof AisError || error instanceof AisRepositoryError) {
    const code = error.code;
    const message = code === "AIS_INACTIVE" ? "Consent is inactive or expired. Connect again for fresh practice consent."
      : code === "AIS_TOKEN_REVOKED" ? "Practice credentials were lost or revoked. Connect again for fresh consent."
      : code === "AIS_CALLBACK_INVALID" ? "Practice consent is missing, changed or already used. Connect again."
      : code === "AIS_NOT_FOUND" ? "Practice connection not found."
      : code === "AIS_INVALID" ? "Invalid practice bank request." : "Practice bank unavailable.";
    return { status: code === "AIS_INVALID" ? 400 : code === "AIS_NOT_FOUND" ? 404 : code === "AIS_DARK_ONLY" || code === "AIS_FORBIDDEN" ? 403 : 409,
      body: { version: "ais-practice-error.v1", code, message } };
  }
  const auth = identityStatus(error);
  return { status: auth.status, body: { version: "ais-practice-error.v1", code: auth.code, message: "Practice bank unavailable. Sign in to your company and try again." } };
}
