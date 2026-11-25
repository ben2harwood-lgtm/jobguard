import { NextResponse } from "next/server";
/** QW-1: the builder attaches a photo to a logged extra. Pilot only; practice mode keeps its generated photos. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (globalThis.process?.env.JOBGUARD_ENV !== "pilot_no_charge") return NextResponse.json({ code: "NOT_FOUND" }, { status: 404, headers: { "Cache-Control": "no-store" } });
  const { pilotWorkspaceRoute } = await import("../../../../../lib/pilot-workspace-route.mjs");
  return pilotWorkspaceRoute(request, async app => {
    try { return await app.continuation.saveExtraPhoto((await params).id, await request.json().catch(() => null)); }
    // The shared failure map is held by the redesign stack, so this route answers its own cap refusal.
    catch (error) { if (error instanceof Error && error.message === "PHOTO_LIMIT_REACHED") return NextResponse.json({ code: "PHOTO_LIMIT_REACHED" }, { status: 409 }); throw error; }
  });
}
