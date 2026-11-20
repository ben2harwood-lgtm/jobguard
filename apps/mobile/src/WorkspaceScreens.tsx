import React, { useRef, useState } from "react";
import { View, Text, TextInput, Button, ScrollView } from "react-native";
import type { Partition } from "./lifecycle-contracts";
import { nativeCoreScreens, type NativeCoreLoopScreens, type LoadedCoreScreen, type nativeReviewChoice } from "./core-loop-screens";
import type { DurableNativeQueue, QueueChoice } from "./durable-queue";
import type { QueueSelection } from "./reconciliation-controller";
import type { NativeDownloads } from "./download";
import type { FictionalAttachment, NativeCaptureUpload } from "./capture-upload";
import type { NativeCaptures } from "./capture";
import { CoreLoopScreen } from "./CoreLoopScreen";
import { ReconciliationScreen } from "./ReconciliationScreen";
import { OperativeWorkflow } from "./OperativeWorkflow";
import type { NativeOperativeScreens } from "./operative-screens";
import { CaptureScreen } from "./CaptureScreen";
export interface NativeWorkspaceBindings {
 partition: Partition; online: boolean; authorityGeneration: number; uuid(): string;
 operative?: NativeOperativeScreens; makeOperativeIntent?(jobId: string, text: string, description: string): unknown; onOperativeReview?(plan: unknown): void;
 assignedJobs?: Pick<NativeDownloads, "refresh">;
 core?: NativeCoreLoopScreens; queue?: DurableNativeQueue; captures?: NativeCaptures;
 captureUpload?: NativeCaptureUpload; captureFixture?(kind: "voice" | "photo"): FictionalAttachment;
 onReview?(choice: ReturnType<typeof nativeReviewChoice>): void;
 onReconcileChoice?(commandId: string | null, choice: QueueChoice): Promise<QueueSelection>;
}
/** Remount this owner-scoped component on user/tenant/session/generation change. No default provider. */
export function WorkspaceScreens({ binding }: { binding: NativeWorkspaceBindings }) {
 const [screen, setScreen] = useState<LoadedCoreScreen | null>(null);
 const [assigned, setAssigned] = useState<Awaited<ReturnType<NativeDownloads["refresh"]>> | null>(null);
 const [queue, setQueue] = useState<Awaited<ReturnType<DurableNativeQueue["views"]>>>([]);
 const [selection, setSelection] = useState<QueueSelection | null>(null);
 const [captures, setCaptures] = useState<Awaited<ReturnType<NativeCaptures["views"]>>>([]);
 const [draft, setDraft] = useState("Fictional "); const [job, setJob] = useState("");
 const [scope, setScope] = useState("");
 const [status, setStatus] = useState("Synthetic native adapters only"); const [busy, setBusy] = useState(false); const lock = useRef(false);
 async function run(work: () => Promise<void>) {
  if (lock.current) return; lock.current = true; setBusy(true);
  try { await work(); }
  catch { setScreen(null); setQueue([]); setSelection(null); setCaptures([]); setStatus("Held: current authority, encrypted storage or review is required."); }
  finally { lock.current = false; setBusy(false); }
 }
 return <ScrollView accessibilityLabel="Native shared workflows"><Text accessibilityRole="header">Synthetic field workflows</Text>
  <Text>{binding.online ? "Online source validation required for every load" : "Offline cache reads are held pending D08"}</Text>
  {nativeCoreScreens.map(name => <Button key={name} title={name.replaceAll("_", " ")} disabled={busy || !binding.online || !binding.core}
   onPress={() => binding.core && void run(async () => { setScreen(await binding.core!.load(name)); })} />)}
  {screen && binding.online ? <CoreLoopScreen screen={screen} online={binding.online} onReview={choice => {
   if (binding.onReview) binding.onReview(choice); else setStatus("The owning online review workflow is not connected.");
  }} /> : null}
  <Button title="Review queued commands" disabled={busy || !binding.online || !binding.queue} onPress={() => binding.queue && run(async () => {
   setSelection(null); await binding.queue!.restore(); setQueue(await binding.queue!.views());
  })} />
  <Button title="Retry one queued intent" disabled={busy || !binding.online || !binding.queue} onPress={() => binding.queue && run(async () => {
   setSelection(null);
   const result = await binding.queue!.flushOne(Date.now());
   try { setQueue(await binding.queue!.views()); }
   catch (error) {
    if (result?.reason !== "PERMISSION_REVOKED") throw error;
    setScreen(null); setQueue([]); setCaptures([]);
    setStatus("Permission was revoked. The original intent stays pending.");
   }
  })} />
  <ReconciliationScreen rows={queue} online={binding.online} selection={selection} busy={busy} onChoice={(commandId, choice) => {
   const reconcile = binding.onReconcileChoice;
   if (reconcile) return run(async () => { setSelection(null); setSelection(await reconcile(commandId, choice)); });
   setStatus("The owning online review is unavailable. The original intent stays pending.");
  }} />
  <TextInput accessibilityLabel="Fictional capture job UUID" value={job} onChangeText={setJob} autoCapitalize="none" autoCorrect={false} />
  {binding.captureFixture ? <TextInput accessibilityLabel="Fictional attachment scope UUID (optional)" value={scope} onChangeText={setScope} autoCapitalize="none" autoCorrect={false} /> : null}
  <CaptureScreen online={binding.online} busy={busy} draft={draft} onDraft={setDraft} rows={captures}
   {...(binding.captures ? { onRefresh: () => void run(async () => { setCaptures(await binding.captures!.views()); }) } : {})}
   {...(binding.captureUpload ? { onTransfer: (uploadId: string) => void run(async () => {
    setCaptures(await binding.captureUpload!.transfer(uploadId, setCaptures));
   }) } : {})}
   {...(binding.captureUpload && binding.captureFixture ? { onFixture: (kind: "voice" | "photo") => void run(async () => {
    const fixture = binding.captureFixture!(kind), now = Date.now();
    await binding.captureUpload!.keep({ version: "native-capture-upload.v1", environment: "synthetic_demo",
     jobId: job, scopeItemId: scope || null, attachment: { id: binding.uuid(), base64: fixture.base64 },
     capturedAtMs: now, expiresAtMs: now + 60 * 60 * 1000, contentType: fixture.contentType, finalizeCommandId: binding.uuid() });
    setStatus("Fictional attachment kept locally.");
    if (binding.online && binding.captures) setCaptures(await binding.captures.views());
   }) } : {})}
   onCapture={() => binding.captures && void run(async () => {
    await binding.captures!.text({ uploadId: binding.uuid(), jobId: job, scopeItemId: null, text: draft, capturedAtMs: Date.now() });
    setStatus("Local text intent retained. No server proof was created.");
    if (binding.online) setCaptures(await binding.captures!.views());
   })} onMedia={kind => { binding.captures?.media(kind, "unavailable"); setStatus("Voice/photo capture and general encrypted media remain held under D08."); }} />
  {binding.assignedJobs && !binding.operative ? <View>
   <Button title="Refresh assigned jobs" disabled={busy || !binding.online} onPress={() => {
    const source = binding.assignedJobs;
    if (source && binding.online) void run(async () => {
     setAssigned(null);
     setAssigned(await source.refresh());
    });
   }} />
   {binding.online && assigned ? (assigned.jobs.length
    ? assigned.jobs.map(row => <Text key={row.jobId}>{row.reference} · {row.priority}{row.dueOn ? ` · due ${row.dueOn}` : ""}</Text>)
    : <Text>No assigned jobs</Text>) : null}
  </View> : null}
  {binding.operative ? <OperativeWorkflow source={binding.operative} online={binding.online} busy={busy} uuid={binding.uuid} run={run} {...(binding.makeOperativeIntent ? { makeIntent: binding.makeOperativeIntent } : {})} {...(binding.onOperativeReview ? { onReview: binding.onOperativeReview } : {})} /> : binding.assignedJobs ? null : <Text>Operative source is not connected.</Text>}
  <View><Text accessibilityLiveRegion="polite">{status}</Text></View>
 </ScrollView>;
}
