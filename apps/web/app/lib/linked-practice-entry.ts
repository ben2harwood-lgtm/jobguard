import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { AuthError } from "@jobguard/api/identity";
import { authenticatePracticeSession, PracticeAccessError } from "@jobguard/db";
import type { Pool } from "pg";
import { identityApplication } from "./identity-server";

export const pairingCookie = "jg_practice_pair";
// Same secret validated by identity composition. No fallback key or credential store.
export function linkedPracticeSecret() { return z.string().min(32).parse(process.env.AUTH_CODE_SECRET); }
export function practiceCookieOptions(secure: boolean) {
  return { httpOnly: true, path: "/", sameSite: "strict" as const, secure };
}
function boundedTokens(identity: string, practice: string) {
  return identity.length > 0 && identity.length <= 256 && z.string().uuid().safeParse(practice).success;
}
export function practicePairReceipt(identity: string, practice: string, secret: string): string {
  if (!boundedTokens(identity, practice)) throw new PracticeAccessError("UNAUTHENTICATED");
  return `v1.${createHmac("sha256", secret).update(JSON.stringify(["jobguard:linked-practice-pair:v1", identity, practice])).digest("hex")}`;
}
export function verifyPracticePair(receipt: string | undefined, identity: string | undefined, practice: string | undefined, secret: string): boolean {
  if (!receipt || !/^v1\.[a-f0-9]{64}$/.test(receipt) || !identity || !practice || !boundedTokens(identity, practice)) return false;
  return timingSafeEqual(Buffer.from(receipt), Buffer.from(practicePairReceipt(identity, practice, secret)));
}
export async function linkedOwner(identityToken: string | undefined) {
  const application = identityApplication();
  const session = await application.session(identityToken);
  if (session.memberships.length !== 1 || session.memberships[0]!.role !== "owner") throw new AuthError("UNAUTHENTICATED");
  return { application, session };
}
/** Receipt proves only the exact browser pairing. Live identity and SQL remain authority. */
export async function authenticateLinkedPractice(pool: Pool, token: string | undefined) {
  const jar = await cookies();
  const identity = jar.get("jobguard_session")?.value;
  if (!verifyPracticePair(jar.get(pairingCookie)?.value, identity, token, linkedPracticeSecret())) throw new PracticeAccessError("UNAUTHENTICATED");
  try {
    const owner = await linkedOwner(identity);
    const auth = await authenticatePracticeSession(pool, token);
    return { ...owner, auth };
  } catch (error) {
    if (error instanceof AuthError && error.code === "UNAUTHENTICATED") throw new PracticeAccessError("UNAUTHENTICATED");
    throw error;
  }
}
export async function enforcePracticePair(pool: Pool, token: string | undefined, auth: Awaited<ReturnType<typeof authenticatePracticeSession>>) {
  const jar = await cookies();
  // Linked authentication returns the canonical namespace digest, never the credential digest.
  const linked = !!token && auth.digest !== createHash("sha256").update(token).digest("hex");
  if (linked || jar.get("jobguard_session") || jar.get(pairingCookie)) await authenticateLinkedPractice(pool, token);
}
