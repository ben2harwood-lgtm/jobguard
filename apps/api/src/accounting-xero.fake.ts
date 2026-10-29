import { z } from "zod";
import { AccountingExportError, accountingTargetV1, parseAccounting, type AccountingTarget } from "./accounting-export.contracts.js";
import { FakeAccountingTransport, type FakeAccess, type FakeExternal } from "./accounting-export.fake.js";

const connectionV1 = z.object({ version: z.literal(1), tenantId: z.string().regex(/^demo-[a-z0-9-]{1,80}$/),
  companyId: z.string().regex(/^demo-[a-z0-9-]{1,80}$/), revision: z.number().int().positive().safe(),
  state: z.enum(["connected", "token_expired", "revoked"]), synthetic: z.literal(true) }).strict();
export type FakeXeroConnection = z.infer<typeof connectionV1>;

// These are fictional transport codes, NOT verified Xero API values or approved tax policies.
export const fakeXeroTaxCodes = { unsupported: "DEMO_UNMAPPED", no_tax: "DEMO_NO_TAX",
  standard: "DEMO_STANDARD", zero_rated: "DEMO_ZERO" } as const;
function mapDocument(target: AccountingTarget) {
  return { type: { invoice: "DEMO_INVOICE", credit_note: "DEMO_CREDIT_NOTE", payment: "DEMO_RECEIPT" }[target.objectType],
    company: target.companyId, contact: target.customerId, account: target.accountId,
    totalPence: target.amount.pence, currency: target.amount.currency, taxCode: fakeXeroTaxCodes[target.tax],
    source: target.sourceId, revision: target.sourceRevision, invoice: target.invoiceId, invoiceRevision: target.invoiceRevision };
}

/** Dark in-memory Xero seam. No OAuth, tokens, endpoints, SDK or production registration. */
export class FakeXeroAdapter extends FakeAccountingTransport {
  private readonly connections = new Map<string, FakeXeroConnection>();
  readonly documents = new Map<string, ReturnType<typeof mapDocument>>();
  constructor(connections: unknown[] = [], objects: FakeExternal[] = []) {
    super("xero", objects);
    for (const connection of connections) this.setSyntheticConnection(connection);
  }
  setSyntheticConnection(input: unknown): void {
    const connection = parseAccounting(connectionV1, input);
    const key = JSON.stringify([connection.tenantId, connection.companyId]);
    const prior = this.connections.get(key);
    if (prior && (connection.revision < prior.revision ||
        (connection.revision === prior.revision && connection.state !== prior.state))) throw new AccountingExportError("reference_conflict");
    this.connections.set(key, structuredClone(connection));
  }
  override assertConnection(tenantId: string, companyId: string): number {
    const connection = this.connections.get(JSON.stringify([tenantId, companyId]));
    if (!connection || connection.state !== "connected") throw new AccountingExportError("connection_required");
    return connection.revision;
  }
  override push(reference: string, contentHash: string, input: unknown, access: FakeAccess): FakeExternal {
    const target = parseAccounting(accountingTargetV1, input);
    const document = mapDocument(target);
    const before = this.objects.length;
    try { return super.push(reference, contentHash, target, access); }
    finally {
      // Includes accepted requests whose response was lost (unknown_after).
      for (const object of this.objects.slice(before)) this.documents.set(object.id, structuredClone(document));
    }
  }
  override find(reference: string, access: FakeAccess): FakeExternal[] {
    return super.find(reference, access).map(object => {
      const document = this.documents.get(object.id);
      if (document && JSON.stringify(document) !== JSON.stringify(mapDocument(object.payload))) object.contentHash = "external-edit";
      return object;
    });
  }
}
