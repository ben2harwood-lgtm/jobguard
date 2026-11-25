import { pilotDraftCsv, pilotDraftHtml, pilotDraftRequestV1 } from "@jobguard/core";
import { pilotWorkspaceRoute } from "../../../../../lib/pilot-workspace-route.mjs";

type Params = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Params) {
  return pilotWorkspaceRoute(request, async app => app.invoiceDraft.read((await params).id));
}
export async function POST(request: Request, { params }: Params) {
  return pilotWorkspaceRoute(request, async app => {
    const raw: unknown = await request.json().catch(() => null);
    const parsed = pilotDraftRequestV1.safeParse(raw);
    if (!parsed.success) throw new Error("REVIEW_INCOMPLETE");
    const draft = await app.invoiceDraft.prepare((await params).id, raw);
    if (parsed.data.format === "preview") return draft;
    const csv = parsed.data.format === "csv";
    return new Response(csv ? pilotDraftCsv(draft) : pilotDraftHtml(draft), { headers: {
      "Content-Type": csv ? "text/csv; charset=utf-8" : "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="invoice-draft.${csv ? "csv" : "html"}"`,
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    } });
  });
}
