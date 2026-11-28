import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { ExtraApprovalRepository, canonicalJson, withTenant, type AuthenticatedMembership } from "../src/index.js";
import { beginRepositoryCommand } from "../src/repository-command.js";
import { chainWorld, cluster, newJob, raiseOn, submitted, approveInput, command, chain, type Cluster, type ChainWorld } from "./extra-approval-chain-fixtures.js";
import { testActorContext, testTenantContext } from "./tenant-context-test-utils.js";
import { legacyPriceV1, quotedBasis } from "./extra-price-v2-fixtures.js";

let c: Cluster, w: ChainWorld, repo: ExtraApprovalRepository;
const migration = new URL("../migrations/0752_extra_price_permission_order.sql", import.meta.url);
// Pricing contract v2: the repository methods take v2 bodies. The unchanged v1 writer app.xa_price is still runtime-executable, so its
// refusal order stays pinned through the merged v1 lifecycle (legacyPriceV1), exactly as the predecessor repository reached it.
const methods = [["priceExtra", "price-extra.v2"], ["reviseExtra", "revise-extra.v2"]] as const;
const code = (p: Promise<unknown>) => p.then(() => "ok", (e: { code?: string }) => e.code ?? String(e));
const actorContext = (actor: AuthenticatedMembership) => testActorContext(c.admin, w.ctx, actor);
const input = (version: string, jobId: string, extraId: string, netPence = 40000, answersRequestId: string = randomUUID()) =>
  ({ version, commandId: randomUUID(), jobId, extraId, basis: quotedBasis(netPence), ...(version === "revise-extra.v2" ? { reason: "pricing_error", answersRequestId } : {}) });
const priceDefinition = async () => (await c.admin.query(`SELECT pg_get_functiondef('app.xa_price(uuid,uuid,uuid,uuid,bigint,boolean)'::regprocedure) definition`)).rows[0].definition as string;

// Snapshot complete persisted rows, including receipts, completion binding and audit.
async function snapshot() {
  const result: Record<string, unknown> = {};
  for (const table of ["variation", "variation_revision", "extra_origin", "extra_event", "extra_duplicate_link",
    "extra_approval_revision_binding", "extra_approval_request", "extra_approval_step_fact", "extra_approval_outcome",
    "decision", "decision_resolution", "action_authorization", "action_outbox", "command_receipt", "command_lifecycle_claim", "audit_event"]) {
    result[table] = (await c.admin.query(`SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb) rows FROM app.${table} r WHERE tenant_id=$1`, [w.p.tenantId])).rows[0].rows;
  }
  return result;
}

beforeAll(async () => {
  vi.stubEnv("JOBGUARD_ENV", "synthetic_demo");
  c = await cluster(); w = await chainWorld(c); repo = new ExtraApprovalRepository(c.runtime);
}, 300_000);
afterAll(async () => { await c?.close(); vi.unstubAllEnvs(); });

it("R183 admission witness: predecessor leaks through the real repository, repaired order closes it, restoring it fails the regression", async () => {
  const jobId = await newJob(c, w), existing = await raiseOn(c, w, jobId), absent = randomUUID();
  const actor = w.members.supervisor.member, context = await actorContext(actor);
  const oldSql = await readFile(new URL("../migrations/0749_lp6d_remaining_routines.sql", import.meta.url), "utf8");
  const oldDefinition = oldSql.match(/CREATE OR REPLACE FUNCTION app\.xa_price\([\s\S]*?\n\$\$;/u)![0];
  const before = await snapshot(), installed = await priceDefinition();
  async function refusals() {
    const results = [];
    for (const revise of [false, true]) {
      results.push(await code(legacyPriceV1(repo, context, actor, revise, { commandId: randomUUID(), jobId, extraId: existing, netPence: 40000 })));
      results.push(await code(legacyPriceV1(repo, context, actor, revise, { commandId: randomUUID(), jobId, extraId: absent, netPence: 40000 })));
    }
    return results;
  }
  const denied = Array<string>(4).fill("PERMISSION_DENIED");
  const assertDenied = (results: string[]) => expect(results).toEqual(denied);
  try {
    // No fabricated receipts, elevated business caller or route pre-gate: only the
    // isolated test database's routine definition is temporarily restored.
    await c.admin.query(oldDefinition);
    const leaked = await refusals();
    expect(leaked).toEqual(["PERMISSION_DENIED", "NOT_FOUND", "PERMISSION_DENIED", "NOT_FOUND"]);
    expect(leaked).not.toEqual(denied);
    expect(await snapshot()).toEqual(before);
    await c.admin.query(await readFile(migration, "utf8"));
    assertDenied(await refusals());
    expect(await snapshot()).toEqual(before);
    expect(await priceDefinition()).toBe(installed);
    // Mutation witness: the very same regression expectation rejects the old order.
    await c.admin.query(oldDefinition);
    const mutant = await refusals();
    expect(() => assertDenied(mutant)).toThrow();
  } finally {
    await c.admin.query(await readFile(migration, "utf8"));
  }
  assertDenied(await refusals());
  // The v2 repository methods refuse the same actor before disclosing existence too.
  for (const [method, version] of methods) for (const extraId of [existing, absent])
    expect(await code(repo[method](context, actor, input(version, jobId, extraId)))).toBe("PERMISSION_DENIED");
  expect(await snapshot()).toEqual(before);
});

it("R183 checked admission reaches xa_price for the same bound non-pricing actor/job in price and revise", async () => {
  const jobId = await newJob(c, w), existing = await raiseOn(c, w, jobId);
  const actor = w.members.supervisor.member, context = await actorContext(actor), before = await snapshot();
  for (const revise of [false, true]) for (const extraId of [existing, randomUUID()]) {
    const commandId = randomUUID(), commandType = revise ? "ReviseExtra" : "PriceExtra";
    let admitted = false;
    await expect(withTenant(c.runtime, context, async tx => {
      const result = await beginRepositoryCommand(tx, { tenantId: w.p.tenantId, actorMembershipId: actor.membershipId,
        commandId, commandType, semanticKey: `extra-${revise ? "revise" : "price"}:${jobId}:${extraId}:${commandId}`, jobId,
        legacyJson: canonicalJson({ type: commandType, actor: actor.membershipId, content: { jobId, extraId, netPence: 40000 } }) });
      expect(result.kind).toBe("claim");
      const bound = (await tx.$client.query(`SELECT app.current_actor() actor, r.status FROM app.command_receipt r WHERE command_id=$1`, [commandId])).rows[0];
      expect(bound).toEqual({ actor: actor.membershipId, status: "processing" });
      admitted = true;
      await tx.$client.query("SELECT app.xa_price($1,$2,$3,$4,$5,$6)", [jobId, extraId, commandId, actor.membershipId, 40000, revise]);
    })).rejects.toMatchObject({ message: "PERMISSION_DENIED", code: "42501" });
    expect(admitted).toBe(true);
    expect(await snapshot()).toEqual(before);
  }
});

it("R183 authorised surveyor still prices, revises, replays and gets NOT_FOUND only for missing targets", async () => {
  const actor = w.members.surveyor.member, context = await actorContext(actor);
  const jobId = await newJob(c, w), extraId = await raiseOn(c, w, jobId);
  const origin = (await c.admin.query("SELECT to_jsonb(o) origin FROM app.extra_origin o WHERE variation_id=$1", [extraId])).rows;
  // The unchanged v1 writer reaches its checks but cannot commit a price without a basis.
  expect(await code(legacyPriceV1(repo, context, actor, false, { commandId: randomUUID(), jobId, extraId, netPence: 40000 }))).toBe("BASIS_REQUIRED");
  expect(await code(repo.priceExtra(context, actor, { version: "price-extra.v1", commandId: randomUUID(), jobId, extraId, netPence: 40000 }))).toBe("BASIS_REQUIRED");
  const price = input("price-extra.v2", jobId, extraId);
  const priced = await repo.priceExtra(context, actor, price);
  expect(priced).toMatchObject({ netPence: 40000, bindingId: expect.any(String), revisionId: expect.any(String) });
  const afterPrice = await snapshot();
  expect(await repo.priceExtra(context, actor, price)).toEqual(priced);
  expect(await snapshot()).toEqual(afterPrice);
  expect(await code(repo.priceExtra(context, actor, { ...price, basis: quotedBasis(40001) }))).toBe("COMMAND_CONFLICT");
  expect(await code(repo.priceExtra(context, actor, input("price-extra.v2", jobId, extraId)))).toBe("INVALID_TRANSITION");
  for (const [method, version] of methods) {
    expect(await code(repo[method](context, actor, input(version, jobId, randomUUID())))).toBe("NOT_FOUND");
    // A genuine extra on another valid, covered job is still absent on this job.
    const wrongJob = await newJob(c, w);
    expect(await code(repo[method](context, actor, input(version, wrongJob, extraId)))).toBe("NOT_FOUND");
    for (const net of [0, -1, 1.5, 1_000_000_000_001])
      expect(await code(repo[method](context, actor, input(version, jobId, extraId, net)))).toBe("INVALID_COMMAND");
    expect(await code(repo[method](context, actor, { ...input(version, jobId, extraId), basis: undefined }))).toBe("BASIS_REQUIRED");
  }
  expect((await c.admin.query("SELECT to_jsonb(o) origin FROM app.extra_origin o WHERE variation_id=$1", [extraId])).rows).toEqual(origin);
  const s = await submitted(c, w, 40000), supervisor = w.members.supervisor.member;
  await repo.approveExtraStep(await actorContext(supervisor), supervisor, approveInput(s, 0));
  const revise = input("revise-extra.v2", s.jobId, s.extraId, 60000, s.requestId);
  const revised = await repo.reviseExtra(context, actor, revise);
  expect(revised).toMatchObject({ state: "awaiting_approval", requestRevision: 2, netPence: 60000 });
  expect(await repo.reviseExtra(context, actor, revise)).toEqual(revised);
  const otherApprover = w.supervisor2.member;
  expect(await code(repo.approveExtraStep(await actorContext(otherApprover), otherApprover, approveInput(s, 0)))).toBe("STALE_REVISION");
  expect(await chain(c, w)).toBeTruthy();
});

it("R183 binding, revoked membership, uncovered surveyor and foreign tenant refusals remain closed", async () => {
  const jobId = await newJob(c, w), extraId = await raiseOn(c, w, jobId);
  const surveyor = w.members.surveyor.member, context = await actorContext(surveyor);
  const foreign = await chainWorld(c), foreignActor = foreign.members.surveyor.member;
  for (const [method, version] of methods) {
    const i = input(version, jobId, extraId);
    expect(await code(repo[method](testTenantContext(w.p.tenantId, { membershipId: surveyor.membershipId, bindRequest: false }), surveyor, i))).toBe("PERMISSION_DENIED");
    expect(await code(repo[method](context, w.members.supervisor.member, i))).toBe("PERMISSION_DENIED");
    const uncovered = w.otherSurveyor.member;
    expect(await code(repo[method](await actorContext(uncovered), uncovered, i))).toBe("PERMISSION_DENIED");
    expect(await code(repo[method](await testActorContext(c.admin, foreign.ctx, foreignActor), foreignActor, i))).toBe("NOT_FOUND");
    expect(await code(repo[method](context, foreignActor, i))).toBe("PERMISSION_DENIED");
  }
  // Revoke a separate surveyor so other cases retain their original authority.
  const revoked = w.otherSurveyor.member, revokedContext = await actorContext(revoked);
  await command(c, w, { kind: "membership.revoke", membershipId: revoked.membershipId });
  const before = await snapshot();
  for (const [method, version] of methods)
    expect(await code(repo[method](revokedContext, revoked, input(version, w.otherJob, randomUUID())))).toBe("PERMISSION_DENIED");
  expect(await snapshot()).toEqual(before);
});

it("R183 fresh installed metadata and populated rows survive repeat forward migration", async () => {
  const metadata = async () => (await c.admin.query(`SELECT pg_get_userbyid(proowner) owner,proacl,provolatile,prosecdef,proconfig FROM pg_proc WHERE oid='app.xa_price(uuid,uuid,uuid,uuid,bigint,boolean)'::regprocedure`)).rows;
  const before = await snapshot(), meta = await metadata(), definition = await priceDefinition();
  expect(meta[0]).toMatchObject({ owner: "jobguard_migration", provolatile: "v", prosecdef: true, proconfig: ["search_path=pg_catalog"] });
  await c.admin.query(await readFile(migration, "utf8"));
  expect(await snapshot()).toEqual(before);
  expect(await metadata()).toEqual(meta);
  expect(await priceDefinition()).toBe(definition);
});
