import React, { useState } from "react";
import { Text, View } from "react-native";
import type { NativeOperativeScreens } from "./operative-screens";
import { OperativeScreen, type OperativeWorkStatus } from "./OperativeScreen";
export function OperativeWorkflow({ source, online, busy, uuid, makeIntent, run, onReview }: {
 source: NativeOperativeScreens; online: boolean; busy: boolean; uuid(): string;
 makeIntent?: (jobId: string, text: string, description: string) => unknown; run(work: () => Promise<void>): Promise<void>; onReview?: (plan: unknown) => void;
}) {
 const [jobs, setJobs] = useState<Awaited<ReturnType<NativeOperativeScreens["assigned"]>> | null>(null);
 const [job, setJob] = useState(""); const [note, setNote] = useState("Fictional "); const [photo, setPhoto] = useState("");
 const [description, setDescription] = useState("Fictional "); const [workStatus, setWorkStatus] = useState<OperativeWorkStatus | null>(null);
 const [visit, setVisit] = useState<Awaited<ReturnType<NativeOperativeScreens["visit"]>> | null>(null);
 const [extra, setExtra] = useState<Awaited<ReturnType<NativeOperativeScreens["extra"]>> | null>(null);
 const [photoCommandId, setPhotoCommandId] = useState(""); const [status, setStatus] = useState("No operative command executed");
 async function safely(work: () => Promise<void>) {
  await run(async () => { try { await work(); } catch { setJobs(null); setVisit(null); setExtra(null); setStatus("Operative authority or proof refused. Original pending intents remain preserved."); } });
 }
 return <View><OperativeScreen online={online} jobs={jobs} selectedJob={job} note={note} description={description} workStatus={workStatus} photoId={photo} visit={visit} extra={extra} busy={busy} canQueue={makeIntent !== undefined}
  onLoad={() => void safely(async () => { setJobs(await source.assigned(online)); })}
  onSelect={value => { setJob(value); setVisit(null); setExtra(null); setWorkStatus(null); }} onNote={value => { setNote(value); setExtra(null); }} onPhoto={value => { setPhoto(value); setExtra(null); }} onDescription={value => { setDescription(value); setExtra(null); }} onWorkStatus={value => { setWorkStatus(value); setExtra(null); }}
  onVisit={answer => void safely(async () => { setVisit(await source.visit({ jobId: job, commandId: uuid(), closeoutAnswer: answer }, online)); })}
  onQueue={() => makeIntent && void safely(async () => { await source.note(makeIntent(job, note, description), online, job, { note, description }); setStatus("Queued intent retained; server logging is not yet acknowledged."); })}
  onPhotoReview={hash => void safely(async () => {
   if (!workStatus) { setStatus("Choose the work status before photo review."); return; }
   const commandId = hash === null ? uuid() : photoCommandId; if (hash === null) setPhotoCommandId(commandId);
   setExtra(await source.extra({ jobId: job, draft: { version: "log-site-extra.v4", commandId, note, description, workStatus }, photoId: photo || null, shownContentSha256: hash }, online));
  })}
  onOpenReview={plan => { if (onReview) onReview(plan); else setStatus("The owning online operative command flow is not connected. Nothing was executed."); }} />
  <Text accessibilityLiveRegion="polite">{online ? status : "Offline cache reads held"}</Text></View>;
}
