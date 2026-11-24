import { MeasurementError } from "@jobguard/db";
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
    const { measurements, quote } = await workspaceApplication();
    // d1's read authorises the job first; the quote only supplies the scope wording.
    const items = await measurements.read(id, { version: "v2-measurement-query.v1" });
    const scope = items.length === 0 ? [] : await quote.get(id).then(view => view.scope, (error: unknown) => {
      if ((error as { code?: unknown })?.code === "NOT_FOUND") return [];
      throw error;
    });
    const quoted = new Map<string, Quoted>(scope.map(line =>
      [line.scopeItemId, { description: line.description, quantity: line.quantity, unit: line.unit }]));
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
