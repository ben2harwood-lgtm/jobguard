// Local walkthrough stack (not a test): synthetic database on 55442 kept alive until killed. Ben 6 Nov demo walkthroughs.
import setup from "./walkthrough-db.ts";
const stop = await setup();
console.log("WALKTHROUGH DB READY");
const bye = async () => { try { await stop(); } finally { process.exit(0); } };
process.on("SIGTERM", bye); process.on("SIGINT", bye);
setInterval(() => {}, 1 << 30);
