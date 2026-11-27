import { PilotJobs } from "../../pilot-jobs";
import { DesignedNewJob } from "../../jobs-screens";

export const dynamic = "force-dynamic";
export const metadata = { title: "JobGuard · New job" };
export default function NewJobPage() { if (process.env.JOBGUARD_ENV === "pilot_no_charge") return <PilotJobs screen="capture"/>; return <DesignedNewJob/>; }
