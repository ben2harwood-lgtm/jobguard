import "server-only";
import type { Pool } from "pg";
import type { VerifiedTenantContext } from "@jobguard/db";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { authenticatePracticeSession, contractorSessionContext, RequestBindingRefusedError } from "@jobguard/db";
import { FirmProfileError, FirmProfileRepository } from "@jobguard/db";
import { AuthError, identityStatus } from "@jobguard/api/identity";
import { identityApplication } from "../../lib/identity-server";
import { isTrustedBrowserOrigin } from "../contractor/origin";
import { practiceFailure, syntheticPool } from "../../lib/synthetic-server";
const headers = { "Cache-Control": "no-store" };
async function profileContext(pool: Pool): Promise<VerifiedTenantContext> {
 const jar = await cookies();
 const identityToken = jar.get("jobguard_session")?.value;
 if (identityToken) {
  const identity = identityApplication(), signedIn = await identity.session(identityToken);
  if (signedIn.memberships.length !== 1) throw new FirmProfileError("FORBIDDEN");
  const context: VerifiedTenantContext = await identity.context({ sessionToken: identityToken, requestedTenantId: signedIn.memberships[0]!.tenantId,
   csrfToken: signedIn.csrfToken, origin: identity.allowedOrigin });
  return context;
 }
 const token = jar.get("jg_session")?.value;
 // Both home and contractor cookies are opaque UUIDs. Only an explicit
 // authentication refusal tries the other persisted session store.
 try { return (await authenticatePracticeSession(pool, token)).context; }
 catch (error) {
  if (!(error instanceof Error && error.message === "UNAUTHENTICATED")) throw error;
  return contractorSessionContext(pool, token ?? "");
 }
}
function failure(error: unknown) {
 if (error instanceof AuthError) { const { code, status } = identityStatus(error); return NextResponse.json({ code }, { status, headers }); }
 if (error instanceof FirmProfileError) return NextResponse.json({ code: error.code }, { status: error.code === "INVALID_PROFILE" ? 400 : 403, headers });
 if (error instanceof RequestBindingRefusedError || ["FORBIDDEN", "42501"].includes((error as { code?: string })?.code ?? "")) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403, headers });
 if ((error as { code?: string })?.code === "INVALID_TENANT_CONTEXT") return NextResponse.json({ code: "FORBIDDEN" }, { status: 403, headers });
 if ((error as { code?: string })?.code === "UNAUTHENTICATED" || (error instanceof Error && error.message === "UNAUTHENTICATED")) return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401, headers });
 return practiceFailure(error) ?? NextResponse.json({ code: "DATABASE_UNAVAILABLE" }, { status: 503, headers });
}
export async function GET() {
 try { const pool = syntheticPool(); const context: VerifiedTenantContext = await profileContext(pool); return NextResponse.json(await new FirmProfileRepository(pool).read(context), { headers }); }
 catch (error) { return failure(error); }
}
export async function POST(request: Request) {
 if (!isTrustedBrowserOrigin(request)) return NextResponse.json({ code: "FORBIDDEN" }, { status: 403, headers });
 try {
  const pool = syntheticPool(); const context: VerifiedTenantContext = await profileContext(pool);
  return NextResponse.json(await new FirmProfileRepository(pool).save(context, await request.json().catch(() => null)), { headers });
 } catch (error) { return failure(error); }
}
