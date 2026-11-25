import { NextResponse } from "next/server";
import { stockCommandV1, StockError } from "@jobguard/api/workspace";
import { workspaceApplication } from "../../../../lib/workspace-server";
import { practiceFailure } from "../../../../lib/synthetic-server";

type Context = { params: Promise<{ id: string }> };
const headers = { "Cache-Control": "no-store" };
function failure(error: unknown) {
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
  // This builder-only endpoint uses the existing persisted practice session and same-origin boundary.
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ code: "ORIGIN_REFUSED" }, { status: 403, headers });
  }
  try {
    const application = await workspaceApplication();
    const command = stockCommandV1.safeParse(await request.json());
    if (!command.success) throw new StockError("STOCK_INVALID_COMMAND");
    return NextResponse.json(await application.stock.execute((await params).id, command.data), { headers });
  } catch (error) {
    if (error instanceof SyntaxError) return NextResponse.json({ code: "STOCK_INVALID_COMMAND" }, { status: 400, headers });
    return failure(error);
  }
}
