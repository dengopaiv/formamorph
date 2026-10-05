import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  bridgeDescription, bridgePrompt, composeBridgePrompt,
  DEFAULT_PLAYER_DESC_PROMPT, DEFAULT_AI_DESC_PROMPT,
} from './bridgeDescription';
import { sentBody, sseReply, stubStream, textSnapshot } from '@/test/aiTextFixtures';

const opts = { snapshot: textSnapshot() };

afterEach(() => vi.unstubAllGlobals());

const systemOf = (spy: ReturnType<typeof stubStream>) => (sentBody(spy).messages as { content: string }[])[0].content;

describe('bridgePrompt', () => {
  it('tells the player-facing direction to hold private material back', () => {
    const prompt = bridgePrompt('playerDesc', 'character');
    expect(prompt).toMatch(/secrets/i);
    expect(prompt).toMatch(/player reads/i);
  });

  it('tells the AI-facing direction to stay consistent with the blurb', () => {
    expect(bridgePrompt('aiDesc', 'character')).toMatch(/consistent with every fact/i);
  });

  it('describes the subject differently per kind', () => {
    expect(bridgePrompt('playerDesc', 'character')).toMatch(/appearance/i);
    expect(bridgePrompt('playerDesc', 'location')).toMatch(/atmosphere/i);
  });
});

describe('bridgeDescription', () => {
  it('returns the trimmed answer on success', async () => {
    stubStream(sseReply('  Rewritten.  '));
    await expect(bridgeDescription('note', 'playerDesc', 'character', opts)).resolves.toBe('Rewritten.');
  });

  it('sends the direction-specific prompt, the source text, its cap and its sampler pin', async () => {
    const spy = stubStream(sseReply('ok'));
    await bridgeDescription('blurb', 'aiDesc', 'location', opts);
    const body = sentBody(spy);
    expect(body.model).toBe('m');
    expect(body.temperature).toBe(0.6);
    expect(body.max_tokens).toBe(400);
    expect(body.messages).toEqual([
      { role: 'system', content: bridgePrompt('aiDesc', 'location') },
      { role: 'user', content: 'blurb' },
    ]);
  });

  it('throws on a non-OK response', async () => {
    stubStream(() => new Response('nope', { status: 500 }));
    await expect(bridgeDescription('x', 'playerDesc', 'character', opts)).rejects.toThrow('HTTP 500');
  });

  it('throws on an empty answer', async () => {
    stubStream(sseReply('   '));
    await expect(bridgeDescription('x', 'playerDesc', 'character', opts)).rejects.toThrow('empty answer');
  });
});

describe('composeBridgePrompt', () => {
  it('expands both tokens for the subject kind', () => {
    const out = composeBridgePrompt('About <SUBJECT>, covering <FACETS>.', 'location');
    expect(out).toBe('About this place, covering layout, atmosphere, and what stands out on arrival.');
  });

  it('expands every occurrence, not just the first', () => {
    // The player-facing default names the subject twice; a replace() would have filled only one.
    expect(composeBridgePrompt('<SUBJECT> and <SUBJECT>', 'character')).toBe('this character and this character');
  });

  it('leaves a template carrying no tokens alone', () => {
    expect(composeBridgePrompt('Just write something.', 'character')).toBe('Just write something.');
  });

  it('shipped defaults resolve to the wording each direction is meant to carry', () => {
    expect(composeBridgePrompt(DEFAULT_PLAYER_DESC_PROMPT, 'character')).toBe(bridgePrompt('playerDesc', 'character'));
    expect(composeBridgePrompt(DEFAULT_AI_DESC_PROMPT, 'location')).toBe(bridgePrompt('aiDesc', 'location'));
    // No token survives expansion — a leaked <SUBJECT> would reach the model as literal text.
    expect(bridgePrompt('aiDesc', 'location')).not.toMatch(/<SUBJECT>|<FACETS>/);
  });
});

describe('bridgeDescription — author overrides', () => {
  it("sends the author's template, expanded for the kind", async () => {
    const spy = stubStream(sseReply('ok'));
    await bridgeDescription('note', 'playerDesc', 'location', { ...opts, template: 'Describe <SUBJECT>: <FACETS>.' });
    expect(systemOf(spy)).toBe('Describe this place: layout, atmosphere, and what stands out on arrival.');
  });

  it("honors the author's output cap", async () => {
    const spy = stubStream(sseReply('ok'));
    await bridgeDescription('note', 'aiDesc', 'character', { ...opts, maxTokens: 1500 });
    expect(sentBody(spy).max_tokens).toBe(1500);
  });

  it('falls back to the shipped default when the template is blank', async () => {
    // A cleared field must not send an empty system prompt — the generation would be unguided.
    const spy = stubStream(sseReply('ok'));
    await bridgeDescription('note', 'aiDesc', 'character', { ...opts, template: '   ' });
    expect(systemOf(spy)).toBe(bridgePrompt('aiDesc', 'character'));
  });
});
