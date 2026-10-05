// What the World Editor's authoring calls (✨ drafts, the summary, the 🔍 check) add to upstream's failure toast.
//
// They used to build their own `fetch`, and this module sent reasoning off and kept the server's message.
// Upstream now sends them through the request pipeline as editor request kinds, with reasoning resolved off
// whatever is stored, so only the second job is left.
//
// Upstream's toast reads the headline and puts the server's words behind **View Details**. That is one more
// thing to find and open for someone who cannot see the toast, and the server's message is usually the only
// part that says what to change. So it rides along as the toast's own second line.

import { AiStreamError } from './aiRequest/aiStream';

/** The toast-only line for a failed authoring call: what the server said, when it said anything. */
export function authoringServerNote(error: unknown): string | undefined {
  const message = error instanceof AiStreamError ? error.serverError?.message?.trim() : undefined;
  return message ? `The server said: ${message}` : undefined;
}
