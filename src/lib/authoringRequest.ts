// What the World Editor's authoring calls (✨ drafts, the summary, the 🔍 check) add to their own requests.
//
// Those three build their own `fetch` rather than going through `aiRequestSpec`, because they run outside a
// turn and have no `AIRequestType` (see D4 in `snowpanther's notes/TODO.md`). That used to cost nothing. Once
// upstream resolved native reasoning per request kind, it cost two things this module answers:
//
// - **Reasoning is sent off.** A reasoning model left at its default thinks inside output caps of 80–400
//   tokens, and the summary in particular comes back empty. These are short, deterministic passes, the same
//   kind upstream ships with reasoning off (stat updates, choices). An empty answer and a slow one also sound
//   the same in the 🔍 dialog to someone who cannot see a spinner: silence.
// - **A refusal says why.** A bare `HTTP 400` gave nothing to act on. The server's own message is kept.

import { readServerError } from './aiRequest/aiStream';
import { reasoningEffortBody, reasoningRuledOut, type ReasoningCapability, type ReasoningEffortField } from './reasoningEffort';

/** What the caller knows about the active endpoint's reasoning, from the settings context. */
export interface AuthoringReasoning {
  capability?: ReasoningCapability | null;
  /** The desktop bundled engine, which always takes a token budget and ignores the effort hint. */
  localEngine?: boolean;
}

/**
 * The reasoning slice of an authoring request: off, in whichever shape the endpoint understands.
 *
 * A budget of 0 goes to the bundled engine and to any endpoint that takes a budget. `reasoning_effort: "none"`
 * goes only where the capability record says the endpoint accepts it, the same guard the turn pipeline
 * uses, so a backend that rejects the field is never sent it. An endpoint nothing has answered for gets
 * neither, exactly as before this module existed.
 */
export function authoringReasoningBody(
  { capability, localEngine }: AuthoringReasoning = {},
): { thinking_budget_tokens?: number; reasoning_effort?: ReasoningEffortField } {
  const budget = localEngine || (!!capability?.budget && !reasoningRuledOut(capability));
  return {
    ...(budget ? { thinking_budget_tokens: 0 } : {}),
    ...(localEngine ? {} : reasoningEffortBody('none', capability)),
  };
}

/** A non-OK authoring response, carrying the server's own message when it sent one. */
export class AuthoringRequestError extends Error {
  readonly status: number;
  readonly serverMessage?: string;

  constructor(status: number, serverMessage?: string) {
    super(serverMessage ? `HTTP ${status}: ${serverMessage}` : `HTTP ${status}`);
    this.name = 'AuthoringRequestError';
    this.status = status;
    this.serverMessage = serverMessage;
  }
}

/** Read a failed response into an `AuthoringRequestError`. */
export async function authoringRequestError(res: Response): Promise<AuthoringRequestError> {
  return new AuthoringRequestError(res.status, (await readServerError(res))?.message);
}

/** The toast line for a failed authoring call: the fixed sentence, then what the server said, if anything. */
export function authoringFailureMessage(sentence: string, error: unknown): string {
  return error instanceof AuthoringRequestError && error.serverMessage
    ? `${sentence} The server said: ${error.serverMessage}`
    : sentence;
}
