import { z } from "zod";
import type { RateSuggestionRepository } from "@jobguard/db";
import type { IdentityApplication } from "./auth/identity.application.js";
import { resolveVerifiedTenantContext } from "./auth/principal-bridge.js";

const job = z.guid();
/** Session selects the sole current company membership. No caller tenant selector. */
export class RateSuggestionApplication {
  constructor(private readonly identity: IdentityApplication,
    private readonly repository: Pick<RateSuggestionRepository, "read" | "readAcceptances" | "accept">) {}
  private async credentials(token: string | undefined) {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new Error("SYNTHETIC_ONLY");
    const session = await this.identity.session(token);
    if (session.memberships.length !== 1 || session.memberships[0]!.role !== "owner") throw new Error("FORBIDDEN");
    return {
      sessionToken: token, requestedTenantId: session.memberships[0]!.tenantId,
      origin: this.identity.allowedOrigin, csrfToken: session.csrfToken,
    };
  }
  private actor(token: string | undefined) {
    return { kind: "human", sessionDigest: this.identity.provider.digest(`session:${token}`) };
  }
  async read(token: string | undefined, rawJob: unknown, query?: unknown) {
    const jobId = job.parse(rawJob);
    const credentials = await this.credentials(token);
    const context = await resolveVerifiedTenantContext(this.identity.provider, credentials, this.identity.allowedOrigin);
    // Checked history read authorizes the job before any tenant-private baseline is read.
    const acceptances = await this.repository.readAcceptances(context, this.actor(token), jobId);
    const stored = query === undefined ? null : await this.repository.read(context, query);
    const suggestion = stored && (() => {
      const { tenantId: _tenant, query: storedQuery, ...result } = stored;
      const { tenantId: _queryTenant, ...query } = storedQuery;
      return { ...result, query };
    })();
    return { version: "rate-screen.v1" as const, environment: "synthetic_demo" as const, jobId, asOf: new Date().toISOString(), acceptances, suggestion };
  }
  async accept(token: string | undefined, rawJob: unknown, raw: unknown) {
    const jobId = job.parse(rawJob);
    const credentials = await this.credentials(token);
    const context = await resolveVerifiedTenantContext(this.identity.provider, credentials, this.identity.allowedOrigin);
    await this.repository.readAcceptances(context, this.actor(token), jobId);
    // The URL binds the job; reject rather than overwrite caller-supplied identity.
    if (!raw || typeof raw !== "object" || !("jobId" in raw) || raw.jobId !== jobId) throw new Error("INVALID_ACCEPTANCE");
    return this.repository.accept(context, this.actor(token), raw);
  }
}
export type RateSuggestionScreen = Awaited<ReturnType<RateSuggestionApplication["read"]>>;
