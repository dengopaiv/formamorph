import SortableWorldCard from '@/components/SortableWorldCard';
import { useWorldOptimizeProgress } from '@/lib/worldOptimizeProgress';
import type { WorldRecord } from '@/components/WorldDetails';

/** A world's tile in the local library: the shared card, with the progress of an image run on it. */
export function LibraryWorldCard({ world, layout, onSelect, fill, compact }: {
  world: WorldRecord;
  layout: 'grid' | 'detailed';
  onSelect: (id: string) => void;
  /** Fill the tile the grid hands it, instead of taking its height from the layout. */
  fill?: boolean;
  /** Trade the name strip for a tooltip, on the smallest tile size. */
  compact?: boolean;
}) {
  const loading = !!world.isLoading;
  const progress = useWorldOptimizeProgress(world.id);

  return (
    <SortableWorldCard
      world={world}
      layout={layout}
      fill={fill}
      compact={compact}
      loading={loading}
      progress={progress}
      onSelect={onSelect}
    />
  );
}
