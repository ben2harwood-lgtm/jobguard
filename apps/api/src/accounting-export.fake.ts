import { AccountingExportError, accountingTargetV1, parseAccounting, type AccountingTarget } from "./accounting-export.contracts.js";

export type AccountingRoute = "codat" | "xero";
export type FakeAccess = { tenantId: string; companyId: string };
export type FakeExternal = { id: string; tenantId: string; reference: string; contentHash: string; paid: boolean; payload: AccountingTarget };
export interface AccountingAdapter {
  readonly route: AccountingRoute;
  assertConnection(tenantId: string, companyId: string): number;
  push(reference: string, contentHash: string, input: unknown, access: FakeAccess): FakeExternal;
  find(reference: string, access: FakeAccess): FakeExternal[];
}
export class FakeRateLimit extends Error {
  readonly retryAfter = 30;
  constructor() { super("rate_limited"); }
}

/** Shared deterministic transport, not a provider SDK or a network abstraction. */
export class FakeAccountingTransport implements AccountingAdapter {
  next: "success" | "reject" | "unknown_before" | "unknown_after" | "rate_limit" = "success";
  pushes = 0;
  constructor(readonly route: AccountingRoute, readonly objects: FakeExternal[] = []) {}
  assertConnection(_tenantId: string, _companyId: string): number { return 1; }
  push(reference: string, contentHash: string, input: unknown, access: FakeAccess): FakeExternal {
    const payload = parseAccounting(accountingTargetV1, input);
    this.assertConnection(access.tenantId, access.companyId);
    if (payload.companyId !== access.companyId) throw new AccountingExportError("reference_conflict");
    this.pushes++;
    const mode = this.next; this.next = "success";
    if (mode === "rate_limit") throw new FakeRateLimit();
    if (mode === "reject" || mode === "unknown_before") throw new Error(mode);
    const object = { id: `demo-external-${this.objects.length + 1}`, tenantId: access.tenantId,
      reference, contentHash, paid: false, payload: structuredClone(payload) };
    this.objects.push(object);
    if (mode === "unknown_after") throw new Error(mode);
    return structuredClone(object);
  }
  find(reference: string, access: FakeAccess): FakeExternal[] {
    this.assertConnection(access.tenantId, access.companyId);
    return this.objects.filter(o => o.tenantId === access.tenantId && o.payload.companyId === access.companyId &&
      o.reference === reference).map(o => structuredClone(o));
  }
}
export class FakeCodatAdapter extends FakeAccountingTransport {
  constructor(objects: FakeExternal[] = []) { super("codat", objects); }
}
