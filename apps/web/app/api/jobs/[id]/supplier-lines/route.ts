import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { authorizePracticeJob, requireLiveJob, withTenant } from "@jobguard/db";
import { SupplierLinesService } from "../../../../lib/supplier-lines-service";
import { syntheticPool, practiceFailure } from "../../../../lib/synthetic-server";
import { routeErrorCode } from "../../../../lib/route-error-code";
const headers = { "Cache-Control": "no-store" };
type RouteContext = { params: Promise<{ id: string }> };
async function handle(request: Request, context: RouteContext, write: boolean) {
  try {
    const pool = syntheticPool(), sessionId = (await cookies()).get("jg_session")?.value;
    const service = new SupplierLinesService(pool, sessionId);
    const { id } = await context.params;
    let result;
    if (write) {
      const auth = await authorizePracticeJob(pool, sessionId, id);
      const input: unknown = await request.json();
      result = await withTenant(pool, auth.context, async db => {
        // Hold the live-job SHARE lock until the command's own transaction commits.
        await requireLiveJob(db, id);
        return service.command(id, input);
      });
    } else result = await service.read(id, Object.fromEntries(new URL(request.url).searchParams));
    return NextResponse.json(result, { headers });
  } catch (error) {
    const denied = practiceFailure(error); if (denied) return denied;
    const code = error instanceof ZodError || error instanceof SyntaxError ? "INVALID_COMMAND" : routeErrorCode(error, "INVALID_COMMAND");
    const status = code === "MATCH_NOT_FOUND" || code === "JOB_NOT_FOUND" ? 404 : code === "MATCH_FORBIDDEN" ? 403
      : code === "UNAUTHENTICATED" ? 401 : code === "JOB_NOT_LIVE" || code.includes("CONFLICT") ? 409 : 400;
    return NextResponse.json({ code }, { status, headers });
  }
}
export const GET = (request: Request, context: RouteContext) => handle(request, context, false);
export const POST = (request: Request, context: RouteContext) => handle(request, context, true);
