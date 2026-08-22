import { describe, it, expect } from 'vitest';
import { hasBrief, draftSource } from './authorBrief';

describe('hasBrief', () => {
  it('treats whitespace as no brief, the same way the overwrite warning treats an empty field', () => {
    expect(hasBrief('- windows face east')).toBe(true);
    expect(hasBrief('')).toBe(false);
    expect(hasBrief('   \n\t ')).toBe(false);
    expect(hasBrief(undefined)).toBe(false);
    expect(hasBrief(null)).toBe(false);
  });
});

describe('draftSource', () => {
  it('drafts from the brief when there is one', () => {
    expect(draftSource('- classroom\n- windows face east', 'the other description'))
      .toBe('- classroom\n- windows face east');
  });

  it('falls back to the other description, which is how the buttons worked before the brief existed', () => {
    // The whole migration story: a world written before this field drafts exactly as it always did, with
    // nothing to convert and no mode to be in.
    expect(draftSource(undefined, 'the other description')).toBe('the other description');
    expect(draftSource('', 'the other description')).toBe('the other description');
    expect(draftSource('  \n ', 'the other description')).toBe('the other description');
  });

  it('is empty when neither exists, so a drafting button has nothing to send', () => {
    expect(draftSource(undefined, undefined)).toBe('');
    expect(draftSource('', '')).toBe('');
    expect(draftSource(null, null)).toBe('');
  });

  it('trims whichever it returns', () => {
    expect(draftSource('  - windows face east  ', null)).toBe('- windows face east');
    expect(draftSource(null, '  a blurb  ')).toBe('a blurb');
  });

  it('prefers the brief even when the other description is longer and more polished', () => {
    // The point of the field: what the author wrote wins over what a model wrote, regardless of which
    // reads better. A three-word brief still roots the graph.
    const polished = 'A gray-bearded man in a tarred oilskin coat who limps between the barges.';
    expect(draftSource('- limps\n- gray beard', polished)).toBe('- limps\n- gray beard');
  });
});
