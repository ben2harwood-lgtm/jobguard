import { MeasurementError, WorkPlanError } from "@jobguard/db";
import { measurementCommandV1 } from "@jobguard/api/workspace";
import { NextResponse } from "next/server";
import { practiceFailure } from "../../../../../lib/synthetic-server";
import { workspaceApplication } from "../../../../../lib/workspace-server";

type Route = { params: Promise<{ id: string }> };
type Quoted = { description: string; quantity: string | null; unit: string | null };

function failure(code: string, status: number) {
  return NextResponse.json({ code }, { status, headers: { "Cache-Control": "no-store" } });
}

function measurementFailure(error: unknown) {
  if (error instanceof MeasurementError) {
    const { code } = error;
    if (code === "MEASUREMENT_VERSION_CONFLICT" || code === "MEASUREMENT_COMMAND_CONFLICT") return failure(code, 409);
    if (code === "MEASUREMENT_EDITOR_REQUIRED") return failure(code, 403);
    return failure(code, 400);
  }
  return practiceFailure(error) ?? failure("MEASUREMENT_UNAVAILABLE", 503);
}

export async function GET(_request: Request, { params }: Route) {
  if (process.env.JOBGUARD_LOCAL_V2 !== "1") return failure("NOT_FOUND", 404);
  try {
    const { id } = await params;
    const { measurements, quote, workPlan } = await workspaceApplication();
    // d1's read authorises the job first. The quote supplies the scope wording and quoted quantity.
    const items = await measurements.read(id, { version: "v2-measurement-query.v1" });
    const view = items.length === 0 ? null : await quote.get(id).catch((error: unknown) => {
      if ((error as { code?: unknown })?.code === "NOT_FOUND") return null;
      throw error;
    });
    // Quote the plan's revision: the accepted baseline once accepted or live, else the current draft.
    // Without a plan, fall back to the current draft revision's own lines.
    const plan = view && await workPlan.read(id, { version: "work-plan-query.v1" }).catch((error: unknown) => {
      if (error instanceof WorkPlanError) return null;
      throw error;
    });
    const lines = plan?.scopeItems ??
      view?.revisions.find(revision => revision.id === view.draft?.currentRevisionId)?.lines.filter(line => line.included) ?? [];
    const quotedLines = new Map(lines.map(line => [line.scopeItemId, line]));
    // Only confirmed scope can be measured; the quote revision only decides what it says.
    const quoted = new Map<string, Quoted>((view?.scope ?? []).map(item => {
      const line = quotedLines.get(item.scopeItemId);
      return [item.scopeItemId, line
        ? { description: line.description, quantity: line.quantity, unit: line.unit }
        : { description: item.description, quantity: null, unit: null }];
    }));
    // An approved extra is measurable once approved, though it has no confirmed scope revision yet.
    for (const item of plan?.scopeItems ?? []) {
      if (item.variationRevisionId && !quoted.has(item.scopeItemId)) {
        quoted.set(item.scopeItemId, { description: item.description, quantity: item.quantity, unit: item.unit });
      }
    }
    const order = new Map([...quoted.keys()].map((scopeItemId, index) => [scopeItemId, index]));
    const rank = (scopeItemId: string) => order.get(scopeItemId) ?? order.size;
    // Scope still awaiting review has nothing to measure yet, unless d1 already holds a value for it.
    const rows = items.filter(item => quoted.has(item.scopeItemId) || item.measurement).map(({ scopeItemId, version, measurement }) => ({
      scopeItemId, version, quoted: quoted.get(scopeItemId) ?? null,
      // An unconfirmed or missing measurement is d1's needs-input result for pack sums.
      status: measurement?.confirmed ? "confirmed" as const : "needs_input" as const,
      measurement: measurement && {
        quantity: measurement.quantity, unit: measurement.unit, source: measurement.source,
        confirmed: measurement.confirmed, recordedAt: measurement.recordedAt, confirmedAt: measurement.confirmedAt,
      },
    })).sort((a, b) => rank(a.scopeItemId) - rank(b.scopeItemId));
    return NextResponse.json({ items: rows }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return measurementFailure(error);
  }
}

export async function POST(request: Request, { params }: Route) {
  if (process.env.JOBGUARD_LOCAL_V2 !== "1") return failure("NOT_FOUND", 404);
  const input = measurementCommandV1.safeParse(await request.json().catch(() => null));
  if (!input.success) return failure("MEASUREMENT_INVALID_COMMAND", 400);
  try {
    const { measurements } = await workspaceApplication();
    return NextResponse.json(await measurements.save((await params).id, input.data),
      { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return measurementFailure(error);
  }
}
