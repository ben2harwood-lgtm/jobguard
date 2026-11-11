import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { verifiedTenantContextFromMembership } from "../src/tenant-context.js";

// Only these explicitly synthetic contexts are upgraded by the integration setup.
// Production constructors, queued jobs and direct-SQL attack clients are untouched.
const syntheticContexts = new WeakMap<object, { membershipId: string }>();
const resolvedContexts = new WeakMap<object, WeakMap<object, ReturnType<typeof testTenantContext>>>();
export function testTenantContext(tenantId: string, options: { membershipId?: string; bindRequest?: boolean; bound?: boolean } = {}) {
  // Production contexts expose only tenantId; retain the exact constructor
  // membership in this test-only recipe rather than discovering an actor later.
  const membershipId = options.membershipId ?? "40000000-0000-4000-8000-000000000004";
  const context = verifiedTenantContextFromMembership({
    identityUserId: "30000000-0000-4000-8000-000000000003",
    membershipId,
    tenantId,
  } as Parameters<typeof verifiedTenantContextFromMembership>[0]);
  if (options.bindRequest !== false && options.bound !== false) syntheticContexts.set(context, { membershipId });
  return context;
}

export function needsTestRequestBinding(context: object) { return syntheticContexts.has(context); }

/** Bind only the membership named when the synthetic context was constructed.
 * No member (including a deliberately foreign tenant) stays unbound and fails
 * through the original routine. Never replace an explicit credential/context. */
export async function bindTestTenantContext(owner: Pool, context: ReturnType<typeof testTenantContext>, databaseScope: object = owner) {
  const recipe = syntheticContexts.get(context);
  if (!recipe) return context;
  const previous = resolvedContexts.get(context)?.get(databaseScope);
  if (previous) return previous;
  const installed = (await owner.query("SELECT to_regprocedure('app.bind_request(text,text,uuid)') installed")).rows[0].installed;
  if (!installed) return context;
  const member = (await owner.query<{ id: string }>(`SELECT id FROM app.membership
    WHERE tenant_id=$1 AND id=$2 AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at>clock_timestamp())`, [context.tenantId, recipe.membershipId])).rows[0];
  if (!member) return context;
  const bound = await testBoundTenantContext(owner, context.tenantId, member.id);
  const scopes = resolvedContexts.get(context) ?? new WeakMap();
  scopes.set(databaseScope, bound);
  resolvedContexts.set(context, scopes);
  return bound;
}

/** Real persisted credential and membership bridge for synthetic command fixtures. */
export async function testBoundTenantContext(owner: Pool, tenantId: string, membershipId: string, credential = createHash("sha256").update(`lp6-test:${tenantId}:${membershipId}`).digest("hex")) {
  const member = (await owner.query<{ identity_user_id: string }>(
    "SELECT identity_user_id FROM app.membership WHERE tenant_id=$1 AND id=$2", [tenantId, membershipId],
  )).rows[0];
  if (!member) throw new Error("Synthetic fixture membership missing");
  // Reuse the original session even if a test revoked/expired it. Provisioning
  // must never repair authority that a refusal test deliberately removed.
  const existing = (await owner.query("SELECT 1 FROM identity.session WHERE token_digest=$1", [credential])).rows[0];
  if (!existing) {
    await owner.query("INSERT INTO identity.user_email(email,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [`${member.identity_user_id}@fictional.invalid`, member.identity_user_id]);
    await owner.query("INSERT INTO identity.membership_locator(user_id,tenant_id,membership_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
      [member.identity_user_id, tenantId, membershipId]);
    await owner.query("INSERT INTO identity.session(id,user_id,environment,token_digest,csrf_token,expires_at) VALUES($1,$2,'synthetic_demo',$3,'fictional',clock_timestamp()+interval '1 hour') ON CONFLICT DO NOTHING",
      [randomUUID(), member.identity_user_id, credential]);
  }
  return verifiedTenantContextFromMembership({ identityUserId: member.identity_user_id, tenantId, membershipId } as Parameters<typeof verifiedTenantContextFromMembership>[0], { kind: "real", credential });
}

/** Bind each synthetic actor independently; old-schema fixtures retain their old context.
 * A foreign actor keeps the caller's tenant context so isolation attacks stay attacks. */
export async function testActorContext(owner: Pool, context: ReturnType<typeof testTenantContext>, actor: { tenantId: string; membershipId: string }) {
  if (actor.tenantId !== context.tenantId) return context;
  const installed = (await owner.query("SELECT to_regprocedure('app.bind_request(text,text,uuid)') installed")).rows[0].installed;
  return installed ? testBoundTenantContext(owner, context.tenantId, actor.membershipId) : context;
}

/** Bind one fixture actor's real persisted credential into a caller-managed transaction
 * (a raw client that already ran BEGIN), exactly as withTenant binds it. */
export async function bindTestClient(owner: Pool, client: { query: Pool["query"] }, tenantId: string, membershipId: string) {
  const credential = createHash("sha256").update(`lp6-test:${tenantId}:${membershipId}`).digest("hex");
  await testBoundTenantContext(owner, tenantId, membershipId, credential);
  await client.query("SELECT app.bind_request('real',$1,$2)", [credential, tenantId]);
}
