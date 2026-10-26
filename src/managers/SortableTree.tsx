// The shared drag-tree scaffold behind LocationTree, EntityTree and TraitTree: a flat sortable list where
// vertical drag reorders and horizontal drag changes nesting depth. Each tree supplies an adapter (visible
// rows, depth projection, drop commit, per-row presentation); everything else — drag state and the row
// chrome (grip / chevron / duplicate / delete) — lives here once, over the shared `EditorDndContext`.
//
// Both axes answer to the keyboard too: space lifts the row under the focused grip, up/down walk it through
// the list, left/right take it out of or into the row above, space drops it. See `coordinateGetter` below —
// the sideways half is ours, because dnd-kit's own only knows how to find a droppable it can see.
//
// IMPORTANT: never clamp the drag's X. A full-axis bounding modifier (restrictToParentElement /
// restrictToFirstScrollableAncestor / restrictToVerticalAxis) clamps the horizontal delta and breaks
// depth-based nesting (see TraitTree history), which is why this passes `restrictYToScrollAncestor` rather
// than taking the shared layer's vertical-list default.
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { EditorRow, TREE_INDENT, type EditorRowAction } from '@/components/EditorRow';
import { X, Copy } from 'lucide-react';
import {
  pointerWithin, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
  type CollisionDetection, type KeyboardCoordinateGetter, type ScreenReaderInstructions,
  type Announcements, type DragStartEvent, type DragMoveEvent, type DragOverEvent, type DragEndEvent,
} from '@dnd-kit/core';
import { EditorDndContext, StableSortableContext } from '@/components/dnd/EditorDndContext';
import { restrictYToScrollAncestor } from '@/components/dnd/dragInvariants';
import { depthStepOffset } from '@/lib/treeDepthStep';
import {
  announceLift, announceMove, announceDrop, announceCancel, announceRefusedDrop, describeDrop,
  type TreeDropDescription,
} from '@/lib/treeAnnouncements';
import { PlaceholderVocabularyProvider } from '@/components/prompt/PlaceholderText';
import { VirtualRowList, VIRTUALIZE_AT } from '@/components/VirtualRowList';
import type { Placeholder } from '@/types';

// Pointer-precise collisions, but never empty: at the very bottom the pointer sits past the last row, so
// `pointerWithin` alone returns nothing → dnd-kit drops the sort gap → the list shrinks → the pointer is
// "inside" again next frame → gap re-added. That per-frame height flip jitters the ScrollArea. Falling back
// to `closestCenter` when the pointer is outside every row keeps `over` pinned to the nearest row, so the gap
// (and the scroll height) stays stable.
const collisionWithFallback: CollisionDetection = (args) => {
  const within = pointerWithin(args);
  return within.length > 0 ? within : closestCenter(args);
};

import { useSortable, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
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

const TREE_MODIFIERS = [restrictYToScrollAncestor];

/** One value per spoken place, so two descriptions of the same landing compare equal. */
const placeKey = ({ depth, parentName, afterName }: TreeDropDescription) => JSON.stringify([depth, parentName, afterName]);
const NO_INPUTS: readonly unknown[] = [];

/** Presentation + actions for one row, produced by the tree's adapter. */
export interface TreeRowSpec {
  /** 'chevron' = collapsible; 'spacer' = reserve the chevron slot for alignment; 'none' = no slot. */
  lead: 'chevron' | 'spacer' | 'none';
  /** aria-labels for the chevron button as [expand, collapse]. */
  collapseLabels?: [string, string];
  /** Optional icon between the grip and the label (e.g. a folder for groups). */
  icon?: ReactNode;
  label: ReactNode;
  /** The row's name as plain text. `label` may be markup, and a screen reader needs words. */
  name: string;
  /** Extra classes on the label span (e.g. 'font-medium' for group headers). */
  labelClass?: string;
  /** Secondary text before the actions, such as a used-by count. */
  meta?: ReactNode;
  /** Tooltip for {@link TreeRowSpec.meta}, which is usually too terse to read on its row. */
  metaTitle?: string;
  /** Actions ahead of duplicate and delete, for anything only this tree offers. */
  actions?: EditorRowAction[];
  /** What the delete action is called, where "Delete" is not what the row's own X does. */
  removeTitle?: string;
  /** Absent on a fixed row, which offers no delete. */
  remove?: () => void;
  /** Why the row can't be removed; shows the delete action unavailable with this tip. Read only without `remove`. */
  removeBlocked?: string;
  /** Tip of the dot that marks a row overriding its blueprint. */
  overridden?: string;
  /** Absent on a fixed row, which offers no duplicate. */
  duplicate?: () => void;
  /** The row is derived from something else (an owner node read off an entity): it cannot be dragged, and
   *  rows may still be dropped beside or under it. */
  fixed?: boolean;
  /** Dims the row at rest, as an off entry is dimmed. */
  faded?: boolean;
}

/** What a specific tree plugs into the shared scaffold. */
export interface SortableTreeAdapter<N extends { id: string; depth: number }> {
  /** Everything `getVisible` reads. The tree reuses its visible rows until one of these changes. */
  visibleDeps: readonly unknown[];
  /** Everything `rowSpec` reads besides its node that every row shares, such as the placeholders its labels
   *  draw. All rows redraw when one of these changes. Callbacks in the spec read current state when they
   *  run, so what only they read stays out. */
  rowDeps: readonly unknown[];
  /** What `rowSpec` reads for this one row besides its node, as values that compare equal while the row
   *  looks the same. A row redraws when its node or one of these changes. */
  rowInputs?: (node: N) => readonly unknown[];
  /** The placeholders the row labels draw chips from. The rows share one chip vocabulary built from them. */
  placeholders: readonly Placeholder[];
  /** Visible rows given the effective collapsed set (the dragged subtree's root is added while dragging). */
  getVisible: (collapsed: Set<string>) => N[];
  /** Where the dragged row would land for the current pointer position, or null for no projection. The
   *  depth drives the row's indent and the keyboard's sideways step; the parent is what a screen reader is
   *  told it would nest into. */
  project: (visible: N[], activeId: string, overId: string, offsetLeft: number)
    => { depth: number; parentId: string | null } | null;
  /** Commit a drop. */
  /** Commit a drop. Returns false when the tree turns the drop down, so it is not announced as made. */
  onDrop: (activeId: string, overId: string, offsetLeft: number, collapsed: Set<string>) => boolean | void;
  /** What `selectedId` and `onSelect` speak in, where a row is not itself the thing being selected — a
   *  placeholder draws a row under every parent placeholder that shares it, and all of them are that one placeholder.
   *  Defaults to the row's own id. */
  selectionId?: (node: N) => string;
  /** `select` stays the same function across renders, so a button built into the spec never goes stale. */
  rowSpec: (node: N, select: (id: string) => void) => TreeRowSpec;
}

interface RowProps<N extends { id: string; depth: number }> {
  node: N;
  /** The depth to draw: the projected depth for the dragged row, else the node's row. */
  depth: number;
  /** What selecting this row reports — see `selectionId` on the adapter. */
  selectId: string;
  selected: boolean;
  onSelect: (id: string) => void;
  isCollapsed: boolean;
  toggleCollapse: (id: string) => void;
  /** What the adapter reads for this row, see `rowInputs` on the adapter. */
  inputs: readonly unknown[];
  /** Counts changes to the adapter's `rowDeps`. */
  epoch: number;
  adapterRef: { readonly current: SortableTreeAdapter<N> };
}

interface BuiltRow {
  node: object;
  epoch: number;
  inputs: readonly unknown[];
  spec: TreeRowSpec;
  actions: EditorRowAction[];
}

/** One flat row with a depth-based left indent. */
function TreeRowBase<N extends { id: string; depth: number }>({
  node, depth, selectId, selected, onSelect, isCollapsed, toggleCollapse, inputs, epoch, adapterRef,
}: RowProps<N>) {
  const id = node.id;
  // The spec holds new elements on every call, so it is built again only when the row's node, inputs or
  // epoch change. A redraw for a drag frame then hands EditorRow the same label element, and the label does
  // not render again.
  const built = useRef<BuiltRow | null>(null);
  if (!built.current || built.current.node !== node || built.current.epoch !== epoch || !sameDeps(built.current.inputs, inputs)) {
    const spec = adapterRef.current.rowSpec(node, onSelect);
    // A click asks the adapter again, so a row that has not redrawn still acts on current state.
    const latest = () => adapterRef.current.rowSpec(node, onSelect);
    built.current = {
      node, epoch, inputs, spec,
      actions: [
        ...(spec.actions ?? []).map((a, i) => ({ ...a, onClick: () => latest().actions?.[i]?.onClick() })),
        ...(spec.duplicate ? [{ icon: <Copy className="h-4 w-4" />, title: 'Duplicate', onClick: () => latest().duplicate?.() }] : []),
        ...(spec.remove ? [{ icon: <X className="h-4 w-4" />, destructive: true, title: spec.removeTitle ?? 'Delete', onClick: () => latest().remove?.() }]
          : spec.removeBlocked ? [{ icon: <X className="h-4 w-4" />, destructive: true, title: spec.removeTitle ?? 'Delete', onClick: () => {}, disabledReason: spec.removeBlocked }]
          : []),
      ],
    };
  }
  const { spec: row, actions } = built.current;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled: row.fixed });
  // The dragged row's indent is shown via paddingLeft (projected depth), so pin its x-translate to 0 — it
  // slides vertically only while the pointer's horizontal delta drives depth. Sibling rows keep their full
  // transform (the reorder shift animation).
  const rowTransform = isDragging && transform ? { ...transform, x: 0 } : transform;
  const style = {
    // Translate (not Transform): Transform bakes in a scale that resizes the dragged row to the target slot.
    transform: CSS.Translate.toString(rowTransform),
    transition,
    opacity: isDragging || row.faded ? 0.5 : 1,
  };
  return (
    <EditorRow
      setNodeRef={setNodeRef}
      style={style}
      depth={depth}
      gripProps={row.fixed ? undefined : { ...attributes, ...listeners }}
      grip={!row.fixed}
      gripTitle="Drag to reorder or nest"
      selected={selected}
      onSelect={() => onSelect(selectId)}
      lead={row.lead === 'none' ? undefined : row.lead}
      collapsed={isCollapsed}
      onToggleCollapse={() => toggleCollapse(id)}
      collapseLabels={row.collapseLabels}
      icon={row.icon}
      label={row.label}
      labelClass={row.labelClass}
      meta={row.meta}
      metaTitle={row.metaTitle}
      overridden={row.overridden}
      actions={actions}
    />
  );
}

function sameDeps(a: readonly unknown[], b: readonly unknown[]): boolean {
  return a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
}

// dnd-kit redraws every sortable on each drag frame through its own context. Memoized props keep every
// other redraw (edits, selection, a depth change) to the rows whose inputs changed. `inputs` is a fresh
// array each render, so it compares by content. The cast keeps the generic row type through `memo`.
const TreeRow = memo(TreeRowBase, (prev, next) => {
  const { inputs: a, ...restPrev } = prev;
  const { inputs: b, ...restNext } = next;
  return sameDeps(a, b) && sameNode(restPrev, restNext);
}) as typeof TreeRowBase;

const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && Object.getPrototypeOf(v) === Object.prototype;

/** The nodes hold the same fields. A field that is a plain object, such as a drop home rebuilt with each
 *  tree, matches when its own fields match, one level down. Edits replace records, so a changed record
 *  still differs at that level. */
function sameNode(a: object, b: object, depth = 1): boolean {
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  const keys = Object.keys(x);
  return keys.length === Object.keys(y).length && keys.every((k) => (
    Object.is(x[k], y[k]) || (depth > 0 && isPlain(x[k]) && isPlain(y[k]) && sameNode(x[k], y[k], depth - 1))
  ));
}

/** What selecting this row reports — see `selectionId` on the adapter. */
const selectionOf = <N extends { id: string; depth: number }>(adapter: SortableTreeAdapter<N>, node: N) => adapter.selectionId?.(node) ?? node.id;

export function SortableTree<N extends { id: string; depth: number }>({ adapter, selectedId, onSelect, revealSelected = false }: {
  adapter: SortableTreeAdapter<N>;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Expand the groups above a newly selected row, so a row selected from outside the tree shows. */
  revealSelected?: boolean;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // Handlers and rows read the latest adapter, collapsed set and callback through refs, so they stay stable.
  const adapterRef = useRef(adapter);
  adapterRef.current = adapter;
  const collapsedRef = useRef(collapsed);
  collapsedRef.current = collapsed;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const selectStable = useCallback((id: string) => onSelectRef.current(id), []);
  // The last selection revealed. A selection whose row isn't drawn yet waits for the render that draws it.
  const revealed = useRef<string | null>(null);
  useEffect(() => {
    if (!revealSelected || !selectedId || revealed.current === selectedId) return;
    const rows = adapter.getVisible(new Set());
    const at = rows.findIndex((n) => selectionOf(adapter, n) === selectedId);
    if (at < 0) return;
    revealed.current = selectedId;
    const above = new Set<string>();
    for (let i = at - 1, depth = rows[at].depth; i >= 0 && depth > 0; i--) {
      if (rows[i].depth < depth) { above.add(rows[i].id); depth = rows[i].depth; }
    }
    setCollapsed((prev) => ([...above].some((id) => prev.has(id)) ? new Set([...prev].filter((id) => !above.has(id))) : prev));
  }, [revealSelected, selectedId, adapter]);
  const [activeId, setActiveId] = useState<string | null>(null);
  // The pointer position lives in refs: a drag frame redraws the tree only when the projected depth changes.
  const activeRef = useRef<string | null>(null);
  const overRef = useRef<string | null>(null);
  const offsetRef = useRef(0);
  const [projectedDepth, setProjectedDepth] = useState<number | null>(null);
  // Fixed at drag start, so hiding the dragged subtree never switches the list's mode mid-drag.
  const [dragWindowed, setDragWindowed] = useState(false);
  const dragWindowedRef = useRef(false);
  // The drop target, so a windowed list keeps its neighborhood mounted.
  const [overId, setOverId] = useState<string | null>(null);

  // Visible rows: the tree minus collapsed nodes' children and (while dragging) the dragged subtree. One
  // result is kept, and a node that did not change keeps its object, so rows compare by identity.
  const rowsCache = useRef<{ deps: readonly unknown[]; collapsed: Set<string>; activeId: string | null; rows: N[] } | null>(null);
  const rowsFor = useCallback((active: string | null): N[] => {
    const current = adapterRef.current;
    const set = collapsedRef.current;
    const hit = rowsCache.current;
    if (hit && hit.activeId === active && hit.collapsed === set && sameDeps(hit.deps, current.visibleDeps)) return hit.rows;
    const before = new Map(hit?.rows.map((n) => [n.id, n]));
    const rows = current.getVisible(active ? new Set([...set, active]) : set)
      .map((n) => { const old = before.get(n.id); return old && sameNode(old, n) ? old : n; });
    rowsCache.current = { deps: current.visibleDeps, collapsed: set, activeId: active, rows };
    return rows;
  }, []);
  const visible = rowsFor(activeId);

  const shared = useRef({ deps: adapter.rowDeps, epoch: 0 });
  if (!sameDeps(shared.current.deps, adapter.rowDeps)) shared.current = { deps: adapter.rowDeps, epoch: shared.current.epoch + 1 };

  const project = useCallback((active: string | null, over: string | null, dx: number) => (
    active && over ? adapterRef.current.project(rowsFor(active), active, over, dx)?.depth ?? null : null
  ), [rowsFor]);

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
   *
   * A keyboard drag's sensor is built once, at lift, and keeps the props it was handed, so this reads the
   * drag through the refs rather than through the render that created it.
   */
  const coordinateGetter: KeyboardCoordinateGetter = useCallback((event, args) => {
    const step = event.code === 'ArrowLeft' ? -1 : event.code === 'ArrowRight' ? 1 : 0;
    const offset = offsetRef.current;

    if (!step) {
      const moved = sortableKeyboardCoordinates(event, args);
      return moved && { ...moved, x: moved.x + offset };
    }

    const activeId = String(args.active);
    const rows = rowsFor(activeId);
    const activeDepth = rows.find((n) => n.id === activeId)?.depth;
    if (activeDepth === undefined) return undefined;

    const next = depthStepOffset(
      (at) => adapterRef.current.project(rows, activeId, overRef.current ?? activeId, at)?.depth ?? null,
      activeDepth, offset, step, TREE_INDENT,
    );
    // Returned even when the step was refused, so the arrow is swallowed rather than scrolling the list out
    // from under a drag the author is still holding.
    return { ...args.currentCoordinates, x: args.currentCoordinates.x + (next - offset) };
  }, [rowsFor]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter }),
  );

  // A row's name is read once per drag: it cannot change mid-drag, and asking the adapter on every drag frame
  // would redo the work the row memoization above exists to save. Emptied at each lift.
  const names = useRef(new WeakMap<N, string>());
  const nameOf = useCallback((node: N) => {
    let name = names.current.get(node);
    if (name === undefined) {
      name = adapterRef.current.rowSpec(node, selectStable).name;
      names.current.set(node, name);
    }
    return name;
  }, [selectStable]);

  /**
   * The drag's current landing spot, in words. Read through the refs for the same reason `coordinateGetter`
   * is: dnd-kit builds its announcer once per drag, so a closure over this render would go stale after the
   * first keypress. dnd-kit speaks right after the matching handler below has run, so the refs already hold
   * the press being described.
   *
   * A lift describes the row where it already sits, which is `project` against its own slot at zero offset —
   * exactly what `handleDragStart` seeds the drag state with.
   */
  const describeAt = useCallback((
    activeId: string, overId: string | null, offset: number,
  ): TreeDropDescription | null => {
    const rows = rowsFor(activeId);
    return describeDrop(
      rows, activeId, overId,
      overId ? adapterRef.current.project(rows, activeId, overId, offset) : null,
      (id) => {
        const node = rows.find((n) => n.id === id);
        return node ? nameOf(node) : null;
      },
    );
  }, [rowsFor, nameOf]);

  const spokenPlace = useRef<string | null>(null);
  // Whether the adapter turned the last drop down. Set in `handleDragEnd`, which runs before dnd-kit speaks.
  const dropRefused = useRef(false);
  const announcements = useMemo<Announcements>(() => {
    const nameOfId = (id: string) => {
      const node = rowsFor(id).find((n) => n.id === id);
      return node ? nameOf(node) : id;
    };
    const here = (activeId: string, overId: string | null) => describeAt(activeId, overId, offsetRef.current);
    // A move speaks only when the place differs from the last one spoken. dnd-kit reports a drag-over for the
    // row's own slot right after every lift, and without this the lift's place would be read out twice.
    const moved = (activeId: string, overId: string | null) => {
      const at = here(activeId, overId);
      const key = at && placeKey(at);
      if (!key || key === spokenPlace.current) return undefined;
      spokenPlace.current = key;
      return announceMove(at);
    };
    return {
      onDragStart: ({ active }) => {
        const at = describeAt(String(active.id), String(active.id), 0);
        spokenPlace.current = at && placeKey(at);
        return announceLift(nameOfId(String(active.id)), at);
      },
      onDragMove: ({ active, over }) => moved(String(active.id), over && String(over.id)),
      onDragOver: ({ active, over }) => moved(String(active.id), over && String(over.id)),
      onDragEnd: ({ active, over }) => (dropRefused.current
        ? announceRefusedDrop(nameOfId(String(active.id)))
        : announceDrop(nameOfId(String(active.id)), here(String(active.id), over && String(over.id)))),
      onDragCancel: ({ active }) => announceCancel(nameOfId(String(active.id))),
    };
  }, [describeAt, rowsFor, nameOf]);

  // Leaves `offsetRef` alone: dnd-kit speaks the drop right after `handleDragEnd` runs, and that sentence
  // reads the offset the row was dropped at. A lift starts square again in `handleDragStart`.
  const reset = useCallback(() => {
    activeRef.current = null;
    overRef.current = null;
    setActiveId(null);
    setOverId(null);
    setProjectedDepth(null);
  }, []);

  const handleDragStart = useCallback(({ active }: DragStartEvent) => {
    dragWindowedRef.current = rowsFor(null).length > VIRTUALIZE_AT;
    setDragWindowed(dragWindowedRef.current);
    activeRef.current = String(active.id);
    overRef.current = String(active.id);
    // A lift always starts square: the keyboard reads depth off `delta.x`, which dnd-kit measures from where
    // the row sat on the first keypress, so a stale offset here would show up as a phantom indent.
    offsetRef.current = 0;
    names.current = new WeakMap();
    setActiveId(activeRef.current);
    setProjectedDepth(project(activeRef.current, overRef.current, 0));
  }, [project, rowsFor]);
  const handleDragMove = useCallback(({ delta }: DragMoveEvent) => {
    offsetRef.current = delta.x;
    setProjectedDepth(project(activeRef.current, overRef.current, delta.x));
  }, [project]);
  const handleDragOver = useCallback(({ over }: DragOverEvent) => {
    overRef.current = over ? String(over.id) : null;
    if (dragWindowedRef.current) setOverId(overRef.current);
    setProjectedDepth(project(activeRef.current, overRef.current, offsetRef.current));
  }, [project]);
  const handleDragEnd = useCallback(({ active, over }: DragEndEvent) => {
    dropRefused.current = !!over
      && adapterRef.current.onDrop(String(active.id), String(over.id), offsetRef.current, collapsedRef.current) === false;
    reset();
  }, [reset]);

  const toggleCollapse = useCallback((id: string) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);

  const rowKey = useCallback((i: number) => visible[i].id, [visible]);
  const renderRow = (node: N) => {
    const selectId = selectionOf(adapter, node);
    return (
      <TreeRow
        key={node.id}
        node={node}
        depth={node.id === activeId && projectedDepth !== null ? projectedDepth : node.depth}
        selectId={selectId}
        selected={selectedId === selectId}
        onSelect={selectStable}
        isCollapsed={collapsed.has(node.id)}
        toggleCollapse={toggleCollapse}
        inputs={adapter.rowInputs?.(node) ?? NO_INPUTS}
        epoch={shared.current.epoch}
        adapterRef={adapterRef}
      />
    );
  };

  const windowed = activeId ? dragWindowed : visible.length > VIRTUALIZE_AT;
  // Kept mounted: the selected row for scroll-to-selection, the dragged row, and its drop neighborhood.
  const pinned: number[] = [];
  if (windowed && selectedId) pinned.push(visible.findIndex((n) => selectionOf(adapter, n) === selectedId));
  if (windowed && activeId) {
    pinned.push(visible.findIndex((n) => n.id === activeId));
    const over = overId ? visible.findIndex((n) => n.id === overId) : -1;
    if (over >= 0) pinned.push(over - 1, over, over + 1);
  }

  return (
    <EditorDndContext
      sensors={sensors}
      accessibility={{ screenReaderInstructions: SCREEN_READER_INSTRUCTIONS, announcements }}
      collisionDetection={collisionWithFallback}
      modifiers={TREE_MODIFIERS}
      onDragStart={handleDragStart}
      onDragMove={handleDragMove}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={reset}
    >
      <StableSortableContext items={visible} strategy={verticalListSortingStrategy}>
        <PlaceholderVocabularyProvider placeholders={adapter.placeholders}>
          <VirtualRowList
            count={visible.length}
            rowKey={rowKey}
            renderRow={(i) => renderRow(visible[i])}
            pinned={pinned}
            windowed={windowed}
          />
        </PlaceholderVocabularyProvider>
      </StableSortableContext>
    </EditorDndContext>
  );
}
