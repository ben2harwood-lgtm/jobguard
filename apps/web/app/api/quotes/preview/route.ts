import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { quoteDocumentV1, renderQuotePdf } from "@jobguard/core";
import { hasSyntheticSession } from "../../../lib/synthetic-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!hasSyntheticSession((await cookies()).get("jg_session")?.value))
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });

  const parsed = quoteDocumentV1.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ code: "INVALID_QUOTE_DOCUMENT" }, { status: 400 });

  const document = parsed.data;
  const lineNet = document.lines.reduce((sum, line) => sum + BigInt(line.netPence), 0n);
  if (lineNet !== BigInt(document.netPence)
    || BigInt(document.subtotalPence) - BigInt(document.discountPence) !== BigInt(document.netPence)
    || BigInt(document.netPence) + BigInt(document.taxPence) !== BigInt(document.totalPence))
    return NextResponse.json({ code: "INVALID_QUOTE_DOCUMENT" }, { status: 400 });

  const pdf = renderQuotePdf(document);
  return new Response(pdf, { headers: {
    "content-type": "application/pdf",
    "content-disposition": `attachment; filename="${document.reference}-v${document.documentVersion}.pdf"`,
    "cache-control": "no-store",
    "x-jobguard-processing-region": "supported-runtime",
  } });
}
