import { notFound } from "next/navigation";
import PlatformDocumentsScreen from "./platform-documents-screen";
export const dynamic = "force-dynamic";
export default function PlatformDocumentsPage() {
  if (process.env.JOBGUARD_ENV !== "synthetic_demo") notFound();
  return <PlatformDocumentsScreen />;
}
