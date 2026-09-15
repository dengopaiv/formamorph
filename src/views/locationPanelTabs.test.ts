import { describe, it, expect } from 'vitest';
import { locationPanelTabsFor, locationTabForField } from './locationPanelTabs';

/**
 * The field-to-tab map behind Find's landing on the location panel.
 *
 * A hit on a field whose tab is not showing moves nothing a screen reader can report, so a field missing
 * from this map is a silent dead end rather than a cosmetic miss.
 */
describe('locationTabForField', () => {
  it("puts the Author's Brief on Details with the descriptions it drafts", () => {
    expect(locationTabForField('authorBrief')).toBe('details');
    expect(locationTabForField('playerDescription')).toBe('details');
  });

  it('names a tab Simple mode still shows', () => {
    const simple = new Set<string>(locationPanelTabsFor(false).map((t) => t.value));
    expect(simple.has(locationTabForField('authorBrief') as string)).toBe(true);
  });
});
