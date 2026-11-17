import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isRouteValidationError } from "../../lib/route-error-code";
import { hasSyntheticSession, practiceFailure } from "../../lib/synthetic-server";
import { workspaceApplication } from "../../lib/workspace-server";

export async function POST(request: Request) {
  if (!hasSyntheticSession((await cookies()).get("jg_session")?.value)) {
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ code: "INVALID_COMMAND" }, { status: 400 });
  }

  try {
    return NextResponse.json(await (await workspaceApplication()).materials.addRate(body));
  } catch (error) {
    const denied = practiceFailure(error);
    if (denied) return denied;
    if (isRouteValidationError(error)) {
      return NextResponse.json({ code: "INVALID_COMMAND" }, { status: 400 });
    }
    // Composition's mode refusal uses a named code, not its internal message.
    if (error instanceof Error && "code" in error && error.code === "UNAUTHENTICATED") {
      return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "STALE_MATERIAL_RATE_REVISION") {
      return NextResponse.json({ code: "STALE_MATERIAL_RATE_REVISION" }, { status: 409 });
    }
    return NextResponse.json({ code: "DATABASE_UNAVAILABLE" }, { status: 503 });
  }
}
