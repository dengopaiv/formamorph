// The shared drag-tree scaffold behind LocationTree, EntityTree and TraitTree: a flat sortable list where
// vertical drag reorders and horizontal drag changes nesting depth. Each tree supplies an adapter (visible
// rows, depth projection, drop commit, per-row presentation); everything else — sensors, drag state, the row
// chrome (grip / chevron / duplicate / delete) — lives here once.
//
// Both axes answer to the keyboard too: space lifts the row under the focused grip, up/down walk it through
// the list, left/right take it out of or into the row above, space drops it. See `coordinateGetter` below —
// the sideways half is ours, because dnd-kit's own only knows how to find a droppable it can see.
//
// IMPORTANT: never clamp the drag's X. A full-axis bounding modifier (restrictToParentElement /
// restrictToFirstScrollableAncestor / restrictToVerticalAxis) clamps the horizontal delta and breaks
// depth-based nesting (see TraitTree history). Clamping only Y is fine and is exactly what
// `restrictYToScrollAncestor` below does — it's why these trees can live in a ScrollArea without the
// auto-scroll running away, while other lists (which don't need free X) use the stock both-axis modifiers.
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { EditorRow, EditorRowList, TREE_INDENT } from '@/components/EditorRow';
import { X, Copy } from 'lucide-react';
import {
  DndContext, pointerWithin, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
  type CollisionDetection, type Modifier, type KeyboardCoordinateGetter, type ScreenReaderInstructions,
  type DragStartEvent, type DragMoveEvent, type DragOverEvent, type DragEndEvent,
} from '@dnd-kit/core';
import { depthStepOffset } from '@/lib/treeDepthStep';

// Pointer-precise collisions, but never empty: at the very bottom the pointer sits past the last row, so
// `pointerWithin` alone returns nothing → dnd-kit drops the sort gap → the list shrinks → the pointer is
// "inside" again next frame → gap re-added. That per-frame height flip jitters the ScrollArea. Falling back
// to `closestCenter` when the pointer is outside every row keeps `over` pinned to the nearest row, so the gap
// (and the scroll height) stays stable.
const collisionWithFallback: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  return within.length > 0 ? within : closestCenter(args);
};

// Clamp ONLY the dragged row's vertical position to the scroll viewport — never its x. Without this, dragging
// to the bottom pulls the in-flow row below the last one, which grows the ScrollArea's scrollHeight, so
// auto-scroll chases it downward forever (runaway scroll into empty space). Bounding y keeps the row at the
// edge while the list scrolls under it, so scrollHeight stays fixed and auto-scroll stops at the real end.
// x is left untouched, so horizontal-drag depth nesting still works (the forbidden thing is clamping x).
const restrictYToScrollAncestor: Modifier = ({ transform, draggingNodeRect, scrollableAncestorRects }) => {
  const rect = scrollableAncestorRects[0];
  if (!draggingNodeRect || !rect) return transform;
  let y = transform.y;
  if (draggingNodeRect.top + y < rect.top) y = rect.top - draggingNodeRect.top;
  else if (draggingNodeRect.bottom + y > rect.bottom) y = rect.bottom - draggingNodeRect.bottom;
  return { ...transform, y };
};
import {
  SortableContext, useSortable, sortableKeyboardCoordinates, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// dnd-kit's stock wording only knows about the vertical axis, and a tree where half the gesture is sideways
// has to say so — this is the only place the left/right keys are ever announced, since a grip's tooltip
// never reaches someone who arrived by keyboard. Hung off the drag handle as `aria-describedby`.
const SCREEN_READER_INSTRUCTIONS: ScreenReaderInstructions = {
  draggable: `
    To pick up an item, press space or enter. While holding it, use the up and down arrow keys to move it
    through the list, and the left and right arrow keys to move it out of or into the item above it. Press
    space or enter again to drop it where it stands, or press escape to leave it where it began.
  `,
};

/** Presentation + actions for one row, produced by the tree's adapter. */
export interface TreeRowSpec {
  /** 'chevron' = collapsible; 'spacer' = reserve the chevron slot for alignment; 'none' = no slot. */
  lead: 'chevron' | 'spacer' | 'none';
  /** aria-labels for the chevron button as [expand, collapse]. */
  collapseLabels?: [string, string];
  /** Optional icon between the grip and the label (e.g. a folder for groups). */
  icon?: ReactNode;
  label: ReactNode;
  /** Extra classes on the label span (e.g. 'font-medium' for group headers). */
  labelClass?: string;
  remove: () => void;
  duplicate: () => void;
}

/** What a specific tree plugs into the shared scaffold. */
export interface SortableTreeAdapter<N extends { id: string; depth: number }> {
  /** Visible rows given the effective collapsed set (the dragged subtree's root is added while dragging). */
  getVisible: (collapsed: Set<string>) => N[];
  /** The dragged row's projected depth for the current pointer position, or null for no projection. */
  projectDepth: (visible: N[], activeId: string, overId: string, offsetLeft: number) => number | null;
  /** Commit a drop. */
  onDrop: (activeId: string, overId: string, offsetLeft: number, collapsed: Set<string>) => void;
  rowSpec: (node: N) => TreeRowSpec;
}

interface RowProps {
  id: string;
  depth: number;
  spec: TreeRowSpec;
  selected: boolean;
  onSelect: (id: string) => void;
  isCollapsed: boolean;
  toggleCollapse: (id: string) => void;
}

/** One flat row with a depth-based left indent. */
function TreeRow({ id, depth, spec, selected, onSelect, isCollapsed, toggleCollapse }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  // The dragged row's indent is shown via paddingLeft (projected depth), so pin its x-translate to 0 — it
  // slides vertically only while the pointer's horizontal delta drives depth. Sibling rows keep their full
  // transform (the reorder shift animation).
  const rowTransform = isDragging && transform ? { ...transform, x: 0 } : transform;
  const style = {
    // Translate (not Transform): Transform bakes in a scale that resizes the dragged row to the target slot.
    transform: CSS.Translate.toString(rowTransform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <EditorRow
      setNodeRef={setNodeRef}
      style={style}
      depth={depth}
      gripProps={{ ...attributes, ...listeners }}
      gripTitle="Drag to reorder or nest — or press space, then the arrow keys"
      selected={selected}
      onSelect={() => onSelect(id)}
      lead={spec.lead === 'none' ? undefined : spec.lead}
      collapsed={isCollapsed}
      onToggleCollapse={() => toggleCollapse(id)}
      collapseLabels={spec.collapseLabels}
      icon={spec.icon}
      label={spec.label}
      labelClass={spec.labelClass}
      actions={[
        { icon: <Copy className="h-4 w-4" />, title: 'Duplicate', onClick: spec.duplicate },
        { icon: <X className="h-4 w-4" />, title: 'Delete', onClick: spec.remove },
      ]}
    />
  );
}

export function SortableTree<N extends { id: string; depth: number }>({ adapter, selectedId, onSelect }: {
  adapter: SortableTreeAdapter<N>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const [offsetLeft, setOffsetLeft] = useState(0);

  // Visible rows: the tree minus collapsed nodes' children and (while dragging) the dragged subtree.
  const visible = adapter.getVisible(activeId ? new Set([...collapsed, activeId]) : collapsed);

  // A keyboard drag's sensor is built once, at lift, and keeps the props it was handed — so the key handler
  // below has to read the drag through refs rather than through the render that created it.
  const live = useRef({ visible, overId, offsetLeft, adapter });
  live.current = { visible, overId, offsetLeft, adapter };

  /**
   * Up and down are dnd-kit's; left and right are the tree's.
   *
   * The stock `sortableKeyboardCoordinates` resolves an arrow by hunting for a droppable lying that way, and
   * in a full-width list nothing ever lies left or right — every row shares one left edge, since depth is
   * drawn as padding *inside* the box. So the sideways half of the gesture had no keyboard at all: a row
   * could be reordered without a mouse but never nested. Here each press moves the drag's x by one indent,
   * which is the same signal a pointer sends, and the projection reads it the same way.
   *
   * Vertical moves keep whatever depth the author has already dialled in: dnd-kit answers with the target
   * row's own left edge, so the current offset is added back on to leave `delta.x` — the thing depth is read
   * from — untouched. Without that, walking down a row would silently undo the nesting.
   */
  const coordinateGetter: KeyboardCoordinateGetter = useCallback((event, args) => {
    const step = event.code === 'ArrowLeft' ? -1 : event.code === 'ArrowRight' ? 1 : 0;
    const { visible: rows, overId: over, offsetLeft: offset, adapter: current } = live.current;

    if (!step) {
      const moved = sortableKeyboardCoordinates(event, args);
      return moved && { ...moved, x: moved.x + offset };
    }

    const activeId = String(args.active);
    const activeDepth = rows.find((n) => n.id === activeId)?.depth;
    if (activeDepth === undefined) return undefined;

    const next = depthStepOffset(
      (at) => current.projectDepth(rows, activeId, over ?? activeId, at),
      activeDepth, offset, step, TREE_INDENT,
    );
    // Returned even when the step was refused, so the arrow is swallowed rather than scrolling the list out
    // from under a drag the author is still holding.
    return { ...args.currentCoordinates, x: args.currentCoordinates.x + (next - offset) };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter }),
  );

  const projectedDepth = activeId && overId
    ? adapter.projectDepth(visible, activeId, overId, offsetLeft)
    : null;

  const reset = () => { setActiveId(null); setOverId(null); setOffsetLeft(0); };

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
    setOverId(String(active.id));
    // A lift always starts square: the keyboard reads depth off `delta.x`, which dnd-kit measures from where
    // the row sat on the first keypress, so a stale offset here would show up as a phantom indent.
    setOffsetLeft(0);
  };
  const handleDragMove = ({ delta }: DragMoveEvent) => setOffsetLeft(delta.x);
  const handleDragOver = ({ over }: DragOverEvent) => setOverId(over ? String(over.id) : null);
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (over) adapter.onDrop(String(active.id), String(over.id), offsetLeft, collapsed);
    reset();
  };

  const toggleCollapse = (id: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  return (
    <DndContext
      sensors={sensors}
      accessibility={{ screenReaderInstructions: SCREEN_READER_INSTRUCTIONS }}
      collisionDetection={collisionWithFallback}
      modifiers={[restrictYToScrollAncestor]}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={reset}
    >
      <SortableContext items={visible.map((n) => n.id)} strategy={verticalListSortingStrategy}>
        <EditorRowList>
        {visible.map((node) => (
          <TreeRow
            key={node.id}
            id={node.id}
            depth={node.id === activeId && projectedDepth !== null ? projectedDepth : node.depth}
            spec={adapter.rowSpec(node)}
            selected={selectedId === node.id}
            onSelect={onSelect}
            isCollapsed={collapsed.has(node.id)}
            toggleCollapse={toggleCollapse}
          />
        ))}
        </EditorRowList>
      </SortableContext>
    </DndContext>
  );
}
