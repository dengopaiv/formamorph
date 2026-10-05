import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { toast } from 'react-toastify';
import AiGenerateButton from './AiGenerateButton';
import { AiStreamError } from '@/lib/aiRequest/aiStream';
import { openLatestDetails, toastTexts } from '@/test/toastText';

vi.mock('react-toastify', () => ({
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
// The button reads the image tag prompt and the authoring prompts and caps; nothing else here matters.
vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({
    activeEndpointUrl: 'http://x', activeApiToken: '', activeModelName: 'm', imageTagPrompt: 'p',
    playerDescPrompt: '', aiDescPrompt: '', aiSummaryPrompt: '',
    descMaxTokens: { playerdesc: 400, aidesc: 400, aisummary: 80, desccheck: 300 },
  }),
}));

const summarizeDescription = vi.hoisted(() => vi.fn());
// The model call is the seam; everything above it is the button's own.
vi.mock('@/lib/summarize', () => ({ summarizeDescription }));

const bridgeDescription = vi.hoisted(() => vi.fn(async () => 'a fresh draft'));
// Only the network call is stubbed: the prompt composition stays real.
vi.mock('@/lib/bridgeDescription', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/bridgeDescription')>()),
  bridgeDescription,
}));

const onChange = vi.fn();
const generate = () => fireEvent.click(screen.getByRole('button', { name: /Generate AI-facing description/i }));

const setup = (target?: string) => render(
  <AiGenerateButton mode="aiDesc" source="a player-facing blurb" onChange={onChange} kind="character" target={target} />,
);

describe('AiGenerateButton overwrite guard', () => {
  beforeEach(() => { bridgeDescription.mockClear(); onChange.mockClear(); });

  it('drafts straight into an empty field, with nothing in the way', async () => {
    // The rule the guard is built on: an empty target cannot lose anything, so a first draft is one click.
    setup('');
    generate();
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('a fresh draft'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('treats a whitespace-only field as empty', async () => {
    setup('   \n ');
    generate();
    await waitFor(() => expect(bridgeDescription).toHaveBeenCalled());
  });

  it('asks before replacing writing that is already there, and generates nothing yet', async () => {
    setup('One. Two. Three.');
    generate();
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('3 sentences');
    expect(dialog).toHaveTextContent('AI-Facing Description');
    expect(bridgeDescription).not.toHaveBeenCalled();
  });

  it('generates once the replacement is confirmed', async () => {
    setup('One. Two. Three.');
    generate();
    fireEvent.click(await screen.findByRole('button', { name: 'Replace' }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('a fresh draft'));
  });

  it('leaves the field alone when the replacement is declined', async () => {
    setup('One. Two. Three.');
    generate();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(bridgeDescription).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });
});

function press(change = vi.fn()) {
  render(<AiGenerateButton mode="summary" source="A marsh guide." onChange={change} />);
  fireEvent.click(screen.getByRole('button', { name: 'Generate summary' }));
  return change;
}

describe('AiGenerateButton', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps its headline for a failed generation and puts the cause behind View Details', async () => {
    summarizeDescription.mockRejectedValue(new Error('HTTP 503: model is loading'));
    const change = press();

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toastTexts(vi.mocked(toast.error))).toEqual(['Failed to generate summary.View Details →']);
    expect(openLatestDetails(vi.mocked(toast.error))?.details).toContain('HTTP 503: model is loading');
    expect(change).not.toHaveBeenCalled();
  });

  it("says the server's own message on the toast, not only behind View Details", async () => {
    summarizeDescription.mockRejectedValue(
      new AiStreamError('http', 'HTTP 400', { status: 400, serverError: { message: 'max_tokens is too large' } }),
    );
    press();

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toastTexts(vi.mocked(toast.error))[0]).toContain('The server said: max_tokens is too large');
  });

  it('shows no toast for a canceled generation', async () => {
    summarizeDescription.mockRejectedValue(new DOMException('The operation was aborted.', 'AbortError'));
    press();

    await waitFor(() => expect(summarizeDescription).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Generate summary' })).toBeEnabled());
    expect(toast.error).not.toHaveBeenCalled();
  });
});
