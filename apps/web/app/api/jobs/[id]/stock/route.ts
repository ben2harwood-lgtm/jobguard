import { NextResponse } from "next/server";
import { stockCommandV1, StockError } from "@jobguard/api/workspace";
import { AuthError, identityStatus, resolveVerifiedTenantContext } from "@jobguard/api/identity";
import { ZodError } from "zod";
import { identityApplication, identityCredentials } from "../../../../lib/identity-server";
import { workspaceApplication } from "../../../../lib/workspace-server";
import { practiceFailure } from "../../../../lib/synthetic-server";

type Context = { params: Promise<{ id: string }> };
const headers = { "Cache-Control": "no-store" };
function failure(error: unknown) {
  if (error instanceof AuthError || error instanceof ZodError) {
    const { code, status } = identityStatus(error);
    return NextResponse.json({ code: code === "ORIGIN_FORBIDDEN" ? "ORIGIN_REFUSED" : code }, { status, headers });
  }
  const denied = practiceFailure(error);
  if (denied) return denied;
  if (error instanceof StockError) return NextResponse.json({ code: error.code }, {
    status: error.code.endsWith("CONFLICT") ? 409 : error.code === "STOCK_EDITOR_REQUIRED" ? 403 : 400, headers,
  });
  throw error;
}
export async function GET(_request: Request, { params }: Context) {
  try {
    return NextResponse.json(await (await workspaceApplication()).stock.read((await params).id,
      { version: "v2-stock-query.v1" }), { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request, { params }: Context) {
  // Fail closed before initializing identity when its allowed origin is unconfigured.
  if (!process.env.AUTH_ALLOWED_ORIGIN) {
    return NextResponse.json({ code: "ORIGIN_REFUSED" }, { status: 403, headers });
  }
  try {
    const identity = identityApplication();
    const credentials = await identityCredentials(request);
    const session = await identity.session(credentials.sessionToken);
    if (session.memberships.length !== 1) throw new AuthError("TENANT_FORBIDDEN");
    if (!credentials.csrfToken) throw new AuthError("ORIGIN_FORBIDDEN");
    await resolveVerifiedTenantContext(identity.provider, {
      sessionToken: credentials.sessionToken, requestedTenantId: session.memberships[0]!.tenantId,
      csrfToken: credentials.csrfToken, origin: request.headers.get("origin") ?? undefined,
    }, identity.allowedOrigin);
    const application = await workspaceApplication();
    const command = stockCommandV1.safeParse(await request.json());
    if (!command.success) throw new StockError("STOCK_INVALID_COMMAND");
    return NextResponse.json(await application.stock.execute((await params).id, command.data), { headers });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ code: "STOCK_INVALID_COMMAND" }, { status: 400, headers });
    return failure(error);
  }
}
