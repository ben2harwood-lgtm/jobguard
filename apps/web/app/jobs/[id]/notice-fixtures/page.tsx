import { noticeFixtureRealNoticeRefusal } from "@jobguard/api/workspace";
import { notFound } from "next/navigation";
import { NoticeFixtureScreen } from "./screen";
export const dynamic = "force-dynamic";
export default async function NoticeFixturesPage({ params }: { params: Promise<{ id: string }> }) {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") notFound();
  const { id } = await params;
  return <NoticeFixtureScreen key={id} jobId={id} realNoticeRefusal={noticeFixtureRealNoticeRefusal()} />;
}
