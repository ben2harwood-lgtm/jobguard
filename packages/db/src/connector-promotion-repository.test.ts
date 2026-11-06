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
