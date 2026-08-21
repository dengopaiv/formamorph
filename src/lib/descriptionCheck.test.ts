import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  checkDescriptions, composeCheckPrompt, buildCheckMessage, parseFindings,
  DEFAULT_DESC_CHECK_PROMPT, DEFAULT_CHECK_MAX_TOKENS,
} from './descriptionCheck';

const opts = { endpointUrl: 'http://x/v1/chat/completions', apiToken: 't', modelName: 'm' };

function mockFetch(impl: () => Response | Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(impl));
}

const reply = (content: string) =>
  new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe('DEFAULT_DESC_CHECK_PROMPT', () => {
  it('forbids rewriting, which is the whole point of a checking pass', () => {
    expect(DEFAULT_DESC_CHECK_PROMPT).toMatch(/do not rewrite/i);
  });

  it('asks after the round trip signature — an AI-facing note that says no more than the blurb', () => {
    expect(DEFAULT_DESC_CHECK_PROMPT).toMatch(/no more than the player-facing/i);
  });

  it('names the escape hatch the parser understands', () => {
    expect(DEFAULT_DESC_CHECK_PROMPT).toContain('NONE');
  });
});

describe('composeCheckPrompt', () => {
  it('resolves the subject for each kind', () => {
    expect(composeCheckPrompt(DEFAULT_DESC_CHECK_PROMPT, 'location')).toContain('this place');
    expect(composeCheckPrompt(DEFAULT_DESC_CHECK_PROMPT, 'character')).toContain('this character');
  });

  it('leaves no token behind', () => {
    expect(composeCheckPrompt(DEFAULT_DESC_CHECK_PROMPT, 'character')).not.toContain('<SUBJECT>');
  });

  it('treats a replacement pattern in the author edit as literal text', () => {
    // Split/join rather than String.replace: `$&` would otherwise expand to the matched token.
    expect(composeCheckPrompt('before <SUBJECT> $& after', 'location')).toBe('before this place $& after');
  });
});

describe('buildCheckMessage', () => {
  it('labels both sides with the names the editor shows', () => {
    const message = buildCheckMessage('  a blurb  ', '  a note  ');
    expect(message).toContain('Player-Facing Description:\na blurb');
    expect(message).toContain('AI-Facing Description:\na note');
  });
});

describe('parseFindings', () => {
  it('reads a lone NONE as agreement, however the model punctuates it', () => {
    expect(parseFindings('NONE')).toEqual([]);
    expect(parseFindings('none.')).toEqual([]);
    expect(parseFindings('  None!  ')).toEqual([]);
  });

  it('reads an empty response as agreement', () => {
    expect(parseFindings('   ')).toEqual([]);
  });

  it('strips bullets and numbering a model adds to its list', () => {
    expect(parseFindings('- first thing\n* second thing\n1. third\n2) fourth')).toEqual([
      'first thing', 'second thing', 'third', 'fourth',
    ]);
  });

  it('drops a hedged NONE line sitting among real findings', () => {
    expect(parseFindings('the blurb says ruined, the note says rebuilt\nNONE')).toEqual([
      'the blurb says ruined, the note says rebuilt',
    ]);
  });

  it('drops blank lines rather than reporting empty findings', () => {
    expect(parseFindings('one\n\n\ntwo')).toEqual(['one', 'two']);
  });
});

describe('checkDescriptions', () => {
  it('sends both descriptions and the composed prompt', async () => {
    mockFetch(() => reply('NONE'));
    await checkDescriptions('a blurb', 'a note', 'location', opts);
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body.messages[0].content).toContain('this place');
    expect(body.messages[1].content).toContain('a blurb');
    expect(body.messages[1].content).toContain('a note');
    expect(body.max_tokens).toBe(DEFAULT_CHECK_MAX_TOKENS);
    expect(body.stream).toBe(false);
  });

  it('honours an author template and cap over the shipped ones', async () => {
    mockFetch(() => reply('NONE'));
    await checkDescriptions('b', 'n', 'character', { ...opts, template: 'mine <SUBJECT>', maxTokens: 64 });
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body.messages[0].content).toBe('mine this character');
    expect(body.max_tokens).toBe(64);
  });

  it('falls back to the shipped prompt when the stored template is blank', async () => {
    mockFetch(() => reply('NONE'));
    await checkDescriptions('b', 'n', 'character', { ...opts, template: '   ' });
    const body = JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string);
    expect(body.messages[0].content).toContain('continuity editor');
  });

  it('returns the findings it was given', async () => {
    mockFetch(() => reply('- the blurb calls it ruined; the note calls it rebuilt'));
    await expect(checkDescriptions('b', 'n', 'location', opts))
      .resolves.toEqual(['the blurb calls it ruined; the note calls it rebuilt']);
  });

  it('treats agreement as a result, not an error', async () => {
    mockFetch(() => reply('NONE'));
    await expect(checkDescriptions('b', 'n', 'location', opts)).resolves.toEqual([]);
  });

  it('treats an empty completion as agreement rather than throwing', async () => {
    mockFetch(() => new Response(JSON.stringify({ choices: [{ message: {} }] }), { status: 200 }));
    await expect(checkDescriptions('b', 'n', 'location', opts)).resolves.toEqual([]);
  });

  it('throws on a non-OK response so the caller can say the check failed', async () => {
    mockFetch(() => new Response('nope', { status: 500 }));
    await expect(checkDescriptions('b', 'n', 'location', opts)).rejects.toThrow('HTTP 500');
  });
});
