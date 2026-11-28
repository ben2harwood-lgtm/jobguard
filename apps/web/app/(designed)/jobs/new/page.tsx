import { modelReaderOn } from "@jobguard/api/workspace";
import { DesignedNewJob } from "../../jobs-screens";

export const metadata = { title: "JobGuard · New job" };
// V2-SQ-G: read the switches per request, so the notice matches what the capture will do.
export const dynamic = "force-dynamic";
export default function NewJobPage() { return <DesignedNewJob modelReader={modelReaderOn(process.env)}/>; }
