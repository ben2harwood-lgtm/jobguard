import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { ContractorRepository, northsideFacts, northsideTargets, northsideName, seedNorthsideDemo, type NorthsideSeed } from "../src/index.js";
import { cluster, type Cluster } from "./extra-fixtures.js";

let c: Cluster;
beforeAll(async () => { vi.stubEnv("JOBGUARD_ENV", "synthetic_demo"); c = await cluster(); }, 240_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });

it("ENT11A-01 the generated contractor is seeded through commands: 3 clients, 40 operatives, 2,000 orders in the month, all counted back from the rows", async () => {
  const owner = await new ContractorRepository(c.runtime).startPractice(randomUUID());
  const started = Date.now();
  const seed: NorthsideSeed = await seedNorthsideDemo(c.runtime, owner);
  console.log("seed ms", Date.now() - started);
  const facts = await northsideFacts(c.runtime, owner);
  expect(facts).toMatchObject({ companyName: northsideName, clients: northsideTargets.clients, operatives: northsideTargets.operatives, ordersThisMonth: northsideTargets.ordersPerMonth, extras: 0 });
  expect(facts.orderValuePence).toBeGreaterThan(0);
  expect(seed.clientIds).toHaveLength(3);
  // Practice data only: every stored address ends in .invalid, and nothing is queued to go out.
  const emails = (await c.admin.query("SELECT email FROM app.contractor_member WHERE tenant_id=$1", [owner.tenantId])).rows.map(r => r.email as string);
  expect(emails.length).toBeGreaterThan(40); expect(emails.every(e => e.endsWith(".invalid"))).toBe(true);
  expect((await c.admin.query("SELECT count(*)::int n FROM app.action_outbox WHERE tenant_id=$1", [owner.tenantId])).rows[0].n).toBe(0);
  // A second call writes nothing.
  const audits = (await c.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1", [owner.tenantId])).rows[0].n;
  expect(await seedNorthsideDemo(c.runtime, owner)).toEqual(seed);
  expect((await c.admin.query("SELECT count(*)::int n FROM app.audit_event WHERE tenant_id=$1", [owner.tenantId])).rows[0].n).toBe(audits);
}, 600_000);
