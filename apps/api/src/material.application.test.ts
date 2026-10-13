import type { Pool } from "pg";
import { afterEach, expect, it, vi } from "vitest";
import { MaterialApplication } from "./material.application.js";

const jobId = "18000000-0000-4000-8000-000000000002";
const session = "18000000-0000-4000-8000-000000000001";
const tenantId = "11111111-1111-4111-8111-111111111111";
const scopeItemId = "18000000-0000-4000-8000-000000000003";
type Rate = {
 id: string; merchantId: string; skuId: string; version: number;
 pricePence: string; priceUnit: string; taxBasis: string;
 effectiveFrom: string; effectiveTo: string | null; sourceLabel: string;
};

/** Narrow SQL fixture, not a PostgreSQL emulator or an RLS/concurrency proof.
 * Writes use the real application/repository. The read fixture models validity
 * and the conversion cutoff used by the repository's actual SELECT.
 */
function fixture() {
 const merchants: { id: string; name: string }[] = [];
 const skus: { id: string; merchantId: string; sku: string; description: string }[] = [];
 const rates: Rate[] = [];
 const packs: { skuId: string; unit: string; quantity: string; from: string }[] = [];
 const requirements: { id: string; scopeItemId: string; skuId: string; quantity: string; unit: string; revision: number }[] = [];
 const query = vi.fn(async (sql: string, values: unknown[] = []): Promise<{ rows: object[] }> => {
  if (sql.includes("authenticate_practice_session")) return { rows: [{ tenant_id: tenantId, membership_id: scopeItemId, identity_user_id: session }] };
  if (sql.includes("WITH RECURSIVE practice_owned_job")) return { rows: [{ id: jobId }] };
  if (/^(BEGIN|COMMIT|ROLLBACK)$/u.test(sql) || sql.includes("set_config")) return { rows: [] };
  const v = values as string[];
  if (sql.startsWith("SELECT m.id")) {
   const merchant = merchants.find(m => m.name.toLowerCase() === v[1]!.toLowerCase());
   const sku = skus.find(s => s.merchantId === merchant?.id && s.sku === v[2]);
   return { rows: sku ? [{ merchantId: merchant!.id, skuId: sku.id, version: Math.max(0, ...rates.filter(r => r.skuId === sku.id).map(r => r.version)) }] : [] };
  }
  if (sql.startsWith("INSERT INTO app.merchant(")) merchants.push({ id: v[0]!, name: v[2]! });
  else if (sql.startsWith("INSERT INTO app.merchant_sku(")) skus.push({ id: v[0]!, merchantId: v[2]!, sku: v[3]!, description: v[4]! });
  else if (sql.startsWith("INSERT INTO app.material_pack_conversion(")) packs.push({ skuId: v[2]!, unit: v[3]!, quantity: v[4]!, from: v[5]! });
  else if (sql.startsWith("INSERT INTO app.material_rate_revision(")) rates.push({ id: v[0]!, merchantId: v[2]!, skuId: v[3]!, version: Number(values[4]), pricePence: String(values[5]), priceUnit: v[6]!, taxBasis: v[7]!, effectiveFrom: v[8]!, effectiveTo: v[9] ?? null, sourceLabel: v[10]! });
  else if (sql.startsWith("SELECT coalesce(max(revision)")) return { rows: [{ revision: Math.max(0, ...requirements.filter(r => r.scopeItemId === v[2]).map(r => r.revision)) }] };
  else if (sql.startsWith("INSERT INTO app.material_requirement(")) requirements.push({ id: v[0]!, scopeItemId: v[3]!, skuId: v[4]!, quantity: v[5]!, unit: v[6]!, revision: Number(values[7]) });
  else if (sql.startsWith("SELECT q.id")) {
   // Refuse unexpected SQL rather than silently simulating a successful fix.
   const cutoff = sql.match(/p\.effective_from<=([^ ]+)/u)?.[1];
   if (cutoff !== "$3" && cutoff !== "r.effective_from") throw new Error("Unsupported conversion cutoff in SQL fixture");
   return { rows: requirements.flatMap(q => {
    const sku = skus.find(s => s.id === q.skuId)!;
    const merchant = merchants.find(m => m.id === sku.merchantId)!;
    const active = rates.filter(r => r.skuId === sku.id && r.effectiveFrom <= v[2]! && (!r.effectiveTo || r.effectiveTo >= v[2]!));
    return active.map(rate => {
     const anchor = cutoff === "$3" ? v[2]! : rate.effectiveFrom;
     const pack = packs.filter(p => p.skuId === sku.id && p.unit === rate.priceUnit && p.from <= anchor).sort((a, b) => b.from.localeCompare(a.from))[0];
     return { ...q, merchant: merchant.name, sku: sku.sku, description: sku.description, rateId: rate.id, rateVersion: rate.version, pricePence: rate.pricePence, priceUnit: rate.priceUnit, taxBasis: rate.taxBasis, effectiveFrom: rate.effectiveFrom, effectiveTo: rate.effectiveTo, sourceLabel: rate.sourceLabel, packEachQuantity: pack?.quantity ?? null };
    });
   }) };
  } else throw new Error(`Unsupported SQL fixture query: ${sql}`);
  return { rows: [] };
 });
 const pool = { query, connect: async () => ({ query, release: vi.fn() }) } as unknown as Pool;
 return new MaterialApplication(pool, session);
}

const rateCommand = {
 version: "material-rate-command.v1", merchantName: "Fictional audit merchant", sku: "AUDIT-SKU",
 description: "Synthetic material", pricePence: 2400, priceUnit: "each", taxBasis: "net",
 effectiveFrom: "2026-10-01", sourceLabel: "synthetic audit fixture", expectedVersion: 0,
};
async function requireTen(app: MaterialApplication, skuId: string) {
 await app.addRequirement(jobId, { version: "material-requirement-command.v1", scopeItemId, skuId, quantity: "10", unit: "each", expectedRevision: 0 });
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

it("gross_agreement_requires_tax_review", async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-08T12:00:00Z"));
 const app = fixture();
 const rate = await app.addRate({ ...rateCommand, taxBasis: "gross" });
 await requireTen(app, rate.skuId);
 const result = await app.view(jobId);
 expect(result.materials).toHaveLength(1);
 expect(result.materials[0]).toMatchObject({ status: "review", taxBasis: "gross", reason: "Tax basis needs review" });
 expect(result.materials[0]).not.toHaveProperty("netPence");
 expect(result.materials[0]).not.toHaveProperty("eachPence");
});

it("expired_offer_does_not_change_remaining_agreement", async () => {
 vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
 vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-08T12:00:00Z"));
 const app = fixture();
 const v1 = await app.addRate({ ...rateCommand, pricePence: 10000, priceUnit: "box", packEachQuantity: "5" });
 await app.addRate({ ...rateCommand, pricePence: 10000, priceUnit: "box", packEachQuantity: "10", effectiveFrom: "2026-10-05", effectiveTo: "2026-10-07", expectedVersion: 1 });
 await requireTen(app, v1.skuId);
 const result = await app.view(jobId);
 expect(result.asOf).toBe("2026-10-08");
 expect(result.materials).toHaveLength(1);
 expect(result.materials[0]).toMatchObject({ status: "applicable", rateId: v1.id, rateVersion: 1, packEachQuantity: "5", eachPence: 2000, netPence: 20000 });
});
