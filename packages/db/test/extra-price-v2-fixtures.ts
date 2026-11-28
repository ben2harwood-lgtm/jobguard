// Pricing contract v2 test inputs (docs/contracts/extra-price-rules-v2.md). Made-up values only. v1 bodies are refused BASIS_REQUIRED, so the shared
// fixtures that only need "a priced extra" give a surveyor_quoted basis; tests about rate codes build server_sor bases themselves.
import { randomUUID } from "node:crypto";

type Admin = { admin: { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> } };
type Amount = { commandId: string; jobId: string; extraId: string; netPence: number };
export const quotedBasis = (netPence: number) => ({ kind: "surveyor_quoted", netPence, method: "quotation", note: "Fictional surveyor quotation" }) as const;
/** A price-extra.v2 body for the given net, with a quoted basis. */
export const priceV2 = (i: Amount) => ({ version: "price-extra.v2" as const, commandId: i.commandId, jobId: i.jobId, extraId: i.extraId, basis: quotedBasis(i.netPence) });
/** A revise-extra.v2 body answering the extra's latest request: response_to_rejection when it was rejected, otherwise pricing_error. With no request a random id is answered (the command is then refused on its state). */
export async function reviseV2(c: Admin, i: Amount) {
  const latest = (await c.admin.query(`SELECT q.id,o.kind FROM app.extra_approval_request q LEFT JOIN app.extra_approval_outcome o ON(o.tenant_id,o.request_id)=(q.tenant_id,q.id)
    WHERE q.job_id=$1 AND q.variation_id=$2 ORDER BY q.request_revision DESC LIMIT 1`, [i.jobId, i.extraId])).rows[0] as { id: string; kind: string | null } | undefined;
  return { version: "revise-extra.v2" as const, commandId: i.commandId, jobId: i.jobId, extraId: i.extraId, basis: quotedBasis(i.netPence),
    reason: latest?.kind === "rejected" ? "response_to_rejection" as const : "pricing_error" as const, answersRequestId: latest?.id ?? randomUUID() };
}

type Actor = { tenantId: string; membershipId: string };
type Repo = { priceExtra: (ctx: any, actor: any, raw: unknown) => Promise<Record<string, unknown>>; reviseExtra: (ctx: any, actor: any, raw: unknown) => Promise<Record<string, unknown>> };
type Runner = { run: (...args: unknown[]) => Promise<Record<string, unknown>> };
type Db = { $client: { query: (s: string, a: unknown[]) => Promise<{ rows: Array<{ r: Record<string, unknown> }> }> } };
/** True once 0784 is installed. Upgrade fixtures that seed a predecessor schema price the way that schema did. */
export async function pricingV2Installed(c: Admin) {
  return (await c.admin.query("SELECT to_regproc('app.xa_price_v2') IS NOT NULL installed")).rows[0].installed as boolean;
}
/** Predecessor-schema seeding only: the merged v1 PriceExtra/ReviseExtra transaction (same receipt lifecycle, xa_price and audit event). */
export async function legacyPriceV1(repo: Repo, ctx: unknown, actor: Actor, revise: boolean, i: Amount) {
  const type = revise ? "ReviseExtra" : "PriceExtra", m = actor.membershipId.toLowerCase();
  return (repo as unknown as Runner).run(ctx, actor, type, i.commandId, `${revise ? "extra-revise" : "extra-price"}:${i.jobId}:${i.extraId}:${i.commandId}`, { jobId: i.jobId, extraId: i.extraId, netPence: i.netPence },
    async (db: Db) => {
      const r = (await db.$client.query(`SELECT app.xa_price($1,$2,$3,$4,$5,${revise}) r`, [i.jobId, i.extraId, i.commandId, m, i.netPence])).rows[0]!.r;
      const refs = revise ? { request: String(r.requestId) } : { binding: String(r.bindingId) };
      return { result: r, audits: [{ id: randomUUID(), version: "audit.v1", actorRef: `membership:${m}`, eventType: revise ? "contractor.extra.revised" : "contractor.extra.priced", subjectType: "extra", subjectRef: i.extraId,
        payload: { references: { command: i.commandId, job: i.jobId, extra: i.extraId, ...refs, environment: "synthetic_demo" }, hashes: { revision: String(r.revisionHash) }, classifications: { action: "commercial" } } }] };
    });
}
/** Price a fixture extra with a quoted basis (or, on a predecessor schema, the way it priced). */
export async function fixturePrice(c: Admin, repo: Repo, ctx: unknown, actor: Actor, i: Amount) {
  return await pricingV2Installed(c) ? repo.priceExtra(ctx, actor, priceV2(i)) : legacyPriceV1(repo, ctx, actor, false, i);
}
export async function fixtureRevise(c: Admin, repo: Repo, ctx: unknown, actor: Actor, i: Amount) {
  return await pricingV2Installed(c) ? repo.reviseExtra(ctx, actor, await reviseV2(c, i)) : legacyPriceV1(repo, ctx, actor, true, i);
}
