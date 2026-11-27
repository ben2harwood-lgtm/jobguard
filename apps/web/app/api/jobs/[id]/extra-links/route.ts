import { extraLinkApplication, extraLinkFailure, extraLinkHeaders, extraLinkOrigin } from "../../../../lib/v2-extra-link-server";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { return Response.json(await (await extraLinkApplication()).list((await params).id), { headers: extraLinkHeaders }); }
  catch { return extraLinkFailure(); }
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    extraLinkOrigin(request);
    return Response.json(await (await extraLinkApplication()).command((await params).id, await request.json()), { headers: extraLinkHeaders });
  } catch { return extraLinkFailure(); }
}
