import { extraLinkApplication, extraLinkFailure, extraLinkHeaders } from "../../../../../../lib/v2-extra-link-server";
export async function GET(_request: Request, { params }: { params: Promise<{ capability: string; photoId: string }> }) {
  try {
    const { capability, photoId } = await params;
    const object = await (await extraLinkApplication()).photo(capability, photoId);
    return new Response(new Uint8Array(object.bytes), { headers: { ...extraLinkHeaders, "Content-Type": object.contentType } });
  } catch { return extraLinkFailure(); }
}
