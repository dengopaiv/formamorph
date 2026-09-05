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

  it('does not ask after the round trip, which was measured and does not work', () => {
    // Named in 1 run out of 96 across five models and four wordings; see the module's own note and
    // `snowpanther's notes/description-consistency-design.md` §11. `lib/authorBrief` makes the round trip
    // unrepresentable instead of asking a model to spot an absence. Re-adding this bullet costs output
    // tokens on every call for a finding that does not arrive, so it should not come back without new
    // evidence — which is what this test is here to insist on.
    expect(DEFAULT_DESC_CHECK_PROMPT).not.toMatch(/no more than the player-facing/i);
    expect(DEFAULT_DESC_CHECK_PROMPT).not.toMatch(/overwritten from the blurb/i);
  });

  it('still asks the two questions that do work', () => {
    expect(DEFAULT_DESC_CHECK_PROMPT).toMatch(/a fact one states and the other contradicts/i);
    expect(DEFAULT_DESC_CHECK_PROMPT).toMatch(/never accounts for/i);
  });

  it('asks the omission question from both sides, which is what makes it land', () => {
    // Cutting the round-trip bullet took omission detection down with it, because that bullet asked the
    // same question from the note's side and was priming it. The note-side framing lives inside the
    // surviving bullet now, and it bought the detections back: flash 75% -> 88%, cydonia 52% -> 78% on the
    // same fixtures and seeds, pooled 30/47 -> 39/47. Trimming this sentence as redundant is the thing
    // that was already measured and costs 20 points, so it is pinned here rather than left to taste.
    expect(DEFAULT_DESC_CHECK_PROMPT).toMatch(/narrator's only reference/i);
    expect(DEFAULT_DESC_CHECK_PROMPT).toMatch(/the narrator cannot use/i);
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

  it('collapses a checklist answer to the items that actually failed', () => {
    // The format that made a 24B finetune do the work at all (§14). Line by line this is nine findings, six
    // of which say nothing is wrong — measured at eight times as many dialog lines as the model reported.
    const raw = [
      '1. runs the harbor office at the river mouth',
      'The description accounts for this.',
      '',
      '2. pronounced limp, winch accident on the dock years ago',
      'The description accounts for this.',
      '',
      '3. SECRET: takes bribes from the night barges',
      'The description does not account for this.',
      '',
      '4. SECRET: his younger brother drowned at this landing',
      'The description does not account for this.',
    ].join('\n');
    const findings = parseFindings(raw);
    expect(findings).toHaveLength(2);
    expect(findings[0]).toContain('takes bribes');
    expect(findings[0]).toContain('does not account');
    expect(findings[1]).toContain('brother drowned');
  });

  it('is not fooled by "does not account for this" containing "account for this"', () => {
    // The one subtle thing in the whole parser: the pass pattern is a substring of the failure phrasing, so
    // order of testing decides whether every real finding is silently dropped.
    const raw = '1. a fact\nThe description does not account for this.\n2. another fact\nThe description accounts for this.';
    expect(parseFindings(raw)).toEqual(['a fact — The description does not account for this.']);
  });

  it('keeps a verdict it cannot classify, rather than assuming the item passed', () => {
    // A parser that guesses wrong here hides a real fault, so anything unreadable survives as a finding.
    const raw = '1. a fact\nThe description handles this oddly.\n2. another fact\nThe description accounts for this.';
    expect(parseFindings(raw)).toEqual(['a fact — The description handles this oddly.']);
  });

  it('leaves a numbered list of findings alone when it is not a checklist', () => {
    // Two numbered items whose second line is the same finding wrapped. No verdict anywhere, so the checklist
    // path must not claim it — the old behaviour has to survive the new one.
    const raw = '1. The brief says he limps\n2. The brief says the market opens at dusk';
    expect(parseFindings(raw)).toEqual([
      'The brief says he limps',
      'The brief says the market opens at dusk',
    ]);
  });

  it('still reads a wrapped free-text finding as one finding per line', () => {
    const raw = '- The brief states a one-eyed dog; the note never mentions an animal.';
    expect(parseFindings(raw)).toEqual(['The brief states a one-eyed dog; the note never mentions an animal.']);
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
