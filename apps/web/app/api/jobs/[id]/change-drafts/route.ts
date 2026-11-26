import { changeDraftApplication, changeDraftFailure, changeDraftHeaders, changeDraftOrigin } from "../../../../lib/v2-change-draft-server";
// V2-F3: GET lists accepted lines and drafts; POST previews (writes nothing) or confirms, revises or adds time.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { return Response.json(await (await changeDraftApplication()).list((await params).id), { headers: changeDraftHeaders }); }
  catch (error) { return changeDraftFailure(error); }
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    changeDraftOrigin(request);
    const body = await request.json().catch(() => null) as { version?: unknown } | null;
    const app = await changeDraftApplication(), jobId = (await params).id;
    return Response.json(body?.version === "v2-change-draft-preview.v1" ? await app.preview(jobId, body) : await app.command(jobId, body),
      { headers: changeDraftHeaders });
  } catch (error) { return changeDraftFailure(error); }
}
