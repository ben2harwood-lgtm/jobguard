import { extraLinkApplication, extraLinkFailure, extraLinkHeaders, extraLinkOrigin } from "../../../../lib/v2-extra-link-server";
export async function GET(_request: Request, { params }: { params: Promise<{ capability: string }> }) {
  try { return Response.json(await (await extraLinkApplication()).open((await params).capability), { headers: extraLinkHeaders }); }
  catch { return extraLinkFailure(); }
}
export async function POST(request: Request, { params }: { params: Promise<{ capability: string }> }) {
  try {
    extraLinkOrigin(request);
    return Response.json(await (await extraLinkApplication()).agree((await params).capability, await request.json()), { headers: extraLinkHeaders });
  } catch { return extraLinkFailure(); }
}
