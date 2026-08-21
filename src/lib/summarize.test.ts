import { describe, it, expect, vi, afterEach } from 'vitest';
import { summarizeDescription, DEFAULT_AI_SUMMARY_PROMPT, DEFAULT_SUMMARY_MAX_TOKENS } from './summarize';

const opts = { endpointUrl: 'http://x/v1/chat/completions', apiToken: 't', modelName: 'm' };

function mockFetch(impl: () => Response | Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(impl));
}

afterEach(() => vi.unstubAllGlobals());

describe('summarizeDescription', () => {
  it('returns the trimmed message content on success', async () => {
    mockFetch(() =>
      new Response(JSON.stringify({ choices: [{ message: { content: '  A short summary.  ' } }] })),
    );
    await expect(summarizeDescription('long text', opts)).resolves.toBe('A short summary.');
  });

  it('sends the model, prompt, and a bearer token', async () => {
    const fetchSpy = vi.fn((_url: string, _init: RequestInit) =>
      new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })),
    );
    vi.stubGlobal('fetch', fetchSpy);
    await summarizeDescription('desc', opts);
    const [, init] = fetchSpy.mock.calls[0];
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('m');
    expect(body.stream).toBe(false);
    expect(body.messages.at(-1)).toEqual({ role: 'user', content: 'desc' });
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer t');
  });

  it('throws on a non-OK response', async () => {
    mockFetch(() => new Response('nope', { status: 500 }));
    await expect(summarizeDescription('x', opts)).rejects.toThrow('HTTP 500');
  });

  it('throws on an empty content response', async () => {
    mockFetch(() => new Response(JSON.stringify({ choices: [{ message: { content: '   ' } }] })));
    await expect(summarizeDescription('x', opts)).rejects.toThrow('Empty summary response');
  });
});

describe('summarizeDescription — author overrides', () => {
  const sendAndRead = async (fn: () => Promise<unknown>) => {
    const fetchSpy = vi.fn((_url: string, _init: RequestInit) =>
      new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })),
    );
    vi.stubGlobal('fetch', fetchSpy);
    await fn();
    return JSON.parse(fetchSpy.mock.calls[0][1].body as string);
  };

  it('sends the shipped prompt and cap by default', async () => {
    const body = await sendAndRead(() => summarizeDescription('desc', opts));
    expect(body.messages[0]).toEqual({ role: 'system', content: DEFAULT_AI_SUMMARY_PROMPT });
    expect(body.max_tokens).toBe(DEFAULT_SUMMARY_MAX_TOKENS);
  });

  it("sends the author's template and cap when given", async () => {
    const body = await sendAndRead(() =>
      summarizeDescription('desc', { ...opts, template: 'Two sentences, no more.', maxTokens: 300 }),
    );
    expect(body.messages[0]).toEqual({ role: 'system', content: 'Two sentences, no more.' });
    expect(body.max_tokens).toBe(300);
  });

  it('falls back to the shipped prompt when the template is blank', async () => {
    const body = await sendAndRead(() => summarizeDescription('desc', { ...opts, template: '  ' }));
    expect(body.messages[0].content).toBe(DEFAULT_AI_SUMMARY_PROMPT);
  });
});
