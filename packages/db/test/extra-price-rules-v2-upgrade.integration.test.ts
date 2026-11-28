// EP-CC-S1 upgrade proof for 0784_extra_price_rules_v2.sql: prices made before the upgrade keep their stored answers and read their recorded basis,
// or "basis not recorded"; nothing is back-filled; a completed v1 command replays; a new or changed one is refused. Made-up data only.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { ExtraApprovalRepository, SiteExtraRepository, type AuthenticatedMembership } from "../src/index.js";
import { chainWorld, newJob, raiseOn, type ChainWorld } from "./extra-approval-chain-fixtures.js";
import { clusterBefore } from "./site-extra-pricing-fixtures.js";
import { testActorContext } from "./tenant-context-test-utils.js";

const own = "0784_extra_price_rules_v2.sql";
let c: Awaited<ReturnType<typeof clusterBefore>>, w: ChainWorld, repo: ExtraApprovalRepository;
const code = (p: Promise<unknown>) => p.then(() => "ok", (e: { code?: string; message?: string }) => e.code ?? e.message ?? String(e));
const as = async (m: AuthenticatedMembership) => testActorContext(c.admin, await w.ctx, m);
type Runner = { run: (...args: unknown[]) => Promise<Record<string, unknown>> };
type Db = { $client: { query: (s: string, a: unknown[]) => Promise<{ rows: Array<{ r: Record<string, unknown> }> }> } };

/** The pre-upgrade v1 PriceExtra transaction, exactly as the merged repository ran it: the same receipt lifecycle, xa_price and audit event. */
async function legacyPrice(actor: AuthenticatedMembership, jobId: string, extraId: string, netPence: number, commandId = randomUUID()) {
  const runner = repo as unknown as Runner;
  return runner.run(await as(actor), actor, "PriceExtra", commandId, `extra-price:${jobId}:${extraId}:${commandId}`, { jobId, extraId, netPence }, async (db: Db, _t: string, m: string) => {
    const r = (await db.$client.query("SELECT app.xa_price($1,$2,$3,$4,$5,false) r", [jobId, extraId, commandId, m, netPence])).rows[0]!.r;
    return { result: r, audits: [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${m}`, eventType: "contractor.extra.priced", subjectType: "extra", subjectRef: extraId,
      payload: { references: { command: commandId, job: jobId, extra: extraId, binding: String(r.bindingId), environment: "synthetic_demo" }, hashes: { revision: String(r.revisionHash) }, classifications: { action: "commercial" } } }] };
  }).then(result => ({ result, commandId }));
}

beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  c = await clusterBefore(own); w = await chainWorld(c); repo = new ExtraApprovalRepository(c.runtime);
}, 300_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });

it("0784 keeps pre-upgrade prices, replays a completed v1 command, refuses new or changed v1, and reads legacy basis honestly", async () => {
  expect((await c.admin.query("SELECT 1 FROM public.jobguard_schema_migration WHERE migration_name=$1", [own])).rows).toEqual([]);
  const surveyor = w.members.surveyor.member, operative = w.members.operative.member;
  // Before the upgrade: a manual v1 price, and an origin-bound server-priced capture.
  const manualJob = await newJob(c, w), manualExtra = await raiseOn(c, w, manualJob);
  const manual = await legacyPrice(surveyor, manualJob, manualExtra, 40000);
  expect(manual.result).toMatchObject({ netPence: 40000, bindingId: expect.any(String) });
  const sorJob = await newJob(c, w);
  const logged = await new SiteExtraRepository(c.runtime).logSorSiteExtra(await as(operative), operative, { commandId: randomUUID(), jobId: sorJob, sorCode: "CLEAR-GUTTER", quantity: "2", note: "Fictional pre-upgrade capture" });
  const supervisor = w.members.supervisor.member;
  await repo.submitExtra(await as(supervisor), supervisor, { version: "submit-extra.v1", commandId: randomUUID(), jobId: sorJob, extraId: logged.variationId });
  const legacyBasis = (await c.admin.query("SELECT row_to_json(b)::text t FROM app.extra_pricing_basis b WHERE tenant_id=$1 ORDER BY id", [w.p.tenantId])).rows;
  expect(legacyBasis).toHaveLength(1);
  const receipts = (await c.admin.query("SELECT row_to_json(r)::text t FROM app.command_receipt r WHERE tenant_id=$1 ORDER BY command_id", [w.p.tenantId])).rows;

  await c.migrate(); await c.migrate();
  expect((await c.admin.query("SELECT 1 FROM public.jobguard_schema_migration WHERE migration_name=$1", [own])).rows).toHaveLength(1);

  // No back-fill: the one legacy row keeps every original column and NULL in every v2 column; no basis is invented for the manual price.
  const after = (await c.admin.query("SELECT * FROM app.extra_pricing_basis WHERE tenant_id=$1", [w.p.tenantId])).rows;
  expect(after).toHaveLength(1);
  const original = JSON.parse(legacyBasis[0].t);
  for (const [k, v] of Object.entries(original)) expect(k === "server_recorded_at" ? new Date(after[0][k]).toISOString() : after[0][k], k).toEqual(k === "server_recorded_at" ? new Date(v as string).toISOString() : v);
  for (const k of Object.keys(after[0]).filter(k => !(k in original))) expect(after[0][k], k).toBeNull();
  expect((await c.admin.query("SELECT row_to_json(r)::text t FROM app.command_receipt r WHERE tenant_id=$1 ORDER BY command_id", [w.p.tenantId])).rows).toEqual(receipts);

  // The completed v1 command replays its stored answer; changed payloads conflict; a new v1 command is BASIS_REQUIRED and writes nothing.
  const v1 = { version: "price-extra.v1", commandId: manual.commandId, jobId: manualJob, extraId: manualExtra, netPence: 40000 };
  expect(await repo.priceExtra(await as(surveyor), surveyor, v1)).toEqual(manual.result);
  expect(await code(repo.priceExtra(await as(surveyor), surveyor, { ...v1, netPence: 40001 }))).toBe("COMMAND_CONFLICT");
  expect(await code(repo.priceExtra(await as(surveyor), surveyor, { version: "price-extra.v2", commandId: manual.commandId, jobId: manualJob, extraId: manualExtra,
    basis: { kind: "surveyor_quoted", netPence: 40000, method: "quotation", note: "Fictional" } }))).toBe("COMMAND_CONFLICT");
  const fresh = await newJob(c, w), freshExtra = await raiseOn(c, w, fresh);
  const count = async () => (await c.admin.query("SELECT (SELECT count(*) FROM app.extra_approval_revision_binding WHERE tenant_id=$1)::int b,(SELECT count(*) FROM app.command_receipt WHERE tenant_id=$1)::int r", [w.p.tenantId])).rows[0];
  const beforeNew = await count();
  expect(await code(repo.priceExtra(await as(surveyor), surveyor, { version: "price-extra.v1", commandId: randomUUID(), jobId: fresh, extraId: freshExtra, netPence: 40000 }))).toBe("BASIS_REQUIRED");
  expect(await code(legacyPrice(surveyor, fresh, freshExtra, 40000))).toBe("BASIS_REQUIRED");
  expect(await count()).toEqual(beforeNew);
  // Another member cannot borrow the completed receipt.
  expect(await code(repo.priceExtra(await as(supervisor), supervisor, v1))).toBe("COMMAND_CONFLICT");

  // Legacy reads: the server-priced capture shows its recorded basis; the manual v1 price reads "basis not recorded".
  const read = async (jobId: string, extraId: string) => (await repo.pricingBasis(await as(surveyor), surveyor, { version: "extra-pricing-basis-query.v1", jobId, extraId })).prices;
  expect(await read(manualJob, manualExtra)).toEqual([{ bindingId: manual.result.bindingId, logicalRevision: 1, netPence: 40000, basisStatus: "basis_not_recorded" }]);
  expect(await read(sorJob, logged.variationId)).toMatchObject([{ logicalRevision: 1, netPence: 676, basisStatus: "recorded",
    basis: { kind: "server_sor", source: "origin_capture", sorCode: "CLEAR-GUTTER", claimedQuantity: "2", pricedQuantity: "2", coverage: "new", adjustment: { numerator: "-35", denominator: "1000" } } }]);
});
