import { practiceSessionMaxAgeSeconds } from "../../lib/linked-practice-entry";
import { isTrustedBrowserOrigin } from "../contractor/origin";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { blankPracticeCompanyCommandV1, startBlankPracticeCompany } from "@jobguard/db";
import { practiceFailure, syntheticPool } from "../../lib/synthetic-server";

export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401, headers });
  // Cookie-authenticated reset is same-origin only, including on the test address.
  if (!isTrustedBrowserOrigin(request)) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403, headers });
  const parsed = blankPracticeCompanyCommandV1.safeParse(await request.json().catch(() => null));
  if (!parsed.success || new URL(request.url).search) return NextResponse.json({ code: "INVALID_PRACTICE_COMMAND" }, { status: 400, headers });
  try {
    const jar = await cookies();
    // Identity-linked browsers must use the explicit identity-CSRF entry/reset boundary.
    if (jar.get("jobguard_session") || jar.get("jg_practice_pair")) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401, headers });
    const token = await startBlankPracticeCompany(syntheticPool(), parsed.data, (await cookies()).get("jg_session")?.value);
    const response = NextResponse.json({ version: "blank-practice-company.v1", ok: true }, { headers });
    response.cookies.set("jg_session", token, { httpOnly: true, sameSite: "lax", secure: new URL(request.url).protocol === "https:", path: "/", maxAge: practiceSessionMaxAgeSeconds });
    return response;
  } catch (error) {
    return practiceFailure(error) ?? NextResponse.json({ code: "DATABASE_UNAVAILABLE", recoverable: true }, { status: 503, headers });
  }
}
