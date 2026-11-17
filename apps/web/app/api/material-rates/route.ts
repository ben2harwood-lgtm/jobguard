import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isRouteValidationError } from "../../lib/route-error-code";
import { hasSyntheticSession, practiceFailure } from "../../lib/synthetic-server";
import { workspaceApplication } from "../../lib/workspace-server";

// Exact public outcomes retained from main's route compatibility contract.
// Material writes additionally expose the repository revision and SQL ownership/bind refusals.
const publicErrorStatuses = new Map<string, number>([
  ["STALE_REVISION", 409],
  ["IDEMPOTENCY_CONFLICT", 400],
  ["VARIATION_REVISION_CONFLICT", 400],
  ["CURRENT_REVISION_REQUIRED", 400],
  ["BASELINE_REQUIRED", 400],
  ["CREDIT_EXCEEDS_INVOICE", 400],
  ["JOB_NOT_FOUND", 400],
  ["JOB_NOT_LIVE", 400],
  ["DECISION_NOT_FOUND", 400],
  ["FORBIDDEN", 400],
  ["INVALID_COMMAND", 400],
  ["DATABASE_UNAVAILABLE", 400],
  ["NOT_FOUND", 400],
  ["CONFLICT", 400],
  ["QUOTE_CHANGED", 400],
  ["ALREADY_LOCKED", 400],
  ["SOURCE_CHANGED", 400],
  ["STALE_MATERIAL_RATE_REVISION", 409],
  ["PRACTICE_MATERIAL_NOT_FOUND", 400],
  ["REQUEST_BINDING_REFUSED", 400],
  ["UNAUTHENTICATED", 400],
  ["SYNTHETIC_MODE_REQUIRED", 400],
]);

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
    if (error instanceof Error) {
      const status = publicErrorStatuses.get(error.message);
      if (status !== undefined) return NextResponse.json({ code: error.message }, { status });
    }
    return NextResponse.json({ code: "DATABASE_UNAVAILABLE" }, { status: 503 });
  }
}
