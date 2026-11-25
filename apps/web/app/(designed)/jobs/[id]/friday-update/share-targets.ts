// Match fridayMessage's first line without importing server/database code.
const practiceNotice = "Practice sandbox — synthetic data; nothing is sent or charged";

// Pass null until the snapshot has sentAt. Refuse a stripped notice rather than
// rewriting the text: every target must contain the exact recorded message.
export function shareTargets(message: string | null, canShare: boolean) {
  if (!message?.startsWith(`${practiceNotice}\n`)) return null;
  return {
    text: message,
    showShare: canShare,
    showFallback: !canShare,
    whatsappUrl: `https://wa.me/?text=${encodeURIComponent(message)}`,
  };
}
