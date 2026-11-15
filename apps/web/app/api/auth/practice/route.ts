import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AuthError, identityStatus } from "@jobguard/api/identity";
import { enterLinkedPracticeCompany, linkedPracticeCompanyCommandV1 } from "@jobguard/db";
import { identityCredentials } from "../../../lib/identity-server";
import { linkedOwner, linkedPracticeSecret, pairingCookie, practiceCookieOptions, practicePairReceipt, verifyPracticePair } from "../../../lib/linked-practice-entry";
import { practiceFailure } from "../../../lib/synthetic-server";
const headers = { "Cache-Control": "no-store" };
export async function POST(request: Request) {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401, headers });
  const command = linkedPracticeCompanyCommandV1.safeParse(await request.json().catch(() => null));
  if (!command.success || new URL(request.url).search) return NextResponse.json({ code: "INVALID_PRACTICE_COMMAND" }, { status: 400, headers });
  try {
    const credentials = await identityCredentials(request);
    const { application, session } = await linkedOwner(credentials.sessionToken);
    application.requireOrigin(credentials.origin);
    if (!credentials.csrfToken || credentials.csrfToken !== session.csrfToken || credentials.tenantHeader) throw new AuthError("ORIGIN_FORBIDDEN");
    const jar = await cookies(), secret = linkedPracticeSecret();
    const previous = command.data.action === "reset" ? jar.get("jg_session")?.value : undefined;
    if (command.data.action === "reset" && !verifyPracticePair(jar.get(pairingCookie)?.value, credentials.sessionToken, previous, secret)) throw new AuthError("UNAUTHENTICATED");
    const token = command.data.action === "reset"
      ? await enterLinkedPracticeCompany(application.provider.repository.pool, credentials.sessionToken!, secret, command.data, previous)
      : await enterLinkedPracticeCompany(application.provider.repository.pool, credentials.sessionToken!, secret, command.data);
    const response = NextResponse.json({ version: "linked-practice-company.v1", ok: true }, { headers });
    const options = practiceCookieOptions(new URL(application.allowedOrigin).protocol === "https:");
    response.cookies.set("jg_session", token, options);
    response.cookies.set(pairingCookie, practicePairReceipt(credentials.sessionToken!, token, secret), options);
    return response;
  } catch (error) {
    const refusal = practiceFailure(error);
    if (refusal) return refusal;
    const { code, status } = identityStatus(error);
    return NextResponse.json({ code }, { status, headers });
  }
}
