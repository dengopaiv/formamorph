// What a screen reader is told while a row is being dragged in the editor's trees (locations, entities,
// traits). dnd-kit's stock announcements name the raw droppable id — "Draggable item loc-b was moved over
// droppable area loc-b" — and say the same words before and after a depth change, so the sideways half of
// the gesture produced no spoken feedback at all: only the visual indent confirmed a press had landed.
//
// These build the sentence from the drop projection itself, so what is heard is what would be committed.
//
// Pure and stateless: the caller resolves ids to names and hands over the finished description.

/** Where a drag would land, in words the caller has already resolved. */
export interface TreeDropDescription {
  /** Projected depth, counted from 0 at the top level. */
  depth: number;
  /** The row the drop would nest into, or null at the top level. */
  parentName: string | null;
  /** The row it would sit directly below, or null when it lands first inside its parent. */
  afterName: string | null;
}

/**
 * The row that ends up directly above the drop, without building the reordered array to find it.
 *
 * `arrayMove(rows, from, to)[to - 1]` is what the drop projections read, and this is that element: removing
 * the dragged row shifts everything below it up one, so a drag *downwards* leaves `rows[to]` in the slot
 * above, while any other drag leaves `rows[to - 1]` where it was. A test pins both branches against the real
 * `arrayMove`, so the shortcut cannot quietly drift from the projection it mirrors.
 */
const rowAbove = <N,>(rows: readonly N[], activeIndex: number, overIndex: number): N | undefined =>
  rows[overIndex > activeIndex ? overIndex : overIndex - 1];

/**
 * Where a drag would land, resolved to names. Returns null when there is nothing to describe — no row under
 * the drag, or a projection the tree declined to make.
 */
export function describeDrop(
  rows: readonly { id: string; depth: number }[],
  activeId: string,
  overId: string | null,
  projection: { depth: number; parentId: string | null } | null,
  nameOf: (id: string) => string | null,
): TreeDropDescription | null {
  if (!overId || !projection) return null;
  const activeIndex = rows.findIndex((n) => n.id === activeId);
  const overIndex = rows.findIndex((n) => n.id === overId);
  if (activeIndex === -1 || overIndex === -1) return null;

  const previous = rowAbove(rows, activeIndex, overIndex);
  return {
    depth: projection.depth,
    parentName: projection.parentId ? nameOf(projection.parentId) : null,
    // Landing first inside a parent puts that parent directly above — "inside Hallway, below Hallway" says
    // one thing twice, so that case reads as "first" instead.
    afterName: previous && previous.id !== projection.parentId ? nameOf(previous.id) : null,
  };
}

/** "level 2, inside Hallway, below Pantry" — the three things a press can change, in one phrase. */
const place = ({ depth, parentName, afterName }: TreeDropDescription): string =>
  `level ${depth + 1}, ${parentName ? `inside ${parentName}` : 'at the top level'}, `
  + (afterName ? `below ${afterName}` : 'first');

const sentence = (s: string): string => `${s.charAt(0).toUpperCase()}${s.slice(1)}.`;

/** Lifting names the row, because every announcement after this one leaves it out. */
export const announceLift = (name: string, at: TreeDropDescription | null): string =>
  at ? `Picked up ${name}, ${place(at)}.` : `Picked up ${name}.`;

/**
 * Moving deliberately omits the row's name: it cannot change mid-drag, and repeating it in front of every
 * arrow press buries the part that did change.
 *
 * Returning `undefined` leaves the live region alone. So does returning the same words as last time — a
 * press the tree refuses changes nothing, and silence is the honest answer to a move that did not happen.
 */
export const announceMove = (at: TreeDropDescription | null): string | undefined =>
  at ? sentence(place(at)) : undefined;

export const announceDrop = (name: string, at: TreeDropDescription | null): string =>
  at ? `Dropped ${name}, ${place(at)}.` : `Dropped ${name}.`;

export const announceCancel = (name: string): string => `Cancelled. ${name} is back where it began.`;
