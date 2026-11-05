import { isValidElement, type ReactNode, type ReactElement } from "react";
import { expect, it, vi } from "vitest";
vi.mock("react-native", () => ({ View: "View", Text: "Text", ScrollView: "ScrollView", TextInput: "TextInput", Button: "Button" }));
import { CoreLoopScreen } from "./CoreLoopScreen";
import { ReconciliationScreen } from "./ReconciliationScreen";
import { CaptureScreen } from "./CaptureScreen";
import { acceptanceIntentViewV1, coreLoopActionContextV1 } from "@jobguard/core";
function nodes(node: ReactNode): ReactElement<Record<string, unknown>>[] {
 if (Array.isArray(node)) return node.flatMap(nodes);
 if (!isValidElement<Record<string, unknown>>(node)) return [];
 return [node, ...nodes(node.props.children as ReactNode)];
}
const id = "10000000-0000-4000-8000-000000000001";
it("offline screens render no saved command or commercial details or action buttons", () => {
 const context = coreLoopActionContextV1.parse({ version: "core-loop-action-context.v1", environment: "synthetic_demo", online: true, authorized: true,
  connectionId: id, refreshedConnectionId: id, current: { tenantId: id, jobId: id, subjectId: id, revision: 1, contentHash: "a".repeat(64) }, review: null });
 const screen = { context, partition: { userId: id, tenantId: id, membershipId: id, mobileSessionId: id, deviceInstanceId: "fictional" }, view: acceptanceIntentViewV1(context) };
 const callback = vi.fn();
 expect(nodes(CoreLoopScreen({ screen, online: false, onReview: callback })).filter(v => v.type === "Button")).toEqual([]);
 expect(nodes(ReconciliationScreen({ rows: [], online: false, onChoice: callback })).filter(v => v.type === "Button")).toEqual([]);
 const buttons = nodes(CoreLoopScreen({ screen, online: true, onReview: callback })).filter(v => v.type === "Button");
 (buttons[0]!.props.onPress as () => void)(); expect(callback).toHaveBeenCalledWith(expect.objectContaining({ executed: false, requiresOwningOnlineReview: true }));
});
it("capture controls retain permission-recovery paths and label local intent as unverified", () => {
 const media = vi.fn();
 const elements = nodes(CaptureScreen({ online: false, draft: "Fictional note", onDraft: vi.fn(), onCapture: vi.fn(), rows: [], onMedia: media }));
 expect(elements.some(v => v.props.accessibilityLabel === "Fictional capture text")).toBe(true);
 const photo = elements.find(v => v.props.title === "Photo capture — held")!; (photo.props.onPress as () => void)(); expect(media).toHaveBeenCalledWith("photo");
});
