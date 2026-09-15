import { describe, it, expect } from 'vitest';
import {
  AuthoringRequestError, authoringFailureMessage, authoringReasoningBody, authoringRequestError,
} from './authoringRequest';
import { UNKNOWN_REASONING_CAPABILITY, nonReasoningCapability, type ReasoningCapability } from './reasoningEffort';

const record = (over: Partial<ReasoningCapability>): ReasoningCapability => ({ ...UNKNOWN_REASONING_CAPABILITY, ...over });

describe('authoringReasoningBody', () => {
  it('sends nothing to an endpoint nothing has answered for, as before reasoning was resolved', () => {
    expect(authoringReasoningBody()).toEqual({});
    expect(authoringReasoningBody({ capability: null })).toEqual({});
    expect(authoringReasoningBody({ capability: UNKNOWN_REASONING_CAPABILITY })).toEqual({});
  });

  it('sends reasoning_effort none only where the endpoint lists it', () => {
    expect(authoringReasoningBody({ capability: record({ reasons: true, levels: ['none', 'low', 'high'] }) }))
      .toEqual({ reasoning_effort: 'none' });
    expect(authoringReasoningBody({ capability: record({ reasons: true, levels: ['low', 'high'] }) })).toEqual({});
  });

  it('sends a zero budget to an endpoint that takes one', () => {
    expect(authoringReasoningBody({ capability: record({ reasons: true, budget: true }) }))
      .toEqual({ thinking_budget_tokens: 0 });
  });

  it('sends the bundled engine a zero budget and never the effort hint', () => {
    expect(authoringReasoningBody({ localEngine: true, capability: record({ levels: ['none'] }) }))
      .toEqual({ thinking_budget_tokens: 0 });
  });

  it('sends nothing to a model the record says does not reason', () => {
    expect(authoringReasoningBody({ capability: { ...nonReasoningCapability('native'), budget: true } })).toEqual({});
  });
});

describe('authoringRequestError', () => {
  it("keeps the server's own message from an OpenAI-style error body", async () => {
    const res = new Response(JSON.stringify({ error: { message: 'temperature is not supported' } }), { status: 400 });
    const error = await authoringRequestError(res);
    expect(error.status).toBe(400);
    expect(error.serverMessage).toBe('temperature is not supported');
    expect(authoringFailureMessage('Failed to check the descriptions.', error))
      .toBe('Failed to check the descriptions. The server said: temperature is not supported');
  });

  it('falls back to the fixed sentence when the body says nothing', async () => {
    const error = await authoringRequestError(new Response('', { status: 502 }));
    expect(error.message).toBe('HTTP 502');
    expect(authoringFailureMessage('Failed to generate summary.', error)).toBe('Failed to generate summary.');
    expect(authoringFailureMessage('Failed to generate summary.', new Error('boom'))).toBe('Failed to generate summary.');
    expect(new AuthoringRequestError(500)).toBeInstanceOf(Error);
  });
});
