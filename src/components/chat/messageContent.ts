// Shared message-text parsing used by MessageBubble, ChatInterface and
// PinnedMessagesPanel. Lives in its own module (not MessageBubble.tsx) so
// fast-refresh stays happy: component files should only export components.

export interface ParsedMessageContent {
  mainText: string;
  oocText: string | null;
}

export const parseMessageContent = (text: string, role: string): ParsedMessageContent => {
  if (role === 'model') {
    const oocMatch = text.match(/<ooc>([\s\S]*?)<\/ooc>/i);
    if (oocMatch) {
      return {
        mainText: text.replace(/<ooc>[\s\S]*?<\/ooc>/i, '').trim(),
        oocText: oocMatch[1].trim()
      };
    }
  } else if (role === 'user') {
    const noteMatch = text.match(/\[Director's Note: ([\s\S]*?)\]/i);
    if (noteMatch) {
      return {
        mainText: text.replace(/\[Director's Note: [\s\S]*?\]/i, '').trim(),
        oocText: noteMatch[1].trim()
      };
    }
  }
  return { mainText: text, oocText: null };
};
