import { notFound } from "next/navigation";
import { InboundMailTray } from "./tray";
export const dynamic = "force-dynamic";
export default function InboundMailPage() {
 if(process.env.JOBGUARD_LOCAL_V2!=="1" || process.env.JOBGUARD_ENV!=="synthetic_demo")notFound();
 return <InboundMailTray/>;
}
