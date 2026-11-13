import { createHash, createHmac, randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { withTenant, type VerifiedTenantContext } from "./tenant-context.js";
import { authenticatePracticeSession, PracticeAccessError } from "./practice-session.js";

export const blankPracticeCompanyCommandV1 = z.object({
  version: z.literal("blank-practice-company.v1"),
  action: z.enum(["start", "reset"]),
}).strict();

export async function isBlankPracticeCompany(pool: Pool, digest: string, context?: VerifiedTenantContext): Promise<boolean> {
  if (context) return withTenant(pool, context, async db =>
    (await db.$client.query<{ blank: boolean }>("SELECT app.is_blank_practice_company($1) blank", [digest])).rows[0]?.blank === true);
  return (await pool.query<{ blank: boolean }>("SELECT app.is_blank_practice_company($1) blank", [digest])).rows[0]?.blank === true;
}

/** Fresh opaque ownership namespace; reset revokes the old namespace atomically.
 * This reuses the synthetic tenant, not a real company/signup or production identity.
 */
export async function startBlankPracticeCompany(pool: Pool, raw: unknown, token?: string): Promise<string> {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new PracticeAccessError("SYNTHETIC_MODE_REQUIRED");
  const command = blankPracticeCompanyCommandV1.parse(raw);
  let previous: string | null = null;
  if (command.action === "reset") {
    await authenticatePracticeSession(pool, token);
    previous = token!;
  } else if (token) {
    let auth: Awaited<ReturnType<typeof authenticatePracticeSession>> | undefined;
    try {
      auth = await authenticatePracticeSession(pool, token);
    } catch (error) {
      if (!(error instanceof PracticeAccessError && error.code === "UNAUTHENTICATED")) throw error;
    }
    if (auth) {
      if (auth.digest !== createHash("sha256").update(token).digest("hex")) throw new PracticeAccessError("UNAUTHENTICATED");
      if (await isBlankPracticeCompany(pool, auth.digest)) return token;
    }
  }
  const next = randomUUID();
  try {
    await pool.query("SELECT app.start_blank_practice_company_v2($1,$2)", [next, previous]);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") throw new PracticeAccessError("UNAUTHENTICATED");
    throw error;
  }
  return next;
}


export const linkedPracticeCompanyCommandV1 = z.object({
  version: z.literal("linked-practice-company.v1"),
  action: z.enum(["enter", "reset"]),
}).strict();

/** Identity-role pool only. The identity provider's exact HMAC convention is
 * retained; SQL resolves membership and namespace without caller selectors.
 * A lost reply can safely mint a new credential on the same namespace.
 */
export async function enterLinkedPracticeCompany(
  identityPool: Pool,
  identityToken: string,
  identitySecret: string,
  raw: unknown,
  currentPracticeToken?: string,
): Promise<string> {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") throw new PracticeAccessError("SYNTHETIC_MODE_REQUIRED");
  const command = linkedPracticeCompanyCommandV1.parse(raw);
  if (!identityToken || identitySecret.length < 32 ||
    (command.action === "reset" ? !z.string().uuid().safeParse(currentPracticeToken).success : currentPracticeToken !== undefined)) {
    throw new PracticeAccessError("UNAUTHENTICATED");
  }
  const next = randomUUID();
  const digest = (token: string) => createHash("sha256").update(token).digest("hex");
  const parentDigest = createHmac("sha256", identitySecret).update(`session:${identityToken}`).digest("hex");
  try {
    await identityPool.query("SELECT identity.enter_linked_practice($1,$2,$3,$4)", [
      parentDigest, digest(next), command, currentPracticeToken ? digest(currentPracticeToken) : null,
    ]);
  } catch (error) {
    if ((error as { code?: string }).code === "28000") throw new PracticeAccessError("UNAUTHENTICATED");
    throw error;
  }
  return next;
}
