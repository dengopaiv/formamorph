import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import EntityFields from './EntityFields';
import type { Entity } from '@/types';

// Each field becomes a marker carrying its label and value, with its `labelAside` rendered inside it — so a
// generate button can be attributed to the field it sits on rather than merely counted on the page.
vi.mock('@/components/prompt/PlaceholderField', () => ({
  default: ({ label, value, labelAside }: { label: string; value?: string; labelAside?: React.ReactNode }) => (
    <div data-testid="field" data-label={label} data-value={value ?? ''}>{labelAside}</div>
  ),
  PlaceholderNameField: () => <div />,
}));
vi.mock('@/components/AiGenerateButton', () => ({
  default: ({ mode, source }: { mode: string; source?: string }) => (
    <div data-testid="gen" data-mode={mode} data-source={source ?? ''} />
  ),
}));
vi.mock('@/components/DescriptionCheckButton', () => ({ default: () => <div /> }));
vi.mock('./ImageTagsField', () => ({ default: () => <div /> }));
vi.mock('../lib/UtilityComponents', () => ({ ModelUpload: () => <div /> }));

const BRIEF = '- classroom, second floor\n- windows face east';
const setup = (value: Partial<Entity>) =>
  render(<EntityFields value={{ id: 'e1', name: 'Ordec', ...value } as Entity} onChange={vi.fn()} />);

const field = (label: string) =>
  screen.getAllByTestId('field').find((f) => f.getAttribute('data-label') === label);

describe("EntityFields — the Author's Brief", () => {
  it('offers the field, above both descriptions', () => {
    setup({ authorBrief: BRIEF });
    const labels = screen.getAllByTestId('field').map((f) => f.getAttribute('data-label'));
    expect(field("Author's Brief")).toHaveAttribute('data-value', BRIEF);
    expect(labels.indexOf("Author's Brief")).toBeLessThan(labels.indexOf('Player-Facing Description'));
    expect(labels.indexOf("Author's Brief")).toBeLessThan(labels.indexOf('AI-Facing Description'));
  });

  it('never puts a generate button on it — the invariant the whole field rests on', () => {
    // If anything ever drafts into the brief it stops being a root, and the round trip that this field
    // exists to make unrepresentable is back. Asserted here rather than trusted to review.
    setup({ authorBrief: BRIEF, playerDescription: 'a blurb', aiDescription: 'a note' });
    expect(within(field("Author's Brief")!).queryAllByTestId('gen')).toHaveLength(0);
    expect(screen.getAllByTestId('gen').map((g) => g.getAttribute('data-mode')).sort())
      .toEqual(['aiDesc', 'playerDesc', 'summary']);
  });

  it('drafts both descriptions from the brief, not from each other', () => {
    setup({ authorBrief: BRIEF, playerDescription: 'a blurb', aiDescription: 'a note' });
    const source = (mode: string) => screen.getAllByTestId('gen')
      .find((g) => g.getAttribute('data-mode') === mode)?.getAttribute('data-source');
    expect(source('playerDesc')).toBe(BRIEF);
    expect(source('aiDesc')).toBe(BRIEF);
  });

  it('falls back to the other description when no brief is written', () => {
    // A world made before this field drafts exactly as it always did.
    setup({ playerDescription: 'a blurb', aiDescription: 'a note' });
    const source = (mode: string) => screen.getAllByTestId('gen')
      .find((g) => g.getAttribute('data-mode') === mode)?.getAttribute('data-source');
    expect(source('playerDesc')).toBe('a note');
    expect(source('aiDesc')).toBe('a blurb');
  });

  it('leaves the summary drafting from the AI-facing description, which is still a leaf', () => {
    setup({ authorBrief: BRIEF, aiDescription: 'a note' });
    expect(screen.getAllByTestId('gen').find((g) => g.getAttribute('data-mode') === 'summary'))
      .toHaveAttribute('data-source', 'a note');
  });
});
