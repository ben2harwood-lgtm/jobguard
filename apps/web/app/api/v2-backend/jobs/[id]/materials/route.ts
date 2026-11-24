import { MaterialsError, QuoteApplicationError, materialLineCommandV1, materialEnquiryCommandV1 } from "@jobguard/api/workspace";
import { NextResponse } from "next/server";
import { practiceFailure } from "../../../../../lib/synthetic-server";
import { workspaceApplication } from "../../../../../lib/workspace-server";

type Route = { params: Promise<{ id: string }> };
const enabled = () => process.env.JOBGUARD_LOCAL_V2 === "1" && process.env.JOBGUARD_ENV === "synthetic_demo";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
function failure(error: unknown) {
  if (error instanceof MaterialsError) return reply({ code: error.code },
    error.code.endsWith("CONFLICT") ? 409 : error.code === "MATERIALS_EDITOR_REQUIRED" ? 403 : 400);
  return practiceFailure(error) ?? reply({ code: "MATERIALS_UNAVAILABLE" }, 503);
}

export async function GET(_request: Request, { params }: Route) {
  if (!enabled()) return reply({ code: "NOT_FOUND" }, 404);
  try {
    const { id } = await params;
    const { materialsEnquiry, quote } = await workspaceApplication();
    const view = await materialsEnquiry.read(id, { version: "v2-materials-query.v1" });
    const { scope } = await quote.get(id).catch((error: unknown) => {
      if (error instanceof QuoteApplicationError && error.code === "NOT_FOUND") return { scope: [] };
      throw error;
    });
    return reply({ ...view, scope: scope.map(item => ({ scopeItemId: item.scopeItemId, description: item.description })) });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request, { params }: Route) {
  if (!enabled()) return reply({ code: "NOT_FOUND" }, 404);
  const raw: unknown = await request.json().catch(() => null);
  const line = materialLineCommandV1.safeParse(raw);
  const enquiry = materialEnquiryCommandV1.safeParse(raw);
  if (!line.success && !enquiry.success) return reply({ code: "MATERIALS_INVALID_COMMAND" }, 400);
  try {
    const { materialsEnquiry } = await workspaceApplication();
    const { id } = await params;
    return reply(line.success ? await materialsEnquiry.saveLine(id, line.data)
      : await materialsEnquiry.generate(id, enquiry.data!));
  } catch (error) { return failure(error); }
}
