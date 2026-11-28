import { DesignedMore } from "../home-screens";

export const metadata = { title: "JobGuard · More" };
export default function MorePage() { return <DesignedMore crew={process.env.JOBGUARD_LOCAL_V2 === "1"}/>; }
