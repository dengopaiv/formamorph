import { entityImages } from '@/lib/entityImages';
import type { Entity } from '@/types';

/** The visual an entity can be shown by, if it has one at all. */
export type EntityVisualSource = Pick<Entity, 'id' | 'name' | 'images'>;

/** Whether this entity has an image to show. */
export const hasEntityVisual = (entity?: EntityVisualSource | null): boolean => entityImages(entity).length > 0;
