import { assertExtraLinkMode } from "@jobguard/db";
import { notFound } from "next/navigation";
import { BuilderExtraLinks } from "./view";
export const dynamic = "force-dynamic";
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  try { assertExtraLinkMode(); } catch { notFound(); }
  return <BuilderExtraLinks jobId={(await params).id} />;
}
