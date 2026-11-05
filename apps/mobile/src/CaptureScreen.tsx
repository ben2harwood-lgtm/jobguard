import React from "react";
import { View, Text, TextInput, Button } from "react-native";
export function CaptureScreen({ online, draft, onDraft, onCapture, rows, onMedia }: {
 online: boolean; draft: string; onDraft(value: string): void; onCapture(): void;
 rows: readonly { uploadId: string; status: string; isServerProof: false }[]; onMedia(kind: "voice" | "photo"): void;
}) {
 return <View accessibilityLabel="Synthetic capture"><Text>Capture a fictional note</Text>
  <TextInput accessibilityLabel="Fictional capture text" value={draft} onChangeText={onDraft} multiline />
  <Button title="Keep local text intent" onPress={onCapture} />
  <Button title="Photo capture — held" onPress={() => onMedia("photo")} />
  <Button title="Voice capture — held" onPress={() => onMedia("voice")} />
  <Text>General encrypted media awaits D08. Local intent is not verified proof.</Text>
  {online ? rows.map(row => <Text key={row.uploadId}>{row.status}</Text>) : <Text>Offline cache reads remain held.</Text>}
 </View>;
}
