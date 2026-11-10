import { DesignedToday } from "./home-screens";

// The home page opens the designed Today screen. The previous home screen is kept at /classic.
export const metadata = { title: "JobGuard · Today" };
export default function Home() { return <DesignedToday/>; }
