import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ExtraPricingApplication, ExtraPricingError, assertExtraPricingMode, extraPricingHttpFailure } from "@jobguard/api/workspace";
import { syntheticPool } from "../../../../../../../lib/synthetic-server";
import { isTrustedBrowserOrigin } from "../../../../../origin";
// Pricing contract v2 (docs/contracts/extra-price-rules-v2.md): POST price-extra.v2 with a basis; GET each price's recorded basis.
// The session names the actor and the path names the job and extra; the database prices and checks everything.
const headers = { "cache-control": "no-store" };
const failure = (error: unknown) => { const { status, body } = extraPricingHttpFailure(error); return NextResponse.json(body, { status, headers }); };
const principal = async () => ({ version: "contractor-principal.v1", sessionId: (await cookies()).get("jg_session")?.value });
export async function POST(request: Request, context: { params: Promise<{ id: string; extraId: string }> }) {
 if (!isTrustedBrowserOrigin(request)) return failure(new ExtraPricingError("ORIGIN_FORBIDDEN"));
 try {
  assertExtraPricingMode();
  let raw: unknown; try { raw = await request.json(); } catch { throw new ExtraPricingError("INVALID_COMMAND"); }
  const { id, extraId } = await context.params;
  return NextResponse.json(await new ExtraPricingApplication(syntheticPool()).price(await principal(), id, extraId, raw), { status: 201, headers });
 } catch (error) { return failure(error); }
}
export async function GET(_request: Request, context: { params: Promise<{ id: string; extraId: string }> }) {
 try {
  assertExtraPricingMode();
  const { id, extraId } = await context.params;
  return NextResponse.json(await new ExtraPricingApplication(syntheticPool()).basis(await principal(), id, extraId), { headers });
 } catch (error) { return failure(error); }
}
