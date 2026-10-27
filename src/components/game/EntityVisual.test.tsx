import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EntityVisual } from './EntityVisual';
import type { Entity } from '@/types';

const IMAGE = 'data:image/webp;base64,AAAA';

const entity = (extra: Partial<Entity>): Entity =>
  ({ id: 'e1', name: 'Sedge', ...extra }) as Entity;

describe('EntityVisual', () => {
  it('offers no corner button for an image-only entity', () => {
    render(<EntityVisual entity={entity({ images: [{ data: IMAGE }] })} />);
    expect(screen.getByAltText('Sedge')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^View / })).not.toBeInTheDocument();
  });

  it('renders nothing for an entity with no visual at all', () => {
    const { container } = render(<EntityVisual entity={entity({})} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('EntityVisual — gallery', () => {
  const IMAGE_B = 'data:image/webp;base64,BBBB';
  const two = () => entity({ images: [{ data: IMAGE }, { data: IMAGE_B }] });

  it('pages with the chevrons and counts the position', async () => {
    const onImageStep = vi.fn();
    render(<EntityVisual entity={two()} imageIndex={0} onImageStep={onImageStep} />);

    expect(screen.getByText('1/2')).toBeTruthy();
    await userEvent.click(screen.getByLabelText('Next image'));
    expect(onImageStep).toHaveBeenCalledWith(1);
    await userEvent.click(screen.getByLabelText('Previous image'));
    expect(onImageStep).toHaveBeenCalledWith(-1);
  });

  it('shows the picture at the given index', () => {
    const { container } = render(<EntityVisual entity={two()} imageIndex={1} onImageStep={() => {}} />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe(IMAGE_B);
  });

  it('clamps an index left over from a longer gallery instead of showing nothing', () => {
    const { container } = render(<EntityVisual entity={two()} imageIndex={9} onImageStep={() => {}} />);
    expect(container.querySelector('img')?.getAttribute('src')).toBe(IMAGE_B);
    expect(screen.getByText('2/2')).toBeTruthy();
  });

  it('stays plain for a single-picture entity — nothing to page', () => {
    render(<EntityVisual entity={entity({ images: [{ data: IMAGE }] })} imageIndex={0} onImageStep={() => {}} />);
    expect(screen.queryByLabelText('Next image')).toBeNull();
    expect(screen.queryByText('1/1')).toBeNull();
  });

  it('stays plain without a host to page it (the editor preview)', () => {
    render(<EntityVisual entity={two()} />);
    expect(screen.queryByLabelText('Next image')).toBeNull();
    expect(screen.queryByText('1/2')).toBeNull();
  });
});
