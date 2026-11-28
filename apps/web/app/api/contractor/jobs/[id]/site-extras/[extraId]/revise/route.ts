import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ExtraPricingApplication, ExtraPricingError, assertExtraPricingMode, extraPricingHttpFailure } from "@jobguard/api/workspace";
import { syntheticPool } from "../../../../../../../lib/synthetic-server";
import { isTrustedBrowserOrigin } from "../../../../../origin";
// Pricing contract v2 (docs/contracts/extra-price-rules-v2.md): POST revise-extra.v2 with a basis, a reason and the request it answers.
const headers = { "cache-control": "no-store" };
const failure = (error: unknown) => { const { status, body } = extraPricingHttpFailure(error); return NextResponse.json(body, { status, headers }); };
export async function POST(request: Request, context: { params: Promise<{ id: string; extraId: string }> }) {
 if (!isTrustedBrowserOrigin(request)) return failure(new ExtraPricingError("ORIGIN_FORBIDDEN"));
 try {
  assertExtraPricingMode();
  let raw: unknown; try { raw = await request.json(); } catch { throw new ExtraPricingError("INVALID_COMMAND"); }
  const { id, extraId } = await context.params;
  const principal = { version: "contractor-principal.v1", sessionId: (await cookies()).get("jg_session")?.value };
  return NextResponse.json(await new ExtraPricingApplication(syntheticPool()).revise(principal, id, extraId, raw), { status: 201, headers });
 } catch (error) { return failure(error); }
}
