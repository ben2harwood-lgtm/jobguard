import { createHash } from "node:crypto";
import type { Pool } from "pg";
import { downloadPlatformInvoice, issuePlatformInvoiceFixture, platformInvoiceCanonical, PlatformInvoiceError,
  platformInvoiceProfileV1, platformInvoiceRequestV1, type PlatformInvoiceDocument } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

/** Administrative synthetic fixture adapter ONLY. Not wired into API/worker. Runtime has no SQL grants.
 * Source manifests are fictional fixtures, never a substitute for production proof/Decision checks. */
export class PlatformTaxInvoiceFixtureRepository {
  constructor(private readonly pool: Pool) {}
  async issue(context: VerifiedTenantContext, profileRaw: unknown, raw: unknown): Promise<PlatformInvoiceDocument> {
    const p = platformInvoiceProfileV1.safeParse(profileRaw), r = platformInvoiceRequestV1.safeParse(raw);
    if (!p.success || !r.success) throw new PlatformInvoiceError("INVALID_PLATFORM_INVOICE");
    if (p.data.tenantId !== context.tenantId || r.data.tenantId !== context.tenantId || r.data.issuerId !== p.data.issuerId)
      throw new PlatformInvoiceError("PLATFORM_INVOICE_FORBIDDEN");
    return withTenant(this.pool, context, async db => {
      const client = db.$client, profile = p.data, request = r.data;
      // Requiring fixture administration grants keeps even a forged request off every runtime path.
      await client.query("SELECT 1 FROM app.platform_invoice_issuer LIMIT 0");
      const actor = await client.query("SELECT id FROM app.membership WHERE tenant_id=$1 AND id=$2 AND role='owner' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()) FOR SHARE", [context.tenantId, request.actorMembershipId]);
      if (!actor.rowCount) throw new PlatformInvoiceError("PLATFORM_INVOICE_FORBIDDEN");
      await client.query("INSERT INTO app.platform_invoice_issuer(tenant_id,id,profile) VALUES($1,$2,$3::jsonb) ON CONFLICT DO NOTHING", [context.tenantId, profile.issuerId, JSON.stringify(profile)]);
      // One lock for all invoice and credit numbering, history, source reuse and credit limits.
      const stored = await client.query("SELECT profile FROM app.platform_invoice_issuer WHERE tenant_id=$1 AND id=$2 FOR UPDATE", [context.tenantId, profile.issuerId]);
      if (platformInvoiceCanonical(stored.rows[0]?.profile) !== platformInvoiceCanonical(profile)) throw new PlatformInvoiceError("PLATFORM_INVOICE_CONFLICT");
      const history = (await client.query("SELECT document FROM app.platform_invoice_document WHERE tenant_id=$1 AND issuer_id=$2 ORDER BY sequence", [context.tenantId, profile.issuerId])).rows.map(row => row.document as PlatformInvoiceDocument);
      const document = issuePlatformInvoiceFixture(profile, request, history);
      if (history.some(d => d.request.commandId === request.commandId)) return document;
      await client.query(`INSERT INTO app.platform_invoice_document(tenant_id,issuer_id,sequence,command_id,request_hash,document_hash,number,kind,original_number,document)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)`, [context.tenantId, profile.issuerId, document.sequence, request.commandId,
        createHash("sha256").update(platformInvoiceCanonical(request)).digest("hex"), downloadPlatformInvoice(document).hash,
        document.number, request.kind, request.originalNumber, JSON.stringify(document)]);
      // Audit last: no business lock acquisition follows the chain head lock.
      await client.query("SELECT app.ef_audit($1,$2,'platform_invoice_document',$3,$4::jsonb)", [request.actorMembershipId,
        `platform_invoice.simulation_${request.kind}`, request.commandId, JSON.stringify({ number: document.number, documentHash: downloadPlatformInvoice(document).hash })]);
      return document;
    });
  }
}
