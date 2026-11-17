import type { Pool } from "pg";
import { z } from "zod";
import { ContractorError } from "@jobguard/core";
import { ContractorRepository } from "./contractor-repository.js";
import { verifiedTenantContextFromMembership, type VerifiedTenantContext } from "./tenant-context.js";

/**
 * Shared contractor-session bridge: synthetic practice only, with no pilot or
 * production authority. Its sole export accepts two required parameters: the
 * server's own pg Pool (the same pool the caller's repositories use) and the
 * session value read by the transport from the jg_session cookie.
 *
 * It never accepts a tenant, membership, identity user, role, member description,
 * AuthenticatedMembership, requested tenant, request, headers, supplying callback,
 * or options/flag to skip or replace the session lookup. Only the session value
 * can influence which tenant comes out. There are no classes, module-level state
 * or caches in this file.
 *
 * In order and nothing more: refuse any JOBGUARD_ENV other than synthetic_demo
 * with ContractorError MODE_FORBIDDEN before database access; refuse any session
 * value that is not a string uuid with ContractorError UNAUTHENTICATED before
 * database access; resolve it through an instance of the merged
 * ContractorRepository using the caller's pool; pass that exact, unaltered member
 * to verifiedTenantContextFromMembership and return its very object whole.
 * The persisted session lookup is the only source of tenant and member. Unknown
 * session errors and database failures propagate unchanged. This file has exactly
 * one maker call and never rebuilds, spreads or alters the member.
 *
 * This proves only which company a persisted session belongs to; it grants
 * nothing. It deliberately does not check active membership or permissions:
 * audit export needs a revoked member's context to record its refusal. Every
 * caller keeps its database authorization checks unchanged.
 *
 * Callers bind the result to a const annotated VerifiedTenantContext under its
 * own name. They may pass it whole to a repository, return it whole from an
 * ordinary function/method, or read .tenantId as a value. They never retain it in
 * fields, containers, mutable bindings, caches or escaping closures; destructure,
 * spread, copy or use object helpers on it; compare or branch on it except a null
 * check; or return it from a closure passed as an argument. This bridge returns
 * the maker's result directly.
 */
export async function contractorSessionContext(pool: Pool, sessionId: string): Promise<VerifiedTenantContext> {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new ContractorError("MODE_FORBIDDEN");
  if (!z.string().uuid().safeParse(sessionId).success) throw new ContractorError("UNAUTHENTICATED");
  const member = await new ContractorRepository(pool).resolveSession(sessionId);
  return verifiedTenantContextFromMembership(member);
}
