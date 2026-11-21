import React from "react";
import { View, Text, TextInput, Button, ScrollView } from "react-native";
import { closeoutQuestionText, residentConfirmationStatementV1, logSiteExtraV4 } from "@jobguard/core";
import type { NativeOperativeScreens } from "./operative-screens";
export type OperativeWorkStatus = typeof logSiteExtraV4.shape.workStatus.options[number];
type Jobs = Awaited<ReturnType<NativeOperativeScreens["assigned"]>>;
type Visit = Awaited<ReturnType<NativeOperativeScreens["visit"]>>;
type Extra = Awaited<ReturnType<NativeOperativeScreens["extra"]>>;
export function OperativeScreen({ online, jobs, selectedJob, note, description, workStatus, photoId, visit, extra, busy, canQueue,
 onLoad, onSelect, onNote, onDescription, onWorkStatus, onPhoto, onVisit, onQueue, onPhotoReview, onOpenReview }: {
 online: boolean; jobs: Jobs | null; selectedJob: string; note: string; description: string; workStatus: OperativeWorkStatus | null; photoId: string; visit: Visit | null; extra: Extra | null; busy: boolean; canQueue: boolean;
 onLoad(): void; onSelect(jobId: string): void; onNote(value: string): void; onDescription(value: string): void; onWorkStatus(value: OperativeWorkStatus): void; onPhoto(value: string): void;
 onVisit(answer: "yes" | "no" | null): void; onQueue(): void; onPhotoReview(hash: string | null): void; onOpenReview(plan: Visit | Extra): void;
}) {
 if (!online) return <Text>Operative offline assignment reads are held pending D08.</Text>;
 const confirmationHash = extra && "contentSha256" in extra ? extra.contentSha256 : null;
 return <ScrollView accessibilityLabel="Operative field workflow"><Text accessibilityRole="header">Assigned work</Text>
  <Button title="Refresh assigned jobs" onPress={onLoad} disabled={busy} />
  {jobs?.jobs.map(job => <View key={job.jobId}><Text>{job.reference} — {job.priority} — {job.visitState}</Text><Button title={`Select ${job.reference}`} disabled={busy} onPress={() => onSelect(job.jobId)} /></View>)}
  <Text>Visit and close-out</Text><Text>{closeoutQuestionText}</Text>
  <Button title="Review visit" disabled={busy || !selectedJob} onPress={() => onVisit(null)} />
  <Button title="Close-out answer yes" disabled={busy || !selectedJob} onPress={() => onVisit("yes")} />
  <Button title="Close-out answer no" disabled={busy || !selectedJob} onPress={() => onVisit("no")} />
  {visit ? <Text>{visit.state}{"reason" in visit ? `: ${visit.reason}` : ""}</Text> : null}
  {visit?.state === "ready_for_server_validation" ? <Button title="Open visit server review" disabled={busy} onPress={() => onOpenReview(visit)} /> : null}
  <Text>Log an extra — fictional note only</Text><TextInput accessibilityLabel="Fictional operative note" value={note} onChangeText={onNote} multiline />
  <TextInput accessibilityLabel="Fictional extra description" value={description} onChangeText={onDescription} maxLength={500} />
  <Button title="Queue note intent" disabled={busy || !selectedJob || !canQueue} onPress={onQueue} />
  <Text>Photo and resident statement</Text><Text>General photo capture is held. Only a server-verified existing fictional photo may be reviewed.</Text>
  <TextInput accessibilityLabel="Existing fictional photo evidence UUID" value={photoId} onChangeText={onPhoto} autoCapitalize="none" autoCorrect={false} />
  <Text>{workStatus ? workStatus.replaceAll("_", " ") : "Choose the work status"}</Text>
  {logSiteExtraV4.shape.workStatus.options.map(value => <Button key={value} title={`Work ${value.replaceAll("_", " ")}`} disabled={busy} onPress={() => onWorkStatus(value)} />)}
  <Button title="Review photo extra" disabled={busy || !selectedJob || !workStatus} onPress={() => onPhotoReview(null)} />
  {extra ? <Text>{extra.state}{"reason" in extra ? `: ${extra.reason}` : ""}</Text> : null}
  <Text>{residentConfirmationStatementV1}</Text>
  {confirmationHash ? <View><Text>{confirmationHash}</Text><Button title="Resident confirms this exact content" disabled={busy} onPress={() => onPhotoReview(confirmationHash)} /></View> : null}
  {extra?.state === "ready_for_server_validation" ? <Button title="Open extra server review" disabled={busy} onPress={() => onOpenReview(extra)} /> : null}
  <Text>Queued is not logged. A resident statement is not verified identity or contractor approval. Origin and proof remain server-authorized.</Text>
 </ScrollView>;
}
