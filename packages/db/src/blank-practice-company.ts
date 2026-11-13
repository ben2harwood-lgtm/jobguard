import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import { z } from "zod";
import { authenticatePracticeSession, PracticeAccessError } from "./practice-session.js";

export const blankPracticeCompanyCommandV1 = z.object({
  version: z.literal("blank-practice-company.v1"),
  action: z.enum(["start", "reset"]),
}).strict();

export async function isBlankPracticeCompany(pool: Pool, digest: string): Promise<boolean> {
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
    try {
      const auth = await authenticatePracticeSession(pool, token);
      if (await isBlankPracticeCompany(pool, auth.digest)) return token;
    } catch (error) {
      if (!(error instanceof PracticeAccessError && error.code === "UNAUTHENTICATED")) throw error;
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
