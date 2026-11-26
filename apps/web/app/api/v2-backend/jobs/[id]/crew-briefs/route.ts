import { CrewBriefError, WorkPlanError, crewBriefCommandV1, crewBriefQueryV1 } from "@jobguard/db";
import { NextResponse } from "next/server";
import { isTrustedBrowserOrigin } from "../../../../contractor/origin";
import { practiceFailure } from "../../../../../lib/synthetic-server";
import { workspaceApplication } from "../../../../../lib/workspace-server";

type Route = { params: Promise<{ id: string }> };
const enabled = () => process.env.JOBGUARD_LOCAL_V2 === "1" && process.env.JOBGUARD_ENV === "synthetic_demo";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
function failure(error: unknown) {
  if (error instanceof CrewBriefError || error instanceof WorkPlanError) return reply({ code: error.code },
    error.code.endsWith("CONFLICT") ? 409 : error.code.endsWith("EDITOR_REQUIRED") ? 403 : 400);
  return practiceFailure(error) ?? reply({ code: "CREW_BRIEFS_UNAVAILABLE" }, 503);
}

export async function GET(request: Request, { params }: Route) {
  if (!enabled()) return reply({ code: "NOT_FOUND" }, 404);
  const search = new URL(request.url).searchParams;
  const query = crewBriefQueryV1.safeParse({ version: "v2-crew-brief-query.v1",
    ...(search.has("trade") ? { trade: search.get("trade") } : {}) });
  if (!query.success || (search.has("export") && (search.get("export") !== "internal" || !query.data.trade))) {
    return reply({ code: "CREW_BRIEF_INVALID_QUERY" }, 400);
  }
  try {
    const { id } = await params;
    const { crewBriefs, workPlan } = await workspaceApplication();
    if (search.has("export")) return new Response(await crewBriefs.exportInternal(id, query.data.trade!), {
      headers: { "Cache-Control": "no-store", "Content-Type": "application/json",
        "Content-Disposition": 'attachment; filename="crew-brief-internal.json"' },
    });
    const plan = await workPlan.read(id, { version: "work-plan-query.v1" }).catch((error: unknown) => {
      if (error instanceof WorkPlanError && error.code === "QUOTE_REVISION_NOT_FOUND") return null;
      throw error;
    });
    // Codex P2 4702417612: D4's brief generator builds tasks from quote lines only, so a trade whose tasks are all
    // approved extras would offer "Make brief" and then fail. Offer only trades the generator can make (LATER: briefs
    // gain approved extras, roadmap LATER list).
    const extraScope = new Set((plan?.scopeItems ?? []).filter(item => item.variationRevisionId).map(item => item.scopeItemId));
    const trades = [...new Set(plan?.tasks.filter(task => !extraScope.has(task.scopeItemId)).map(task => task.trade) ?? [])]
      .filter(trade => !query.data.trade || trade === query.data.trade);
    return reply({ trades, briefs: await crewBriefs.read(id, query.data),
      ...(plan ? {} : { code: "QUOTE_REVISION_NOT_FOUND" }) });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request, { params }: Route) {
  if (!enabled()) return reply({ code: "NOT_FOUND" }, 404);
  if (!isTrustedBrowserOrigin(request)) return reply({ code: "ORIGIN_REFUSED" }, 403);
  const command = crewBriefCommandV1.safeParse(await request.json().catch(() => null));
  if (!command.success) return reply({ code: "CREW_BRIEF_INVALID_COMMAND" }, 400);
  try {
    const { id } = await params;
    return reply(await (await workspaceApplication()).crewBriefs.generate(id, command.data));
  } catch (error) { return failure(error); }
}
