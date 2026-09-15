// The keyboard's half of the drag-trees' horizontal axis. In these trees (locations, entities, traits) the
// pointer's `delta.x` is the whole nesting gesture: the drop projection reads it as a signed count of indents
// and answers with the depth the row would land at. A keyboard has no `delta.x`, so this turns one arrow
// press into the offset a pointer would have had to travel — and asks the projection what that offset really
// means before committing to it, so the two axes stay one mechanism rather than two that resemble each other.
//
// Pure and stateless: the caller supplies the projection as a closure over whatever it is projecting against.

/** The drag offset that reads back as `depth` for a row whose own depth is `activeDepth`. The exact inverse
 *  of the projection's `Math.round(dragOffset / indentWidth)`, so a round trip is lossless. */
export const offsetForDepth = (depth: number, activeDepth: number, indentWidth: number): number =>
  (depth - activeDepth) * indentWidth;

/**
 * The drag offset one level `step` away from where the drag currently reads — snapped to the depth the
 * projection actually grants.
 *
 * Snapping is the point. The projection clamps a candidate depth to what the rows around the drop allow, so
 * an unsnapped offset would keep growing past the deepest legal level and every one of those presses would
 * have to be spent again on the way back. Re-projecting the candidate and storing *its* answer means the
 * offset never says more than the tree agreed to: at a boundary the press is a no-op, and the row is always
 * exactly `n` presses from the depth `n` levels away.
 *
 * `project` returning null (no drop in flight) leaves the offset alone.
 */
export function depthStepOffset(
  project: (offsetLeft: number) => number | null,
  activeDepth: number,
  offsetLeft: number,
  step: 1 | -1,
  indentWidth: number,
): number {
  const from = project(offsetLeft);
  if (from === null) return offsetLeft;
  const landed = project(offsetForDepth(from + step, activeDepth, indentWidth));
  return landed === null ? offsetLeft : offsetForDepth(landed, activeDepth, indentWidth);
}
