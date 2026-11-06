import { StoredAccountingExportError, type AccountingExportRepository } from "@jobguard/db";
import { identityStatus } from "./auth/identity-http.js";
import type { IdentityApplication } from "./auth/identity.application.js";
import { resolveVerifiedTenantContext, type TenantRequestCredentials } from "./auth/principal-bridge.js";
import { exportApprovalV1, exportPreviewV1, exportStatusV1, routeApprovalV1, routeReadV1, routeChangeV1 } from "./accounting-export.preview-contracts.js";

/** Company sessions only, synthetic database only. This boundary cannot execute a push. */
export class AccountingExportApplication {
  constructor(private readonly identity: IdentityApplication,
    private readonly repository: Pick<AccountingExportRepository, "execute"> & Partial<Pick<AccountingExportRepository, "routeChangeRead" | "routeChangeConfirm">>) {}
  async routeChange(credentials: TenantRequestCredentials, sourceId: string, operation: "read" | "confirm", raw: unknown = {}) {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new StoredAccountingExportError("EXPORT_FORBIDDEN");
    const context = await resolveVerifiedTenantContext(this.identity.provider, credentials, this.identity.allowedOrigin);
    const principal = await this.identity.provider.authenticate(credentials.sessionToken!);
    const actor = principal && await this.identity.provider.findMembership(principal, context.tenantId);
    if (!actor || !["owner", "admin"].includes(actor.role)) throw new StoredAccountingExportError("EXPORT_FORBIDDEN");
    const digest = this.identity.provider.digest(`session:${credentials.sessionToken}`);
    if (!this.repository.routeChangeRead || !this.repository.routeChangeConfirm) throw new StoredAccountingExportError("EXPORT_UNAVAILABLE");
    if (operation === "read") {
      if (!raw || typeof raw !== "object" || Array.isArray(raw) || Object.keys(raw).length)
        throw new StoredAccountingExportError("EXPORT_INVALID_INPUT");
      return routeReadV1.parse(await this.repository.routeChangeRead(context, digest, sourceId));
    }
    const approval = routeApprovalV1.safeParse(raw);
    if (!approval.success) throw new StoredAccountingExportError("EXPORT_INVALID_INPUT");
    const current = routeReadV1.parse(await this.repository.routeChangeRead(context, digest, sourceId));
    // A lost response may have committed. Replay the stored artifact, never a newly minted approval.
    const replay = current.history.find(change => change.commandId === approval.data.commandId);
    const preview = replay ?? current.proposal;
    if (!preview || preview.previewHash !== approval.data.previewHash) throw new StoredAccountingExportError("EXPORT_APPROVAL_REQUIRED");
    const { entries: _entries, ...request } = preview.artifact;
    return routeChangeV1.parse(await this.repository.routeChangeConfirm(context, digest, sourceId, {
      ...request, ...approval.data, action: "accounting_export.route", status: "approved",
      tenantId: `demo-${context.tenantId}`,
    }, actor.id));
  }
  async execute(credentials: TenantRequestCredentials, sourceId: string, operation: "preview" | "approve" | "read", raw: unknown = {}) {
    if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new StoredAccountingExportError("EXPORT_FORBIDDEN");
    const context = await resolveVerifiedTenantContext(this.identity.provider, credentials, this.identity.allowedOrigin);
    const digest = this.identity.provider.digest(`session:${credentials.sessionToken}`);
    if (operation === "read") return exportStatusV1.parse(await this.repository.execute(context, digest, "read", sourceId));
    const preview = exportPreviewV1.safeParse(await this.repository.execute(context, digest, "preview", sourceId));
    if (!preview.success) throw new StoredAccountingExportError("EXPORT_UNSUPPORTED_MAPPING");
    const { source, scope, target } = preview.data.artifact;
    if (source.tenantId !== `demo-${context.tenantId}` || scope.tenantId !== source.tenantId || scope.mapping.tenantId !== source.tenantId)
      throw new StoredAccountingExportError("EXPORT_FORBIDDEN");
    const objectType = { customer_invoice: "invoice", credit: "credit_note", receipt: "payment" }[source.kind];
    if (source.tax === "unsupported" || scope.mapping.tax !== source.tax || target.tax !== source.tax || target.objectType !== objectType)
      throw new StoredAccountingExportError("EXPORT_UNSUPPORTED_MAPPING");
    if (source.sourceId !== sourceId || scope.sourceId !== sourceId || target.sourceId !== sourceId ||
      source.revision !== scope.sourceRevision || source.revision !== target.sourceRevision ||
      scope.companyId !== target.companyId || scope.companyId !== scope.mapping.companyId ||
      target.accountId !== scope.mapping.accountId || target.customerId !== scope.mapping.customerId)
      throw new StoredAccountingExportError("EXPORT_REFERENCE_CONFLICT");
    if (operation === "preview") return preview.data;
    const approval = exportApprovalV1.safeParse(raw);
    if (!approval.success) throw new StoredAccountingExportError("EXPORT_INVALID_INPUT");
    if (approval.data.previewHash !== preview.data.previewHash) throw new StoredAccountingExportError("EXPORT_APPROVAL_REQUIRED");
    // SQL rechecks the current hash under its lock, closing the preview/approve race.
    return exportStatusV1.parse(await this.repository.execute(context, digest, "approve", sourceId, approval.data));
  }
}
export function accountingExportFailure(error: unknown) {
  if (error instanceof StoredAccountingExportError) {
    const status = error.code === "EXPORT_FORBIDDEN" ? 403 : error.code === "EXPORT_NOT_FOUND" ? 404 :
      error.code === "EXPORT_INVALID_INPUT" ? 400 : error.code === "EXPORT_UNAVAILABLE" ? 503 : 409;
    return { status, body: { version: 1, code: error.code } };
  }
  const failure = identityStatus(error);
  return { status: failure.status, body: { version: 1, code: failure.code === "IDENTITY_UNAVAILABLE" ? "EXPORT_UNAVAILABLE" : failure.code } };
}
