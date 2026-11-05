import { describe, it, expect, vi } from "vitest";
import type { Pool } from "pg";
import { VAT_FIXTURE_LABEL, VAT_SUPPORT_MATRIX_VERSION, VAT_TREATMENTS_ENABLED,
  assertVatTreatmentIssueAllowed, type VatTreatmentFixtureBook } from "@jobguard/core";
import { VatFixtureRepository } from "../src/vat-fixture-repository.js";
import { testTenantContext } from "./tenant-context-test-utils.js";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function input() {
  const book: Omit<VatTreatmentFixtureBook, "tenantId" | "jobId" | "documents"> = {
    version: "vat.fixture-book.v1", matrixVersion: VAT_SUPPORT_MATRIX_VERSION, environment: "synthetic",
    label: VAT_FIXTURE_LABEL, supplierReference: "Fictional supplier", customerReference: "Fictional customer",
    taxBasis: "net_after_retention", roundingVersion: "fixture_cumulative_group_half_up_v1",
  };
  return { version: "vat.fixture-append.v1", commandId: id(4), jobId: id(2), book,
    document: { id: id(5), previousDocumentId: null as string | null, kind: "interim" as "interim" | "credit_note",
      documentReference: "fictional-1", documentDate: "2026-11-04", interimCertificationId: id(6), retentionProfileId: id(7),
      retentionReleaseId: null, creditOfDocumentId: null as string | null,
      groups: [{ treatment: "drc_5" as const, cumulativeNetPence: 10000, retainedNetPence: 1000, eligibility: {
        source: "human_fixture" as const, actorId: id(3), evidenceId: id(8), supplierVatRegistered: true,
        supplierVatNumber: "fictional-vat", customerVatRegistered: true, customerVatNumber: "fictional-client-vat",
        customerEndUser: false, intermediarySupplier: false, constructionReverseChargeInScope: true,
        qualifyingBasisReference: "fictional qualifying basis",
      } }],
    } };
}
function stored(value = input()) {
  return { input: value, actorId: id(3), recordHash: "a".repeat(64), matrixVersion: VAT_SUPPORT_MATRIX_VERSION,
    environment: "synthetic", label: VAT_FIXTURE_LABEL };
}
function fixture(initial: unknown[] = []) {
  let rows = initial;
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (!sql.includes("app.vat_fixture_records")) return { rows: [] };
    if (values?.[3] === "append") rows = [...rows, stored(JSON.parse(String(values[4])) as ReturnType<typeof input>)];
    return { rows: [{ result: rows }] };
  });
  const release = vi.fn(), connect = vi.fn(async () => ({ query, release }));
  return { repo: new VatFixtureRepository({ connect } as unknown as Pool), query, connect, release,
    context: testTenantContext(id(1)) };
}
describe("M4-21 durable dark VAT fixture boundary", () => {
  it("locks, validates and appends, then reads separate DRC, net, gross, retention and cash from stored rows", async () => {
    const f = fixture(), value = input();
    const result = await f.repo.command(f.context, id(3), value);
    expect(f.query.mock.calls.filter(([sql]) => sql.includes("app.vat_fixture_records")).map(([, v]) => v?.[3])).toEqual(["lock", "append"]);
    expect(result).toMatchObject({ environment: "synthetic", label: VAT_FIXTURE_LABEL, lineage: "fixture lineage, never authority" });
    expect(result.reconciliation.documents[0]).toMatchObject({ cumulative: {
      net: { pence: 10000 }, vatToSupplier: { pence: 0 }, reverseChargeVat: { pence: 450 },
      gross: { pence: 10000 }, retained: { pence: 1000 }, expectedCash: { pence: 9000 },
    }, groups: [{ treatment: "drc_5", wording: "Reverse charge: customer to account for VAT to HMRC." }] });
    expect(await f.repo.read(f.context, id(2))).toEqual(result);
    expect(result.records[0]).toMatchObject({ matrixVersion: VAT_SUPPORT_MATRIX_VERSION, environment: "synthetic", label: VAT_FIXTURE_LABEL });
    expect(VAT_TREATMENTS_ENABLED).toBe(false); expect(assertVatTreatmentIssueAllowed).toThrow();
  });
  it("replays once and refuses changed payload or actor without an append", async () => {
    const f = fixture([stored()]);
    await f.repo.command(f.context, id(3), input());
    await expect(f.repo.command(f.context, id(3), { ...input(), document: { ...input().document, documentDate: "2026-11-05" } })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(f.repo.command(f.context, id(9), input())).rejects.toMatchObject({ code: "CONFLICT" });
    expect(f.query.mock.calls.some(([, values]) => values?.[3] === "append")).toBe(false);
  });
  it("stores core's credit calculation without choosing another method", async () => {
    const f = fixture([stored()]), credit = input();
    credit.commandId = id(20); credit.document.id = id(21); credit.document.previousDocumentId = id(5);
    credit.document.kind = "credit_note"; credit.document.creditOfDocumentId = id(5); credit.document.documentReference = "fictional-credit";
    credit.document.groups[0]!.cumulativeNetPence = 0; credit.document.groups[0]!.retainedNetPence = 0;
    const result = await f.repo.command(f.context, id(3), credit);
    expect(result.reconciliation.documents[1]?.delta).toMatchObject({ net: { pence: -10000 }, expectedCash: { pence: -9000 }, reverseChargeVat: { pence: -450 } });
    expect(result.book.documents[0]).toEqual(input().document);
  });
  it.each(["tenantId", "actor", "enabled", "environment"])("refuses caller supplied %s before connection", async field => {
    const f = fixture();
    await expect(f.repo.command(f.context, id(3), { ...input(), [field]: true })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(f.connect).not.toHaveBeenCalled();
  });
  it.each(["taxBasis", "supplierReference", "customerReference"])("refuses changed fixed %s", async field => {
    const f = fixture([stored()]), value = input(); value.commandId = id(22);
    const book = { ...value.book, [field]: field === "taxBasis" ? "full_net" : "different fictional reference" };
    await expect(f.repo.command(f.context, id(3), { ...value, book })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(f.query.mock.calls.some(([, v]) => v?.[3] === "append")).toBe(false);
  });
  it.each(["missing", "unsupported", "conflicting", "broken lineage", "duplicate reference", "credit increase"])("refuses %s without a write", async change => {
    const value = input(), f = fixture(change === "duplicate reference" || change === "credit increase" ? [stored()] : []);
    const raw = value as unknown as { document: Record<string, unknown> };
    if (change === "missing") delete (value.document.groups[0]!.eligibility as Partial<typeof value.document.groups[0]["eligibility"]>).customerEndUser;
    if (change === "unsupported") raw.document.groups = [{ ...value.document.groups[0], treatment: "unknown" }];
    if (change === "conflicting") value.document.groups[0]!.eligibility.customerEndUser = true;
    if (change === "broken lineage") value.document.previousDocumentId = id(90);
    if (change === "duplicate reference" || change === "credit increase") {
      value.commandId = id(20); value.document.id = id(21); value.document.previousDocumentId = id(5);
      if (change === "credit increase") {
        value.document.kind = "credit_note"; value.document.creditOfDocumentId = id(5); value.document.documentReference = "credit";
        value.document.groups[0]!.cumulativeNetPence = 20000;
      }
    }
    await expect(f.repo.command(f.context, id(3), value)).rejects.toBeInstanceOf(Error);
    expect(f.query.mock.calls.some(([, v]) => v?.[3] === "append")).toBe(false);
  });
  it("fails closed on altered stored rows and redacts unexpected SQL errors", async () => {
    const f = fixture([{ ...stored(), environment: "production" }]);
    await expect(f.repo.read(f.context, id(2))).rejects.toMatchObject({ code: "UNAVAILABLE" });
    f.query.mockRejectedValueOnce(new Error("private database content"));
    await expect(f.repo.read(f.context, id(2))).rejects.toThrow("VAT_FIXTURE_UNAVAILABLE");
    expect(f.release).toHaveBeenCalledTimes(2);
  });
});
