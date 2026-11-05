import React from "react";
import { View, Text, Button, ScrollView } from "react-native";
import { coreLoopActionAvailabilityV1, type CoreLoopActionV1 } from "@jobguard/core";
import { nativeReviewChoice, type LoadedCoreScreen } from "./core-loop-screens";
function label(value: string) { return value.replaceAll("_", " ").replace(/([a-z])([A-Z])/gu, "$1 $2"); }
function fields(value: unknown, prefix = "", depth = 0): string[] {
 if (value === null || value === undefined) return [`${prefix}: Details needed`];
 if (typeof value !== "object") return [`${prefix}: ${String(value)}`];
 if (depth >= 4) return [`${prefix}: Open the full online review for details`];
 return Object.entries(value).filter(([key]) => !["version", "environment"].includes(key))
  .flatMap(([key, child]) => fields(child, `${prefix ? `${prefix} / ` : ""}${label(key)}`, depth + 1));
}
/** Presentation of shared models only. These controls open review; none executes money/state changes. */
export function CoreLoopScreen({ screen, online, onReview }: { screen: LoadedCoreScreen; online: boolean; onReview(choice: ReturnType<typeof nativeReviewChoice>): void }) {
 if (!online) return <Text>Offline cache reads are held pending D08.</Text>;
 return <ScrollView accessibilityLabel={label(screen.view.screen)}><Text accessibilityRole="header">{label(screen.view.screen)}</Text>
  {fields(screen.view.data).map((row, index) => <Text key={index}>{row}</Text>)}
  {screen.view.actions.map(row => {
   const availability = coreLoopActionAvailabilityV1(row.action as CoreLoopActionV1, screen.context);
   return <View key={row.action}><Text>{availability.state.replaceAll("_", " ")}</Text><Button title={`Review ${label(row.action)}`} disabled={availability.state === "blocked"}
    onPress={() => { if (availability.state !== "blocked") onReview(nativeReviewChoice(screen, row.action, online)); }} /></View>;
  })}
  <Text>Intent is not approval, delivery, verified proof or settled payment.</Text>
 </ScrollView>;
}
