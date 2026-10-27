import type { ChatMessage, RequestMessage } from '@/types';

/** A message's text: the string itself, or the text parts of a message with images. */
export function messageText(message: RequestMessage): string {
  if (typeof message.content === 'string') return message.content;
  return message.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n\n');
}

/** A message as history holds it: its text alone. */
export const asTextMessage = (message: RequestMessage): ChatMessage => ({ role: message.role, content: messageText(message) });
