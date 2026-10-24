import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticatePracticeSession } from "@jobguard/db";
import { syntheticPool } from "../../lib/synthetic-server";

export const dynamic = "force-dynamic";
const selectionV1 = z.object({
 from: z.string().datetime().optional(), toExclusive: z.string().datetime().optional(),
 periodId: z.string().min(1).max(200).optional(),
}).strict().refine(v => (v.from === undefined) === (v.toExclusive === undefined));
const reply = (code: string, status: number) => NextResponse.json(
 { version: "business-value-result.v1", state: "unavailable", code },
 { status, headers: { "Cache-Control": "private, no-store" } },
);
/**
 * Held in-process boundary until coordinator composes CH9-J's readBusiness.
 * Deliberately no dynamic property lookup, alternate company bridge, source
 * adapter, empty aggregate, client cache or illustrative receipt fallback.
 */
export async function GET(request: Request) {
 if (process.env.JOBGUARD_ENV !== "synthetic_demo") return reply("SYNTHETIC_MODE_REQUIRED", 403);
 try {
  await authenticatePracticeSession(syntheticPool(), (await cookies()).get("jg_session")?.value);
  const params = new URL(request.url).searchParams;
  const keys = [...params.keys()];
  if (new Set(keys).size !== keys.length || !selectionV1.safeParse(Object.fromEntries(params)).success) {
   return reply("INVALID_BUSINESS_VALUE_SELECTION", 400);
  }
  return keys.length ? reply("BUSINESS_VALUE_SELECTION_HELD", 503) : reply("BUSINESS_VALUE_BINDING_HELD", 503);
 } catch (error) {
  const code = error instanceof Error && "code" in error ? error.code : undefined;
  if (code === "UNAUTHENTICATED") return reply(code, 401);
  if (code === "SYNTHETIC_MODE_REQUIRED") return reply(code, 403);
  return reply("BUSINESS_VALUE_UNAVAILABLE", 503);
 }
}
