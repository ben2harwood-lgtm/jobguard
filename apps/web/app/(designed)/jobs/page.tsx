import { PilotJobs } from "../pilot-jobs";
import { DesignedJobs } from "../jobs-screens";

export const dynamic = "force-dynamic";
export const metadata = { title: "JobGuard · Jobs" };
export default function JobsPage() { if (process.env.JOBGUARD_ENV === "pilot_no_charge") return <PilotJobs screen="list"/>; return <DesignedJobs/>; }
