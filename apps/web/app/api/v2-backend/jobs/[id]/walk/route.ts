import { WalkError, walkEntryCommandV1, walkQueryV1, walkSessionCommandV1 } from "@jobguard/api/workspace";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isTrustedBrowserOrigin } from "../../../../contractor/origin";
import { practiceFailure } from "../../../../../lib/synthetic-server";
import { workspaceApplication } from "../../../../../lib/workspace-server";

type Route = { params: Promise<{ id: string }> };
const enabled = () => process.env.JOBGUARD_LOCAL_V2 === "1" && process.env.JOBGUARD_ENV === "synthetic_demo";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const start = walkSessionCommandV1.extend({ action: z.literal("start") });
const record = walkEntryCommandV1.extend({ action: z.literal("record") });

function failure(error: unknown) {
  if (error instanceof WalkError) return reply({ code: error.code },
    error.code.endsWith("CONFLICT") ? 409 : error.code === "WALK_EDITOR_REQUIRED" ? 403 : 400);
  return practiceFailure(error) ?? reply({ code: "WALK_UNAVAILABLE" }, 503);
}

export async function GET(request: Request, { params }: Route) {
  if (!enabled()) return reply({ code: "NOT_FOUND" }, 404);
  const query = walkQueryV1.safeParse({ version: "v2-walk-query.v1",
    ...(new URL(request.url).searchParams.has("sessionId") && { sessionId: new URL(request.url).searchParams.get("sessionId") }) });
  if (!query.success) return reply({ code: "WALK_INVALID_QUERY" }, 400);
  try {
    const { walk } = await workspaceApplication();
    return reply({ sessions: await walk.read((await params).id, query.data) });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request, { params }: Route) {
  if (!enabled()) return reply({ code: "NOT_FOUND" }, 404);
  if (!isTrustedBrowserOrigin(request)) return reply({ code: "ORIGIN_FORBIDDEN" }, 403);
  const raw: unknown = await request.json().catch(() => null);
  const session = start.safeParse(raw);
  const entry = record.safeParse(raw);
  if (!session.success && !entry.success) return reply({ code: "WALK_INVALID_COMMAND" }, 400);
  try {
    const { walk } = await workspaceApplication();
    const { id } = await params;
    if (session.success) {
      const { action: _action, ...command } = session.data;
      return reply(await walk.start(id, { ...command, deviceStartedAt: command.deviceStartedAt.toISOString() }));
    }
    const { action: _action, ...command } = entry.data!;
    return reply(await walk.record(id, { ...command, deviceCapturedAt: command.deviceCapturedAt.toISOString() }));
  } catch (error) { return failure(error); }
}
