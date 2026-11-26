import { customWorkPlanTaskKey, WorkPlanError } from "@jobguard/db";
import { workPlanEditV1 } from "@jobguard/api/workspace";
import { NextResponse } from "next/server";
import { practiceFailure } from "../../../../../lib/synthetic-server";
import { workspaceApplication } from "../../../../../lib/workspace-server";

type Route = { params: Promise<{ id: string }> };

function failure(code: string, status: number) {
  return NextResponse.json({ code }, { status, headers: { "Cache-Control": "no-store" } });
}

function planFailure(error: unknown) {
  if (error instanceof WorkPlanError) {
    const { code } = error;
    if (code === "QUOTE_REVISION_NOT_FOUND") return failure(code, 404);
    if (code === "WORK_PLAN_VERSION_CONFLICT" || code === "WORK_PLAN_COMMAND_CONFLICT") return failure(code, 409);
    if (code === "WORK_PLAN_EDITOR_REQUIRED") return failure(code, 403);
    if (code === "WORK_PLAN_INVALID_EDIT") return failure(code, 400);
  }
  return practiceFailure(error) ?? failure("WORK_PLAN_UNAVAILABLE", 503);
}

export async function GET(_request: Request, { params }: Route) {
  if (process.env.JOBGUARD_LOCAL_V2 !== "1") return failure("NOT_FOUND", 404);
  try {
    const { id } = await params;
    const { workPlan, quote } = await workspaceApplication();
    const { state, tasks, unplanned, quoteRevisionId, version, changes, scopeItems, extrasNotPlanned } =
      await workPlan.read(id, { version: "work-plan-query.v1" });
    // An edit to an approved extra must name the approved revision this plan was read from.
    const variationRevisions = Object.fromEntries(scopeItems.flatMap(item =>
      item.variationRevisionId ? [[item.scopeItemId, item.variationRevisionId]] : []));
    let acceptanceCancelled = false;
    if (state === "accepted") {
      const acceptance = await quote.acceptanceView(id);
      const lastAcceptance = acceptance.events.findLast(event => event.kind === "accepted" || event.kind === "acceptance_cancelled");
      acceptanceCancelled = !acceptance.activeAcceptance && lastAcceptance?.kind === "acceptance_cancelled";
    }
    return NextResponse.json({ state, tasks, unplanned: unplanned.map(item => ({ ...item, key: customWorkPlanTaskKey })),
      quoteRevisionId, version, changes, acceptanceCancelled, variationRevisions, extrasNotPlanned },
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return planFailure(error);
  }
}

export async function POST(request: Request, { params }: Route) {
  if (process.env.JOBGUARD_LOCAL_V2 !== "1") return failure("NOT_FOUND", 404);
  const input = workPlanEditV1.safeParse(await request.json().catch(() => null));
  if (!input.success) return failure("WORK_PLAN_INVALID_EDIT", 400);
  try {
    const { workPlan } = await workspaceApplication();
    return NextResponse.json(await workPlan.edit((await params).id, input.data));
  } catch (error) {
    return planFailure(error);
  }
}
