import React, { useRef, useState } from "react";
import { View, Text, TextInput, Button, ScrollView } from "react-native";
import type { Partition } from "./lifecycle-contracts";
import { nativeCoreScreens, type NativeCoreLoopScreens, type LoadedCoreScreen, type nativeReviewChoice } from "./core-loop-screens";
import type { DurableNativeQueue } from "./durable-queue";
import type { NativeCaptures } from "./capture";
import { CoreLoopScreen } from "./CoreLoopScreen";
import { ReconciliationScreen } from "./ReconciliationScreen";
import { CaptureScreen } from "./CaptureScreen";
export interface NativeWorkspaceBindings {
 partition: Partition; online: boolean; authorityGeneration: number; uuid(): string;
 core?: NativeCoreLoopScreens; queue?: DurableNativeQueue; captures?: NativeCaptures;
 onReview?(choice: ReturnType<typeof nativeReviewChoice>): void;
 onReconcileChoice?(commandId: string | null, choice: string): void;
}
/** Remount this owner-scoped component on user/tenant/session/generation change. No default provider. */
export function WorkspaceScreens({ binding }: { binding: NativeWorkspaceBindings }) {
 const [screen, setScreen] = useState<LoadedCoreScreen | null>(null);
 const [queue, setQueue] = useState<Awaited<ReturnType<DurableNativeQueue["views"]>>>([]);
 const [captures, setCaptures] = useState<Awaited<ReturnType<NativeCaptures["views"]>>>([]);
 const [draft, setDraft] = useState("Fictional "); const [job, setJob] = useState("");
 const [status, setStatus] = useState("Synthetic native adapters only"); const [busy, setBusy] = useState(false); const lock = useRef(false);
 async function run(work: () => Promise<void>) {
  if (lock.current) return; lock.current = true; setBusy(true);
  try { await work(); }
  catch { setScreen(null); setQueue([]); setCaptures([]); setStatus("Held: current authority, encrypted storage or review is required."); }
  finally { lock.current = false; setBusy(false); }
 }
 return <ScrollView accessibilityLabel="Native shared workflows"><Text accessibilityRole="header">Synthetic field workflows</Text>
  <Text>{binding.online ? "Online source validation required for every load" : "Offline cache reads are held pending D08"}</Text>
  {nativeCoreScreens.map(name => <Button key={name} title={name.replaceAll("_", " ")} disabled={busy || !binding.online || !binding.core}
   onPress={() => binding.core && void run(async () => { setScreen(await binding.core!.load(name)); })} />)}
  {screen && binding.online ? <CoreLoopScreen screen={screen} online={binding.online} onReview={choice => {
   if (binding.onReview) binding.onReview(choice); else setStatus("The owning online review workflow is not connected.");
  }} /> : null}
  <Button title="Review queued commands" disabled={busy || !binding.online || !binding.queue} onPress={() => binding.queue && void run(async () => { setQueue(await binding.queue!.views()); })} />
  <Button title="Retry one queued intent" disabled={busy || !binding.online || !binding.queue} onPress={() => binding.queue && void run(async () => { await binding.queue!.flushOne(Date.now()); setQueue(await binding.queue!.views()); })} />
  <ReconciliationScreen rows={queue} online={binding.online} onChoice={(commandId, choice) => {
   if (binding.onReconcileChoice) binding.onReconcileChoice(commandId, choice); else setStatus("Keep the original intent pending; the owning online review is not connected.");
  }} />
  <TextInput accessibilityLabel="Fictional capture job UUID" value={job} onChangeText={setJob} autoCapitalize="none" autoCorrect={false} />
  <CaptureScreen online={binding.online} draft={draft} onDraft={setDraft} rows={captures}
   onCapture={() => binding.captures && void run(async () => {
    await binding.captures!.text({ uploadId: binding.uuid(), jobId: job, scopeItemId: null, text: draft, capturedAtMs: Date.now() });
    setStatus("Local text intent retained. No server proof was created.");
    if (binding.online) setCaptures(await binding.captures!.views());
   })} onMedia={kind => { binding.captures?.media(kind, "unavailable"); setStatus("Voice/photo capture and general encrypted media remain held under D08."); }} />
  <View><Text accessibilityLiveRegion="polite">{status}</Text></View>
 </ScrollView>;
}
