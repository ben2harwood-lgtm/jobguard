import type { Pool } from "pg";
import { beforeEach, expect, it, vi } from "vitest";
import { ConnectorPromotionRepository } from "./connector-promotion-repository.js";

const f = vi.hoisted(() => ({ query: vi.fn(), context: { tenantId: "fictional-tenant" }, session: vi.fn() }));
vi.mock("./contractor-session-context.js", () => ({ contractorSessionContext: f.session }));
vi.mock("./tenant-context.js", () => ({ withTenant: async (_pool: unknown, _context: unknown, work: (db: unknown) => unknown) => work({ $client: { query: f.query } }) }));
const pool = {} as Pool;
const good = { namespace: "fixture:demo", eventId: "fixture:event", kind: "work_order", subject: "fixture:demo-orders",
  revision: 1, document: "fixture:starter_orders", result: null, hold: null };
beforeEach(() => { f.query.mockReset(); f.session.mockReset().mockResolvedValue(f.context); });
it.each([
  { ...good, revision: "1" },
  { ...good, namespace: "real:demo" },
  { ...good, eventId: "fixture:event\n" },
  { ...good, subject: "real:orders" },
  { ...good, document: "real:orders" },
  { ...good, extra: "unexpected" },
  null,
])("keeps the valid promotion and omits an invalid row: %j", async bad => {
  f.query.mockResolvedValue({ rows: [{ value: [bad, good] }] });
  expect(await new ConnectorPromotionRepository(pool).list("fictional-session")).toEqual([good]);
  expect(f.session).toHaveBeenCalledWith(pool, "fictional-session");
  expect(f.query).toHaveBeenCalledExactlyOnceWith("SELECT app.connector_promotion($1,$2,$3,NULL,NULL) value", ["fictional-session", null, null]);
});
it("still refuses a malformed list envelope", async () => {
  f.query.mockResolvedValue({ rows: [{ value: { event: good } }] });
  await expect(new ConnectorPromotionRepository(pool).list("fictional-session")).rejects.toBeDefined();
});
it("validates an optional import identity without accepting money or authority", async () => {
  const { connectorPromotionV1 } = await import("./connector-promotion-repository.js");
  const input = {version:"connector-promotion.v1",namespace:good.namespace,eventId:good.eventId};
  expect(connectorPromotionV1.safeParse(input).success).toBe(true);
  expect(connectorPromotionV1.safeParse({...input,billingImport:"00000000-0000-4000-8000-000000000001"}).success).toBe(true);
  for (const extra of [{billingImport:"not-an-import"},{billingImport:null},{paid:true},{amount:100},{tenantId:"other"}]) {
    expect(connectorPromotionV1.safeParse({...input,...extra}).success).toBe(false);
  }
});
it("sends only the selected import identity to SQL and rechecks SQL even on replay", async () => {
  const { ContractorRepository } = await import("./contractor-repository.js");
  const principal = vi.spyOn(ContractorRepository.prototype,"resolveSession").mockResolvedValue({} as Awaited<ReturnType<InstanceType<typeof ContractorRepository>["resolveSession"]>>);
  const billingImport = "00000000-0000-4000-8000-000000000001", result = {version:"connector-billing-status-link.v1",billingImport};
  try {
    f.query.mockResolvedValueOnce({rows:[{value:[{...good,kind:"billing_status",result,hold:"BILLING_COMPOSITION_REQUIRED"}]}]})
      .mockResolvedValueOnce({rows:[{value:result}]});
    expect(await new ConnectorPromotionRepository(pool).promote("fictional-session",{version:"connector-promotion.v1",namespace:good.namespace,eventId:good.eventId,billingImport})).toEqual(result);
    expect(f.query.mock.calls[1]![0]).toBe("SELECT app.connector_promotion($1,$2,$3,$4,$5::jsonb) value");
    expect(f.query.mock.calls[1]![1][4]).toBe(JSON.stringify(result));
  } finally { principal.mockRestore(); }
});
it("keeps the missing-import refusal and rejects imports supplied for other event kinds", async () => {
  const { ContractorRepository } = await import("./contractor-repository.js");
  const principal = vi.spyOn(ContractorRepository.prototype,"resolveSession").mockResolvedValue({} as Awaited<ReturnType<InstanceType<typeof ContractorRepository>["resolveSession"]>>);
  try {
    const input = {version:"connector-promotion.v1",namespace:good.namespace,eventId:good.eventId};
    f.query.mockResolvedValue({rows:[{value:[{...good,kind:"billing_status"}]}]});
    await expect(new ConnectorPromotionRepository(pool).promote("fictional-session",input)).rejects.toMatchObject({code:"INVALID_COMMAND"});
    expect(f.query).toHaveBeenCalledTimes(1);
    f.query.mockClear().mockResolvedValue({rows:[{value:[good]}]});
    await expect(new ConnectorPromotionRepository(pool).promote("fictional-session",{...input,billingImport:"00000000-0000-4000-8000-000000000001"})).rejects.toMatchObject({code:"INVALID_COMMAND"});
    expect(f.query).toHaveBeenCalledTimes(1);
  } finally { principal.mockRestore(); }
});
it("preserves the latest promotion body outside the billing link branch and keeps its authority proof", async () => {
  const { readFile } = await import("node:fs/promises");
  const previous = await readFile(new URL("../migrations/0639_connector_promotion.sql",import.meta.url),"utf8");
  const current = await readFile(new URL("../migrations/0689_connector_billing_status_promotion.sql",import.meta.url),"utf8");
  const refusal = "   IF e.kind='billing_status' THEN RAISE EXCEPTION 'BILLING_COMPOSITION_REQUIRED'; END IF;";
  const start = current.indexOf("   IF e.kind='billing_status' THEN\n"), end = current.indexOf("    RETURN p_result;\n   END IF;",start) + "    RETURN p_result;\n   END IF;".length;
  expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
  const branch = current.slice(start,end);
  for (const guard of ["app.cb_authority(p_session,job,true)","cr.command_type='ImportBillingStatus'","cr.status='succeeded'",
    "f.source_event_id=e.event_id","f.payload->>'factType'=e.payload->>'status'","prior.result<>p_result",
    "pr.result->>'billingImport'=p_result->>'billingImport'"]) expect(branch).toContain(guard);
  const restored = current.slice(current.indexOf("CREATE OR REPLACE FUNCTION"),start) + refusal + current.slice(end,current.indexOf("COMMIT;"));
  const original = previous.slice(previous.indexOf("CREATE FUNCTION app.connector_promotion("),previous.indexOf("-- Forward fix:")).replace("CREATE FUNCTION","CREATE OR REPLACE FUNCTION");
  expect(restored).toBe(original);
  const proof = JSON.parse(await readFile(new URL("../test/migration-proofs/0689_connector_billing_status_promotion.proof.json",import.meta.url),"utf8"));
  expect(proof.lp0[0].after.staticCalls).toEqual([...proof.lp0[0].before.staticCalls,"app.cb_authority"].sort());
  expect(proof.upgrade).toEqual([]); expect(proof.tenancy).toEqual([]);
});
it("0950 preserves the latest routine except its status guard and explicit human fact pairs", async () => {
  const { readFile } = await import("node:fs/promises");
  const previous = await readFile(new URL("../migrations/0689_connector_billing_status_promotion.sql",import.meta.url),"utf8");
  const current = await readFile(new URL("../migrations/0950_connector_billing_kind_link.sql",import.meta.url),"utf8");
  const pairs = "((e.payload->>'status'='paid' AND f.payload->>'factType'='paid')\n" +
    "         OR (e.payload->>'status'='billed' AND f.payload->>'factType'='invoiced')\n" +
    "         OR (e.payload->>'status'='reversed' AND f.payload->>'factType' IN('payment_reversed','credited')))";
  expect(current).toContain(pairs);
  expect(current).toContain("e.payload->>'status' NOT IN('billed','paid','reversed')");
  const restored = current.replace(pairs,"f.payload->>'factType'=e.payload->>'status'")
    .replace("e.payload->>'status' NOT IN('billed','paid','reversed')","e.payload->>'status' NOT IN('invoiced','credited','paid','payment_reversed','rejected')");
  expect(restored.slice(restored.indexOf("CREATE OR REPLACE FUNCTION"))).toBe(previous.slice(previous.indexOf("CREATE OR REPLACE FUNCTION")));
  const proof = JSON.parse(await readFile(new URL("../test/migration-proofs/0950_connector_billing_kind_link.proof.json",import.meta.url),"utf8"));
  const parentProof = JSON.parse(await readFile(new URL("../test/migration-proofs/0689_connector_billing_status_promotion.proof.json",import.meta.url),"utf8"));
  expect(proof.migration).toBe("0950_connector_billing_kind_link.sql");
  expect(proof.lp0).toEqual([{section:"routines",before:parentProof.lp0[0].after,after:parentProof.lp0[0].after}]);
  expect(proof.upgrade).toEqual([]); expect(proof.tenancy).toEqual([]);
});
