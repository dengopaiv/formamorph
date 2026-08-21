import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DescriptionCheckButton from './DescriptionCheckButton';

vi.mock('@/contexts/SettingsContext', () => ({
  useSettings: () => ({
    activeEndpointUrl: 'http://x', activeApiToken: '', activeModelName: 'm',
    descCheckPrompt: 'stored template',
    descMaxTokens: { playerdesc: 400, aidesc: 400, aisummary: 80, desccheck: 300 },
  }),
}));

const checkDescriptions = vi.hoisted(() => vi.fn(async () => [] as string[]));
vi.mock('@/lib/descriptionCheck', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/descriptionCheck')>()),
  checkDescriptions,
}));

const props = { playerText: 'a blurb', aiText: 'a note', kind: 'location' as const, subjectName: 'The Eelhouse' };
const check = () => fireEvent.click(screen.getByRole('button', { name: /Check the two descriptions/i }));

describe('DescriptionCheckButton', () => {
  beforeEach(() => { checkDescriptions.mockClear(); checkDescriptions.mockResolvedValue([]); });

  it('waits for both descriptions before it can compare them', () => {
    // One description cannot disagree with a description that has not been written.
    const { rerender } = render(<DescriptionCheckButton {...props} aiText="" />);
    expect(screen.getByRole('button', { name: /Check the two descriptions/i })).toBeDisabled();
    rerender(<DescriptionCheckButton {...props} playerText="   " />);
    expect(screen.getByRole('button', { name: /Check the two descriptions/i })).toBeDisabled();
    rerender(<DescriptionCheckButton {...props} />);
    expect(screen.getByRole('button', { name: /Check the two descriptions/i })).toBeEnabled();
  });

  it("sends both descriptions, the author's template and its cap", async () => {
    render(<DescriptionCheckButton {...props} />);
    check();
    await screen.findByRole('dialog');
    expect(checkDescriptions).toHaveBeenCalledWith('a blurb', 'a note', 'location', expect.objectContaining({
      template: 'stored template', maxTokens: 300,
    }));
  });

  it('says the two agree rather than showing an empty report', async () => {
    render(<DescriptionCheckButton {...props} />);
    check();
    expect(await screen.findByRole('dialog')).toHaveTextContent('The two descriptions agree.');
  });

  it('names the subject and counts the findings, and says nothing was changed', async () => {
    checkDescriptions.mockResolvedValue(['the blurb says ruined; the note says rebuilt', 'the note adds no private detail']);
    render(<DescriptionCheckButton {...props} />);
    check();
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('The Eelhouse');
    expect(dialog).toHaveTextContent('2 things to look at');
    expect(dialog).toHaveTextContent('Nothing has been changed.');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('counts one finding as a thing, not things', async () => {
    checkDescriptions.mockResolvedValue(['the blurb says ruined; the note says rebuilt']);
    render(<DescriptionCheckButton {...props} />);
    check();
    expect(await screen.findByRole('dialog')).toHaveTextContent('1 thing to look at');
  });
});
