import { describe, it, expect } from 'vitest';
import { countSentences, overwriteWarning } from './descriptionOverwrite';

describe('countSentences', () => {
  it('counts an empty or blank field as nothing to lose', () => {
    expect(countSentences('')).toBe(0);
    expect(countSentences('   \n  ')).toBe(0);
  });

  it('counts unterminated prose as one sentence rather than none', () => {
    expect(countSentences('a room with no full stop')).toBe(1);
  });

  it('counts each terminator that ends the text or is followed by space', () => {
    expect(countSentences('One. Two! Three?')).toBe(3);
    expect(countSentences('Only one.')).toBe(1);
  });

  it('reads a run of dots as one terminator, not four', () => {
    expect(countSentences('Wait… what?')).toBe(2);
    expect(countSentences('Wait... what?')).toBe(2);
  });

  it('does not count a decimal point mid-number', () => {
    expect(countSentences('The tower is 3.5 metres tall.')).toBe(1);
  });

  it('counts a terminator inside closing punctuation', () => {
    expect(countSentences('"Get out." She left.')).toBe(2);
  });
});

describe('overwriteWarning', () => {
  it('warns about nothing when the target field is empty', () => {
    // The rule the whole module exists for: a first draft must not meet a dialog.
    expect(overwriteWarning('', 'AI-Facing Description')).toBeNull();
    expect(overwriteWarning(undefined, 'AI-Facing Description')).toBeNull();
    expect(overwriteWarning('  ', 'AI-Facing Description')).toBeNull();
  });

  it('names the field and how much of it goes', () => {
    const warning = overwriteWarning('One. Two. Three.', 'AI-Facing Description');
    expect(warning).toContain('3 sentences');
    expect(warning).toContain('AI-Facing Description');
  });

  it('says sentence rather than sentences for a one-line field', () => {
    expect(overwriteWarning('Just the one.', 'Player-Facing Description')).toContain('1 sentence of');
  });

  it('says the loss is recoverable, because it is', () => {
    expect(overwriteWarning('Something.', 'Player-Facing Description')).toMatch(/undo/i);
  });
});
