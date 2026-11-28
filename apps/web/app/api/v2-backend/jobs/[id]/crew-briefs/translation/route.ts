import { CrewBriefTranslationError, crewBriefTranslationCommandV1, crewBriefTranslationQueryV1 } from "@jobguard/db";
import { NextResponse } from "next/server";
import { isTrustedBrowserOrigin } from "../../../../../contractor/origin";
import { practiceFailure } from "../../../../../../lib/synthetic-server";
import { workspaceApplication } from "../../../../../../lib/workspace-server";

type Route = { params: Promise<{ id: string }> };
const enabled = () => process.env.JOBGUARD_LOCAL_V2 === "1" && process.env.JOBGUARD_ENV === "synthetic_demo";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
function failure(error: unknown) {
  if (error instanceof CrewBriefTranslationError) return reply({ code: error.code },
    error.code.endsWith("CONFLICT") ? 409 : error.code.endsWith("EDITOR_REQUIRED") ? 403 : 400);
  return practiceFailure(error) ?? reply({ code: "CREW_BRIEF_TRANSLATION_UNAVAILABLE" }, 503);
}
export async function GET(request: Request, { params }: Route) {
  if (!enabled()) return reply({ code: "NOT_FOUND" }, 404);
  const search = new URL(request.url).searchParams;
  const query = crewBriefTranslationQueryV1.safeParse({ version: "v2-crew-brief-translation-query.v1",
    trade: search.get("trade"), expectedVersion: Number(search.get("version")), lang: search.get("lang") });
  if (!query.success) return reply({ code: "CREW_BRIEF_TRANSLATION_INVALID_QUERY" }, 400);
  try {
    const { id } = await params;
    return reply(await (await workspaceApplication()).crewBriefTranslations.read(id, query.data));
  } catch (error) { return failure(error); }
}
export async function POST(request: Request, { params }: Route) {
  if (!enabled()) return reply({ code: "NOT_FOUND" }, 404);
  if (!isTrustedBrowserOrigin(request)) return reply({ code: "ORIGIN_REFUSED" }, 403);
  const command = crewBriefTranslationCommandV1.safeParse(await request.json().catch(() => null));
  if (!command.success) return reply({ code: "CREW_BRIEF_TRANSLATION_INVALID_COMMAND" }, 400);
  try {
    const { id } = await params;
    return reply(await (await workspaceApplication()).crewBriefTranslations.translate(id, command.data));
  } catch (error) { return failure(error); }
}
