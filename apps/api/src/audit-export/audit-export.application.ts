import type { Pool } from "pg";
import { ZodError } from "zod";
import { AuditExportError, AuditExportRepository, ContractorRepository, AUDIT_EXPORT_NOTICE, AUDIT_EXPORT_SANDBOX } from "@jobguard/db";
import { resolveVerifiedTenantContext } from "../auth/principal-bridge.js";
import { AuthError, type AuthProvider } from "../auth/auth-provider.js";
import { auditExportFailureV1, auditExportRequestV1, auditExportSessionV1 } from "./audit-export.contracts.js";

export function assertAuditExportMode(): void {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new AuditExportError("AUDIT_EXPORT_MODE_HELD");
}

/** Uses the existing authenticated bridge rather than minting a new synthetic context. No tenant input is accepted. */
export class AuditExportApplication {
  private readonly repository: AuditExportRepository;
  constructor(private readonly pool: Pool) { this.repository = new AuditExportRepository(pool); }
  private mode() { assertAuditExportMode(); }
  private async member(sessionId: string | undefined, action: "create" | "list") {
    this.mode();
    const session = auditExportSessionV1.safeParse(sessionId);
    if (!session.success) throw new AuditExportError("AUDIT_EXPORT_UNAUTHENTICATED");
    try {
      const repository = new ContractorRepository(this.pool), member = await repository.resolveSession(session.data);
      // ENT-1's reviewed query verifies active membership before export access.
      // Its tenant-scoped projection is discarded; it supplies no export authority.
      try {
        await repository.query(member, { version: "contractor-query.v1", tenantId: member.tenantId, resource: "contracts" });
      } catch (error) {
        const code = (error as { code?: string }).code;
        if (code !== "FORBIDDEN" && code !== "NOT_FOUND") throw error;
        // A persisted session still attributes a revoked membership to its tenant.
        // This context is used ONLY to record refusal, never to read/create an export.
        const context = await this.resolveContext(session.data, member);
        await this.repository.refuse(context, { membershipId: member.membershipId, identityUserId: member.identityUserId }, action);
        throw new AuditExportError("AUDIT_EXPORT_FORBIDDEN");
      }
      return member;
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === "UNAUTHENTICATED") throw new AuditExportError("AUDIT_EXPORT_UNAUTHENTICATED");
      if (code === "FORBIDDEN" || code === "NOT_FOUND") throw new AuditExportError("AUDIT_EXPORT_FORBIDDEN");
      throw error;
    }
  }
  private async resolveContext(sessionId: string, member: Awaited<ReturnType<AuditExportApplication["member"]>>) {
    // This read-only adapter consumes ENT-1's persisted session lookup. The role is deliberately inert:
    // the repository rechecks current tenant-wide owner/admin grants under the shared ENT-1 lock.
    const denied = async (): Promise<never> => { throw new AuthError("UNAUTHENTICATED"); };
    const provider: AuthProvider = {
      requestCode: denied, verifyCode: denied,
      authenticate: async token => token === sessionId ? { identityUserId: member.identityUserId, sessionId, csrfToken: "audit-export-internal-bridge-token" } : undefined,
      findMembership: async (principal, tenantId) => principal.identityUserId === member.identityUserId && tenantId === member.tenantId ? { id: member.membershipId, identityUserId: member.identityUserId, tenantId: member.tenantId, role: "read_only", email: "generated@fictional.invalid" } : undefined,
    };
    // Browser origin checks are in both HTTP adapters; these values are internal bridge credentials, never user input.
    return resolveVerifiedTenantContext(provider, { sessionToken: sessionId, requestedTenantId: member.tenantId, csrfToken: "audit-export-internal-bridge-token", origin: "https://audit-export.fictional.invalid" }, "https://audit-export.fictional.invalid");
  }
  async list(sessionId: string | undefined) {
    const member = await this.member(sessionId, "list");
    const context = await this.resolveContext(sessionId!, member);
    const exports = await this.repository.list(context, { membershipId: member.membershipId, identityUserId: member.identityUserId });
    return { version: "audit-export-list.v1", environment: "synthetic_demo", notice: AUDIT_EXPORT_NOTICE, sandbox: AUDIT_EXPORT_SANDBOX, exports };
  }
  async create(sessionId: string | undefined, raw: unknown) {
    this.mode();
    const request = auditExportRequestV1.safeParse(raw);
    if (!request.success) throw new AuditExportError("AUDIT_EXPORT_INVALID_INPUT");
    const member = await this.member(sessionId, "create"), context = await this.resolveContext(sessionId!, member);
    return this.repository.create(context, { membershipId: member.membershipId, identityUserId: member.identityUserId }, request.data);
  }
}
export function auditExportHttpFailure(error: unknown) {
  const code = error instanceof AuditExportError ? error.code : error instanceof ZodError || error instanceof SyntaxError ? "AUDIT_EXPORT_INVALID_INPUT" : "AUDIT_EXPORT_UNAVAILABLE";
  const status = code === "AUDIT_EXPORT_UNAUTHENTICATED" ? 401 : code === "AUDIT_EXPORT_FORBIDDEN" || code === "AUDIT_EXPORT_MODE_HELD" ? 403 : code === "AUDIT_EXPORT_INVALID_INPUT" ? 400 : code === "AUDIT_EXPORT_UNAVAILABLE" ? 503 : 409;
  return { status, body: auditExportFailureV1.parse({ version: "audit-export-error.v1", code }) };
}
