import { z } from "zod";
import { AccountingExportError, accountingTargetV1, parseAccounting, type AccountingTarget } from "./accounting-export.contracts.js";
import { FakeAccountingTransport, type FakeAccess, type FakeExternal } from "./accounting-export.fake.js";

const connectionV1 = z.object({ version: z.literal(1), tenantId: z.string().regex(/^demo-[a-z0-9-]{1,80}$/),
  companyId: z.string().regex(/^demo-[a-z0-9-]{1,80}$/), revision: z.number().int().positive().safe(),
  state: z.enum(["connected", "token_expired", "revoked"]), synthetic: z.literal(true) }).strict();
export type FakeQuickBooksConnection = z.infer<typeof connectionV1>;

// These are fictional transport codes, NOT verified QuickBooks API values or approved tax policies.
export const fakeQuickBooksCapabilities = {
  version: 1, route: "quickbooks", evidence: "synthetic_only", direction: "push", currency: "GBP",
  objects: ["invoice", "credit_note", "payment"], taxTreatments: ["no_tax", "standard", "zero_rated"],
  unsupported: ["retention", "cis", "drc", "tax_calculation", "settlement_proof", "external_overwrite",
    "automatic_reversals", "live_access", "oauth", "provider_conformance"],
} as const;
export const fakeQuickBooksTaxCodes = { no_tax: "DEMO_NO_TAX",
  standard: "DEMO_STANDARD", zero_rated: "DEMO_ZERO" } as const;
function mapDocument(target: AccountingTarget) {
  if (target.tax === "unsupported") throw new AccountingExportError("unsupported_mapping");
  return { entity: { invoice: "DEMO_INVOICE", credit_note: "DEMO_CREDIT_MEMO", payment: "DEMO_PAYMENT" }[target.objectType],
    realmId: target.companyId, customerRef: { value: target.customerId }, accountRef: { value: target.accountId },
    total: { pence: target.amount.pence, currency: target.amount.currency }, taxRef: fakeQuickBooksTaxCodes[target.tax],
    sourceRef: { id: target.sourceId, revision: target.sourceRevision },
    linkedInvoice: target.invoiceId === null ? null : { id: target.invoiceId, revision: target.invoiceRevision } };
}

/** Dark in-memory QuickBooks seam. No OAuth, tokens, endpoints, SDK or production registration. */
export class FakeQuickBooksAdapter extends FakeAccountingTransport {
  private readonly connections = new Map<string, FakeQuickBooksConnection>();
  readonly documents = new Map<string, ReturnType<typeof mapDocument>>();
  constructor(connections: unknown[] = [], objects: FakeExternal[] = []) {
    super("quickbooks", objects);
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
