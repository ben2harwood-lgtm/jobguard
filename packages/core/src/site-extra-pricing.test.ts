import ts from "typescript";
import { describe, expect, it } from "vitest";
import { enterpriseExtraV1, enterpriseRevisionV1 } from "./enterprise-domain/contracts.js";
import { priceSorLine } from "./sor-pricing.js";
import {
  SorSiteExtraError, canonicalSorQuantity, extraSorRevisionHashV1, logSorSiteExtraV1, orderCheckV1, parseLogSorSiteExtra, parseOrderCheckQuery, parseSorItemsQuery, parseSorSiteExtraInput,
  siteOrderCheckV1, siteSorItemsV1, sorPriceSourceValues, sorSiteExtraErrorCodes, sorSiteExtraFailureV1, sorSiteExtraHttpStatus, sorSiteExtraLoggedV1, sorStoredCoverageValues,
} from "./site-extra-pricing.js";

// Core has no Node type dependency; this test-only runtime import keeps that boundary intact (as recovery-allocation.test.ts does).
const readText = async (path: URL) => { const fileModule = "node:fs"; const { readFileSync } = await import(fileModule) as { readFileSync(path: URL, encoding: "utf8"): string }; return readFileSync(path, "utf8"); };
const uuid = (n: number) => `${String(n).repeat(8)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const A = uuid(1), B = uuid(2), C1 = uuid(3), C2 = uuid(4);
const lines = [
  { scopeItemId: A, sorCode: "AAA", quantity: "3", position: 0 },
  { scopeItemId: B, sorCode: "BBB", quantity: "2.5", position: 1 },
  { scopeItemId: C1, sorCode: "CCC", quantity: "1", position: 2 },
  { scopeItemId: C2, sorCode: "CCC", quantity: "4", position: 3 },
];
const check = (sorCode: string, quantity: string, orderLineScopeItemId?: string) => orderCheckV1({ sorCode, quantity, ...(orderLineScopeItemId ? { orderLineScopeItemId } : {}), lines });
const refusal = (run: () => unknown) => { try { run(); } catch (error) { return (error as Error & { code?: string }).code; } return undefined; };

describe("ENT-3c order check (pure)", () => {
  it("[C1] a code that is not on the order is new and the whole claim is the extra", () => {
    expect(check("ZZZ", "2")).toEqual({ outcome: "new", extraQuantity: "2" });
    expect(check("ZZZ", "2.50")).toEqual({ outcome: "new", extraQuantity: "2.5" });
  });
  it("[C1] within the instructed quantity is already on the order, equal counts as within, and trailing zeros do not matter", () => {
    for (const claimed of ["3", "3.0", "2.999999", "0.000001"]) expect(check("AAA", claimed)).toEqual({ outcome: "already_on_order", orderLineScopeItemId: A, instructedQuantity: "3" });
  });
  it("[C1] more than the instructed quantity is the excess only, as exact decimal text", () => {
    expect(check("AAA", "3.000001")).toEqual({ outcome: "more_than_ordered", orderLineScopeItemId: A, instructedQuantity: "3", extraQuantity: "0.000001" });
    expect(check("AAA", "5")).toEqual({ outcome: "more_than_ordered", orderLineScopeItemId: A, instructedQuantity: "3", extraQuantity: "2" });
    expect(check("BBB", "4.125")).toEqual({ outcome: "more_than_ordered", orderLineScopeItemId: B, instructedQuantity: "2.5", extraQuantity: "1.625" });
  });
  it("[C1] the same code on two lines needs the caller to name the line, and a named line is the one compared", () => {
    expect(refusal(() => check("CCC", "5"))).toBe("ORDER_LINE_AMBIGUOUS");
    expect(check("CCC", "5", C2)).toEqual({ outcome: "more_than_ordered", orderLineScopeItemId: C2, instructedQuantity: "4", extraQuantity: "1" });
    expect(check("CCC", "5", C1)).toEqual({ outcome: "more_than_ordered", orderLineScopeItemId: C1, instructedQuantity: "1", extraQuantity: "4" });
  });
  it("[C1] a named line that carries another code, or is not on the revision, is ORDER_LINE_NOT_FOUND", () => {
    expect(refusal(() => check("AAA", "5", B))).toBe("ORDER_LINE_NOT_FOUND");
    expect(refusal(() => check("AAA", "5", uuid(9)))).toBe("ORDER_LINE_NOT_FOUND");
    expect(refusal(() => check("ZZZ", "5", A))).toBe("ORDER_LINE_NOT_FOUND");
  });
  it.each(["0", "0.0", "-1", "1.0000001", "01", "1.", ".5", "1e3", " 1", "", "1234567890123", "1 "])("[C1] quantity %j is INVALID_QUANTITY", quantity => {
    expect(refusal(() => check("AAA", quantity))).toBe("INVALID_QUANTITY");
  });
  it("[C1] exactness: subtraction is exact and the result has no trailing zeros, exponent or sign", () => {
    const base = [{ scopeItemId: A, sorCode: "X", quantity: "0.1", position: 0 }, { scopeItemId: B, sorCode: "Y", quantity: "0.000001", position: 1 }, { scopeItemId: C1, sorCode: "W", quantity: "10", position: 2 }];
    expect(orderCheckV1({ sorCode: "X", quantity: "0.3", lines: base })).toMatchObject({ extraQuantity: "0.2" });
    expect(orderCheckV1({ sorCode: "Y", quantity: "999999999999.999999", lines: base })).toMatchObject({ extraQuantity: "999999999999.999998" });
    for (const [code, claimed] of [["X", "0.3"], ["Y", "2"], ["W", "10.500000"], ["Q", "7.250000"]] as const) {
      const result = orderCheckV1({ sorCode: code, quantity: claimed, lines: base });
      if ("extraQuantity" in result) expect(result.extraQuantity).toMatch(/^(?:0|[1-9][0-9]*)(?:\.[0-9]*[1-9])?$/u);
    }
    expect(orderCheckV1({ sorCode: "W", quantity: "10.500000", lines: base })).toMatchObject({ extraQuantity: "0.5" });
  });
  it("[C1] canonical quantity text has no trailing zeros and refuses what the quantity rule refuses", () => {
    for (const [given, canonical] of [["3", "3"], ["3.0", "3"], ["3.500000", "3.5"], ["0.000001", "0.000001"], ["10.10", "10.1"], ["999999999999.999999", "999999999999.999999"]] as const) expect(canonicalSorQuantity(given)).toBe(canonical);
    for (const bad of ["0", "-1", "01", "1e3", "", " 1", 5, null]) expect(refusal(() => canonicalSorQuantity(bad))).toBe("INVALID_QUANTITY");
  });
  it("[C1] the order check never mutates its input and compares as numbers, not text", () => {
    const frozen = Object.freeze(lines.map(line => Object.freeze({ ...line })));
    expect(orderCheckV1({ sorCode: "AAA", quantity: "10", lines: frozen })).toMatchObject({ outcome: "more_than_ordered", extraQuantity: "7" });
    expect(orderCheckV1({ sorCode: "AAA", quantity: "9", lines: [{ scopeItemId: A, sorCode: "AAA", quantity: "10", position: 0 }] })).toEqual({ outcome: "already_on_order", orderLineScopeItemId: A, instructedQuantity: "10" });
  });
});

describe("ENT-3c boundary schemas", () => {
  const minimal = () => ({ version: "log-sor-site-extra.v1", commandId: uuid(5), sorCode: "CLEAR-GUTTER", quantity: "1.5", note: "Fictional note" });
  it("[C2] accepts its minimal valid input and the optional named line", () => {
    expect(logSorSiteExtraV1.safeParse(minimal()).success).toBe(true);
    expect(logSorSiteExtraV1.safeParse({ ...minimal(), orderLineScopeItemId: A }).success).toBe(true);
    expect(parseLogSorSiteExtra(minimal())).toMatchObject({ sorCode: "CLEAR-GUTTER", quantity: "1.5" });
  });
  const forbidden = ["commandType", "actorMembershipId", "membershipId", "grantId", "tenantId", "requested_tenant_id", "role", "raisingRole", "origin", "kind", "jobTrack", "track", "serverRecordedAt", "time", "state", "raiserAssigned", "workOrderId", "workOrderRevisionId", "originHash", "environment", "provenance",
    "jobId", "sorItem", "sorVersionId", "excessOfScopeItemId", "unit", "rate", "ratePence", "unitRatePence", "adjustment", "net", "netPence", "price", "pricePence", "amount", "extraQuantity", "instructedQuantity", "outcome", "orderCheck", "coverage", "priceSource", "pricingBasis", "description", "revision", "revisionId", "contentHash", "requestHash", "siteVisitId"];
  it.each(forbidden)("[C2] refuses the authority or derived field %s", field => {
    expect(logSorSiteExtraV1.safeParse({ ...minimal(), [field]: "tampered" }).success).toBe(false);
    expect(refusal(() => parseLogSorSiteExtra({ ...minimal(), [field]: "tampered" }))).toBe("INVALID_COMMAND");
  });
  it("[C2] the repository input carries the job from the path and refuses the same names", () => {
    const input = { ...minimal(), jobId: uuid(6) } as Record<string, unknown>; delete input.version;
    expect(parseSorSiteExtraInput(input)).toMatchObject({ jobId: uuid(6), sorCode: "CLEAR-GUTTER" });
    expect(refusal(() => parseSorSiteExtraInput({ ...input, grantId: uuid(7) }))).toBe("INVALID_COMMAND");
    expect(refusal(() => parseSorSiteExtraInput({ ...input, jobId: "not-a-uuid" }))).toBe("INVALID_COMMAND");
  });
  it("[C2] a body that is valid apart from its quantity is INVALID_QUANTITY, every other invalid body is INVALID_COMMAND", () => {
    for (const quantity of ["0", "-1", "1.1234567", "1234567890123", "01", "1e3", " 1", "", 5, null]) expect(refusal(() => parseLogSorSiteExtra({ ...minimal(), quantity }))).toBe("INVALID_QUANTITY");
    const withoutQuantity = minimal() as Record<string, unknown>; delete withoutQuantity.quantity;
    expect(refusal(() => parseLogSorSiteExtra(withoutQuantity))).toBe("INVALID_QUANTITY");
    for (const bad of [{ ...minimal(), note: "   " }, { ...minimal(), note: "" }, { ...minimal(), sorCode: "" }, { ...minimal(), sorCode: "x".repeat(81) }, { ...minimal(), commandId: "nope" }, { ...minimal(), version: "log-sor-site-extra.v2" }, { ...minimal(), orderLineScopeItemId: "nope" }, null, "text", 4]) {
      expect(refusal(() => parseLogSorSiteExtra(bad))).toBe("INVALID_COMMAND");
    }
    expect(refusal(() => parseLogSorSiteExtra({ ...minimal(), quantity: "0", note: " " }))).toBe("INVALID_COMMAND");
  });
  it("[C2] the search text is required: missing, empty or white space is the typed invalid-query refusal (Q10 replaced the recent list)", () => {
    expect(parseSorItemsQuery({ q: " gutter " })).toEqual({ q: "gutter" });
    for (const bad of [{}, { q: "" }, { q: "   " }, { q: "x".repeat(81) }, { q: 5 }, { q: "ok", tenantId: uuid(1) }, undefined, null]) expect(refusal(() => parseSorItemsQuery(bad))).toBe("INVALID_COMMAND");
  });
  it("[C2] the order-check query needs a code and a quantity; the quantity rules are the same", () => {
    expect(parseOrderCheckQuery({ sorCode: "AAA", quantity: "2" })).toEqual({ sorCode: "AAA", quantity: "2" });
    expect(parseOrderCheckQuery({ sorCode: "AAA", quantity: "2", orderLine: A })).toEqual({ sorCode: "AAA", quantity: "2", orderLine: A });
    expect(refusal(() => parseOrderCheckQuery({ quantity: "2" }))).toBe("INVALID_COMMAND");
    expect(refusal(() => parseOrderCheckQuery({ sorCode: "AAA" }))).toBe("INVALID_QUANTITY");
    expect(refusal(() => parseOrderCheckQuery({ sorCode: "AAA", quantity: "0" }))).toBe("INVALID_QUANTITY");
    expect(refusal(() => parseOrderCheckQuery({ sorCode: "AAA", quantity: "2", orderLine: "x" }))).toBe("INVALID_COMMAND");
    expect(refusal(() => parseOrderCheckQuery({ sorCode: "AAA", quantity: "2", tenantId: A }))).toBe("INVALID_COMMAND");
  });
});

describe("ENT-3c results and errors carry no money", () => {
  const examples = () => ({
    logged: { version: "sor-site-extra-logged.v1", environment: "synthetic_demo", realExternalActions: 0, jobId: A, extraId: B, state: "logged", priceSource: "server_sor",
      orderCheck: { outcome: "more_than_ordered", sorCode: "CLEAR-GUTTER", unit: "metre", claimedQuantity: "6", instructedQuantity: "4", extraQuantity: "2", orderLineScopeItemId: C1 } },
    check: { version: "site-order-check.v1", environment: "synthetic_demo", realExternalActions: 0, jobId: A, orderCheck: { outcome: "already_on_order", sorCode: "CLEAR-GUTTER", unit: "metre", claimedQuantity: "3", instructedQuantity: "4", orderLineScopeItemId: C1 } },
    items: { version: "site-sor-items.v1", environment: "synthetic_demo", realExternalActions: 0, jobId: A, sorVersionId: B, items: [{ code: "CLEAR-GUTTER", description: "Clear gutters", unit: "metre" }], truncated: false },
  });
  const keysOf = (value: unknown): string[] => value && typeof value === "object" ? Object.entries(value).flatMap(([key, child]) => [key, ...keysOf(child)]) : [];
  it("[C3] the three result schemas accept their examples and refuse a price, a net and a rate", () => {
    const { logged, check: orderCheck, items } = examples();
    expect(sorSiteExtraLoggedV1.parse(logged)).toEqual(logged); expect(siteOrderCheckV1.parse(orderCheck)).toEqual(orderCheck); expect(siteSorItemsV1.parse(items)).toEqual(items);
    for (const field of ["price", "netPence", "rate", "ratePence", "pence", "amount"]) {
      expect(sorSiteExtraLoggedV1.safeParse({ ...logged, [field]: 1 }).success, field).toBe(false);
      expect(siteOrderCheckV1.safeParse({ ...orderCheck, [field]: 1 }).success, field).toBe(false);
      expect(siteSorItemsV1.safeParse({ ...items, items: [{ ...items.items[0], [field]: 1 }] }).success, field).toBe(false);
    }
    expect(siteSorItemsV1.safeParse({ ...items, recent: [] }).success).toBe(false);
  });
  it("[C3] a serialised example of each has no key naming money; priceSource is the draft's label of where a price came from, not a value", () => {
    const { logged, check: orderCheck, items } = examples();
    for (const example of [logged, orderCheck, items]) for (const key of keysOf(JSON.parse(JSON.stringify(example)))) {
      if (key === "priceSource") continue;
      expect(key, key).not.toMatch(/pence|rate|net|price|amount|resident|contact|address/iu);
    }
  });
  it("[C3] this module has no parseFloat, toFixed, Math. or number-typed quantity (read with the TypeScript parser)", async () => {
    const path = new URL("./site-extra-pricing.ts", import.meta.url);
    const source = ts.createSourceFile("site-extra-pricing.ts", await readText(path), ts.ScriptTarget.ES2022, true);
    const found: string[] = [];
    const visit = (node: ts.Node): void => {
      if (ts.isIdentifier(node) && ["parseFloat", "toFixed", "Math"].includes(node.text)) found.push(`${node.text}@${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
      if ((ts.isParameter(node) || ts.isPropertySignature(node) || ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node)) && node.type && node.type.kind === ts.SyntaxKind.NumberKeyword && /quantity|qty/iu.test(node.name.getText())) found.push(`number-quantity:${node.name.getText()}`);
      ts.forEachChild(node, visit);
    };
    visit(source);
    expect(found).toEqual([]);
  });
  it("[C3] every code maps to its one status", () => {
    const expected: Record<string, number> = { UNAUTHENTICATED: 401, MODE_FORBIDDEN: 403, ORIGIN_FORBIDDEN: 403, TRACK_FORBIDDEN: 403, EXTRA_FORBIDDEN: 403, INVALID_COMMAND: 400, INVALID_QUANTITY: 400, NOT_FOUND: 404, JOB_NOT_LIVE: 409, IDEMPOTENCY_CONFLICT: 409, SOR_ITEM_NOT_FOUND: 422, ORDER_LINE_NOT_FOUND: 422, ORDER_LINE_AMBIGUOUS: 422, ALREADY_ON_ORDER: 422, EXTRA_NOT_POSITIVE: 422, MONEY_OUT_OF_RANGE: 422, SITE_PRICING_UNAVAILABLE: 503 };
    expect([...sorSiteExtraErrorCodes].sort()).toEqual(Object.keys(expected).sort());
    for (const code of sorSiteExtraErrorCodes) {
      expect(sorSiteExtraHttpStatus(code)).toBe(expected[code]);
      const error = new SorSiteExtraError(code);
      expect(error.message).toBe(code); expect(error.code).toBe(code);
      expect(sorSiteExtraFailureV1.parse({ version: "sor-site-extra-error.v1", code })).toEqual({ version: "sor-site-extra-error.v1", code });
    }
    expect(sorSiteExtraFailureV1.safeParse({ version: "sor-site-extra-error.v1", code: "SOMETHING_ELSE" }).success).toBe(false);
    expect(sorSiteExtraFailureV1.safeParse({ version: "sor-site-extra-error.v1", code: "NOT_FOUND", detail: "x" }).success).toBe(false);
  });
});

describe("ENT-3c hash mirror and one vocabulary", () => {
  const base = { tenantId: "11111111-1111-4111-8111-111111111111", jobId: "22222222-2222-4222-8222-222222222222", variationId: "33333333-3333-4333-8333-333333333333", revision: "1", originHash: "a".repeat(64),
    workOrderId: "44444444-4444-4444-8444-444444444444", workOrderRevisionId: "55555555-5555-4555-8555-555555555555", sorVersionId: "66666666-6666-4666-8666-666666666666", sorCode: "CLEAR-GUTTER", unit: "metre", ratePence: "350", adjustmentNumerator: "-35", adjustmentDenominator: "1000" };
  it("[C4] the two fixed digests of the framing in migration item 4", () => {
    expect(extraSorRevisionHashV1({ ...base, coverage: "excess", excessOfScopeItemId: "77777777-7777-4777-8777-777777777777", instructedQuantity: "4", claimedQuantity: "6", quantity: "2", netPence: "676" }))
      .toBe("5efa4883718ab9caa0bfd220781d3f235264aefa1a763dfb388df9433ef37334");
    expect(extraSorRevisionHashV1({ ...base, coverage: "new", excessOfScopeItemId: null, instructedQuantity: null, claimedQuantity: "1", quantity: "1", netPence: "338" }))
      .toBe("77c5ad962a72be2d7b40e3ec22c498184f7ddd613629eacf9bab2206392aa8c7");
  });
  it("[C4] a NULL and an empty text frame differently, and length is in UTF-8 bytes", () => {
    const one = extraSorRevisionHashV1({ ...base, coverage: "new", excessOfScopeItemId: null, instructedQuantity: null, claimedQuantity: "1", quantity: "1", netPence: "338" });
    expect(extraSorRevisionHashV1({ ...base, coverage: "new", excessOfScopeItemId: null, instructedQuantity: "", claimedQuantity: "1", quantity: "1", netPence: "338" })).not.toBe(one);
    expect(extraSorRevisionHashV1({ ...base, sorCode: "é", coverage: "new", excessOfScopeItemId: null, instructedQuantity: null, claimedQuantity: "1", quantity: "1", netPence: "338" })).not.toBe(one);
  });
  it("[C27] the price-source and coverage values are the merged ENT-4a lists, and the migration's CHECK lists equal them", async () => {
    expect([...sorPriceSourceValues]).toEqual(enterpriseRevisionV1.shape.priceSource.options);
    expect([...sorStoredCoverageValues]).toEqual(enterpriseExtraV1.shape.orderAtOrigin.shape.coverage.options.filter(value => value !== "fully_instructed"));
    const sql = await readText(new URL("../../db/migrations/0140_site_extra_pricing.sql", import.meta.url));
    const listOf = (pattern: RegExp) => { const match = sql.match(pattern); expect(match, String(pattern)).not.toBeNull(); return [...match![1]!.matchAll(/'([a-z_]+)'/gu)].map(item => item[1]); };
    expect(listOf(/pricing_basis text NOT NULL CHECK\(pricing_basis IN\(([^)]*)\)\)/u)).toEqual(enterpriseRevisionV1.shape.priceSource.options);
    expect(listOf(/coverage text NOT NULL CHECK\(coverage IN\(([^)]*)\)\)/u)).toEqual(sorStoredCoverageValues);
  });
});

// The fourteen worked money rows of the order (M1 to M14), run through the MERGED function only. Rates are the merged demo's (work-order-fixtures.ts): REPAIR-DOOR 10000p,
// PAINT-ROOM 25000p, FIT-LOCK 4500p, CLEAR-VOID 18000p, CLEAR-GUTTER 350p; adjustment -35/1000 unless a row says otherwise. The pence expectations are the draft's table.
describe("[C6] the worked money table through merged priceSorLine (pure)", () => {
  type Row = { id: string; rate: number; adjustment?: [string, string]; extra: string; pence: string; error?: string; note?: string };
  const rows: Row[] = [
    { id: "M1", rate: 350, extra: "1", pence: "338" }, { id: "M2", rate: 350, extra: "1.625", pence: "549" }, { id: "M3", rate: 350, extra: "2", pence: "676" },
    { id: "M4", rate: 25000, extra: "0.5", pence: "12062" }, { id: "M5", rate: 18000, extra: "1", pence: "17370" }, { id: "M6", rate: 10000, extra: "1", pence: "9650" },
    { id: "M7", rate: 10000, extra: "2", pence: "19300" }, { id: "M8", rate: 4500, extra: "3", pence: "13028" }, { id: "M9", rate: 4500, extra: "1", pence: "4342" },
    { id: "M10", rate: 350, extra: "2", pence: "676" }, { id: "M11", rate: 350, extra: "1.625", pence: "549" },
    { id: "M12a", rate: 10000, adjustment: ["50", "1000"], extra: "2", pence: "21000" }, { id: "M12b", rate: 350, adjustment: ["0", "1"], extra: "1", pence: "350" },
    { id: "M13a", rate: 350, extra: "0.001", pence: "0" }, { id: "M13b", rate: 350, extra: "0.002", pence: "1" },
    { id: "M14a", rate: 1_000_000_000_000, extra: "1.03", pence: "993950000000" }, { id: "M14b", rate: 1_000_000_000_000, extra: "1.04", pence: "", error: "MONEY_OUT_OF_RANGE" },
  ];
  it.each(rows)("$id: extra quantity $extra at $rate p", row => {
    const [numerator, denominator] = row.adjustment ?? ["-35", "1000"];
    const run = () => priceSorLine({ version: "sor-line-pricing.v1", quantity: row.extra, rate: { pence: row.rate, currency: "GBP" }, adjustment: { numerator, denominator } });
    if (row.error) { expect(refusal(run)).toBe(row.error); return; }
    expect(String(run().pence)).toBe(row.pence);
  });
  it("M10: the excess is its own line (676p); the whole claim minus the instructed price would be 675p", () => {
    const price = (quantity: string) => String(priceSorLine({ version: "sor-line-pricing.v1", quantity, rate: { pence: 350, currency: "GBP" }, adjustment: { numerator: "-35", denominator: "1000" } }).pence);
    expect(price("2")).toBe("676"); expect(price("6")).toBe("2026"); expect(price("4")).toBe("1351");
    // 2026p - 1351p is the alternative reading; it is NOT what is stored. Written as text so no pence arithmetic happens here.
    expect(["2026", "1351"].join(" minus ")).toBe("2026 minus 1351");
  });
});
