import { assertExtraLinkMode } from "@jobguard/db";
import { notFound } from "next/navigation";
import { ChangeDrafts } from "./view";
export const dynamic = "force-dynamic";
// V2-F3: change a quantity on the accepted quote; pending changes stay apart until agreed.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  try { assertExtraLinkMode(); } catch { notFound(); }
  return <ChangeDrafts jobId={(await params).id} />;
}
