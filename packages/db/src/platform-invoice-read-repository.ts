import { isRequestBindingRefusal } from "./request-binding-error.js";
import type { Pool } from "pg";
import { PlatformInvoiceError, type PlatformInvoiceDocument } from "@jobguard/core";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";

/** Only the owner read routine is reachable. No issuing or collection adapter. */
export class PlatformInvoiceReadRepository {
  constructor(private readonly pool: Pool) {}
  async read(context: VerifiedTenantContext, digest: string) {
    if (!/^[a-f0-9]{64}$/u.test(digest)) throw new PlatformInvoiceError("PLATFORM_INVOICE_FORBIDDEN");
    try {
      return await withTenant(this.pool, context, async db => {
        const rows = await db.$client.query<{ document: PlatformInvoiceDocument }>(
          "SELECT app.platform_invoice_read($1,$2) AS document", [context.tenantId, digest]);
        const documents = rows.rows.map(row => row.document);
        return documents.filter(d => d.request.kind === "invoice").map(invoice => ({ invoice,
          credits: documents.filter(d => d.request.kind === "credit_note" && d.request.originalNumber === invoice.number
            && d.request.issuerId === invoice.request.issuerId),
        }));
      });
    } catch (error) {
      if (isRequestBindingRefusal(error) || (error as { code?: string }).code === "42501") throw new PlatformInvoiceError("PLATFORM_INVOICE_FORBIDDEN");
      throw error;
    }
  }
}
