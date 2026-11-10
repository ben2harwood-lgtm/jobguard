import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { SupplierLinesService } from "../../../../lib/supplier-lines-service";
import { syntheticPool, practiceFailure } from "../../../../lib/synthetic-server";
import { routeErrorCode } from "../../../../lib/route-error-code";
const headers = { "Cache-Control": "no-store" };
type RouteContext = { params: Promise<{ id: string }> };
async function handle(request: Request, context: RouteContext, write: boolean) {
  try {
    const service = new SupplierLinesService(syntheticPool(), (await cookies()).get("jg_session")?.value);
    const { id } = await context.params;
    const result = write ? await service.command(id, await request.json())
      : await service.read(id, Object.fromEntries(new URL(request.url).searchParams));
    return NextResponse.json(result, { headers });
  } catch (error) {
    const denied = practiceFailure(error); if (denied) return denied;
    const code = error instanceof ZodError || error instanceof SyntaxError ? "INVALID_COMMAND" : routeErrorCode(error, "INVALID_COMMAND");
    const status = code === "MATCH_NOT_FOUND" ? 404 : code === "MATCH_FORBIDDEN" ? 403
      : code === "UNAUTHENTICATED" ? 401 : code.includes("CONFLICT") ? 409 : 400;
    return NextResponse.json({ code }, { status, headers });
  }
}
export const GET = (request: Request, context: RouteContext) => handle(request, context, false);
export const POST = (request: Request, context: RouteContext) => handle(request, context, true);
