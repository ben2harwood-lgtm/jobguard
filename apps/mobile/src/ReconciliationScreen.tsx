import React from "react";
import { View, Text, Button } from "react-native";
import type { NativeReconciliationRow as Row } from "./durable-queue";
/** Metadata/navigation only. There is no discard, re-key, automatic resend or approval control. */
export function ReconciliationScreen({ rows, online, onChoice }: { rows: readonly Row[]; online: boolean; onChoice(commandId: string | null, choice: Row["choices"][number]): void }) {
 if (!online) return <Text>Offline cache reads are held pending D08.</Text>;
 return <View accessibilityLabel="Queued command reconciliation"><Text>Queued commands</Text>
  {rows.map((row, index) => <View key={row.commandId ?? `quarantine-${index}`}><Text>{row.state}</Text><Text>{row.reason ?? "Pending server validation"}</Text>
   {row.choices.map(choice => <Button key={choice} title={choice.replaceAll("_", " ")} onPress={() => onChoice(row.commandId, choice)} />)}
  </View>)}<Text>Queued intent is never sent or paid. Commercial changes require current online review.</Text></View>;
}
