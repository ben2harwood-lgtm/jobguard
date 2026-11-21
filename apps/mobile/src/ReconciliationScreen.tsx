import React from "react";
import { View, Text, Button } from "react-native";
import type { NativeReconciliationRow as Row } from "./durable-queue";
import type { QueueReviewFlow, QueueSelection } from "./reconciliation-controller";

const reviewTitles: Record<QueueReviewFlow, string> = {
 contractor_note: "Contractor site extra", work_state: "Job work state", send_quote: "Quote delivery",
 issue_invoice: "Customer invoice", place_order: "Purchase order",
};

export function ReconciliationScreen({ rows, online, selection, busy, onChoice }: {
 rows: readonly Row[]; online: boolean; selection?: QueueSelection | null; busy?: boolean;
 onChoice(commandId: string | null, choice: Row["choices"][number]): void;
}) {
 if (!online) return <Text>Offline cache reads are held pending D08.</Text>;
 const original = selection?.kind === "saved" || selection?.kind === "review_unavailable" ? selection.original
  : selection?.kind === "review" ? selection.review.original : null;
 return <View accessibilityLabel="Queued command reconciliation"><Text>Queued commands</Text>
  {rows.map((row, index) => <View key={`${row.commandId ?? "quarantine"}-${index}`}><Text>{row.state}</Text><Text>{row.reason ?? "Pending server validation"}</Text>
   {row.commandId && <Text>{row.commandId}</Text>}
   {row.choices.map(choice => <Button key={choice} title={choice.replaceAll("_", " ")} disabled={busy ?? false} onPress={() => onChoice(row.commandId, choice)} />)}
  </View>)}
  {selection?.kind === "pending" && <Text>Original intent kept pending.</Text>}
  {selection?.kind === "retry" && <Text>The original intent can retry when its backoff ends.</Text>}
  {selection?.kind === "quarantined" && <Text>The original entry is retained. Its contents could not be verified.</Text>}
  {selection?.kind === "review_unavailable" && <Text>Current online review is unavailable. The original intent stays pending.</Text>}
  {selection?.kind === "review" && <View accessibilityLabel="Current online review">
   <Text accessibilityRole="header">{reviewTitles[selection.review.target.flow]}</Text>
   <Text>Current server revision {selection.review.current.revision}</Text>
  </View>}
  {original && <View accessibilityLabel="Original saved intent"><Text accessibilityRole="header">Original saved intent</Text>
   <Text>{JSON.stringify(original.offlineIntent ?? original.upload, null, 2)}</Text>
  </View>}
  <Text>Queued intent is never sent or paid. Commercial changes require current online review.</Text>
 </View>;
}
