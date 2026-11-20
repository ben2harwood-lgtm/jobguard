import React from "react";
import { View, Text, TextInput, Button } from "react-native";
import type { CaptureView } from "./capture-upload";

const labels = { local_only: "Local only", uploading: "Uploading", verified: "Server verified", rejected: "Rejected", conflict: "Conflict" };
export function CaptureScreen({ online, busy, draft, onDraft, onCapture, rows, onMedia, onRefresh, onTransfer, onFixture }: {
 online: boolean; busy?: boolean; draft: string; onDraft(value: string): void; onCapture(): void;
 rows: readonly CaptureView[]; onMedia(kind: "voice" | "photo"): void;
 onRefresh?: () => void; onTransfer?: (uploadId: string) => void; onFixture?: (kind: "voice" | "photo") => void;
}) {
 return <View accessibilityLabel="Synthetic capture"><Text>Capture a fictional note</Text>
  <TextInput accessibilityLabel="Fictional capture text" value={draft} onChangeText={onDraft} multiline />
  <Button title="Keep local text intent" onPress={onCapture} disabled={busy ?? false} />
  <Button title="Photo capture — held" onPress={() => onMedia("photo")} />
  <Button title="Voice capture — held" onPress={() => onMedia("voice")} />
  <Text>General encrypted media awaits D08. Local intent is not verified proof.</Text>
  {onFixture ? <>
   <Button title="Keep fictional photo attachment" disabled={busy ?? false} onPress={() => onFixture("photo")} />
   <Button title="Keep fictional WAV attachment" disabled={busy ?? false} onPress={() => onFixture("voice")} />
  </> : null}
  {online ? <>
   {onRefresh ? <Button title="Review saved captures" disabled={busy ?? false} onPress={onRefresh} /> : null}
   {rows.map(row => <View key={row.uploadId}>
    <Text>{row.kind === "voice" ? "Fictional WAV" : row.kind === "photo" ? "Fictional photo" : "Fictional note"}</Text>
    <Text accessibilityLiveRegion="polite">{labels[row.status]}</Text>
    {row.status === "uploading" ? <Text>{row.nextOffset} of {row.byteLength} bytes confirmed</Text> : null}
    {row.kind === "voice" ? <Text>Voice processing queued</Text> : null}
    {row.kind !== "text" && onTransfer && (row.status === "local_only" || row.status === "uploading") ?
     <Button title={row.status === "local_only" ? "Upload attachment" : "Resume upload"} disabled={busy ?? false} onPress={() => onTransfer(row.uploadId)} /> : null}
   </View>)}
  </> : <Text>Offline cache reads remain held.</Text>}
 </View>;
}
