import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { quoteDocumentV1, renderQuotePdf } from "@jobguard/core";
import { authenticatePracticeSession } from "@jobguard/db";
import { hasSyntheticSession, practiceFailure, syntheticPool } from "../../../lib/synthetic-server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const token = (await cookies()).get("jg_session")?.value;
  if (!hasSyntheticSession(token))
    return NextResponse.json({ code: "UNAUTHENTICATED" }, { status: 401 });

  try {
    await authenticatePracticeSession(syntheticPool(), token);
  } catch (error) {
    const denied = practiceFailure(error);
    if (denied) return denied;
    const code = error instanceof Error && "code" in error && error.code === "UNAUTHENTICATED"
      ? "UNAUTHENTICATED" : "DATABASE_UNAVAILABLE";
    return NextResponse.json({ code }, { status: code === "UNAUTHENTICATED" ? 401 : 503 });
  }

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
  const filenameReference = /^[A-Za-z0-9._-]+$/.test(document.reference) ? document.reference : "quote";
  const filename = `${filenameReference}-v${document.documentVersion}.pdf`;
  return new Response(pdf, { headers: {
    "content-type": "application/pdf",
    "content-disposition": `attachment; filename="${filename}"`,
    "cache-control": "no-store",
    "x-jobguard-processing-region": "supported-runtime",
  } });
}
