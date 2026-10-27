import { useState } from 'react';
import { RemoteImg } from '@/lib/useRemoteImage';
import { ImageZoomViewer } from '@/components/ImageZoomViewer';
import { GalleryControls, type GalleryControlsProps } from '@/components/GalleryControls';
import { entityImageData } from '@/lib/entityImages';
import type { EntityVisualSource } from '@/lib/entityVisual';
import { SwipeImage } from './SwipeImage';
import type { Base64Data } from '@/types';
import { Tip } from '@/components/ui/tooltip';

/**
 * An entity's picture wherever one is shown in game. An entity carrying more than one image pages between
 * them, chevrons on a pointer device and a swipe on touch, and the zoom viewer stays on whichever is showing.
 *
 * `onImageStep` is what makes the gallery pageable: without it (the World Editor's preview, which has no
 * playthrough to hold it in) this shows the primary image plainly. It lives in gameplay state, so the host
 * supplies it: see `useEntityGallery`, which also supplies the visible `images` in play.
 *
 * Fills its container, so the caller owns the sizing.
 */
export const EntityVisual = ({ entity, className, images: inPlay, imageIndex = 0, onImageStep }: {
  entity: EntityVisualSource;
  /** The images visible in play, in author order. Absent, the authored gallery, rules ignored. */
  images?: readonly Base64Data[];
  className?: string;
  imageIndex?: number;
  onImageStep?: (by: number) => void;
}) => {
  const [zoomed, setZoomed] = useState(false);

  const images = inPlay ?? entityImageData(entity);
  // A held index outlives the gallery it was taken from (an edited world, a reused panel), so clamp it here
  // rather than trusting it to still point at a picture.
  const index = images.length ? Math.min(imageIndex, images.length - 1) : 0;
  const current = images[index];
  if (!current) return null;
  const gallery = onImageStep && images.length > 1 ? { count: images.length, index, onStep: onImageStep } : undefined;

  return (
    // An image shrink-wraps inside the slot, so the box sizes to the picture rather than to the slot.
    <div className={`w-full h-full flex items-center justify-center ${className ?? ''}`}>
      <div className="relative inline-flex max-w-full max-h-full">
        <Picture images={images} index={index} gallery={gallery} name={entity.name} onZoom={() => setZoomed(true)} />
        <ImageZoomViewer src={current} alt={entity.name} open={zoomed} onOpenChange={setZoomed} gallery={gallery} />
      </div>
    </div>
  );
};

/** The showing picture plus, when there is a pageable gallery behind it, the controls to move through it. */
const Picture = ({ images, index, gallery, name, onZoom }: {
  images: readonly string[];
  index: number;
  gallery?: GalleryControlsProps;
  name: string;
  onZoom: () => void;
}) => {
  if (!gallery) {
    return (
      // The alt already names the picture; the tip only says it opens.
      <Tip tip="Click to enlarge" labelsChild={false}>
        <RemoteImg
          src={images[index]}
          alt={name}
          className="max-w-full max-h-full object-contain cursor-zoom-in"
          onClick={onZoom}
        />
      </Tip>
    );
  }
  return (
    // `group` so the controls fade in from a hover over the picture rather than the whole slot.
    // justify-center: this box's width comes from the picture's intrinsic width (clamped to the slot), but a
    // height-constrained picture shrink-wraps narrower inside it and would otherwise sit flush left.
    <div className="group relative inline-flex max-w-full max-h-full justify-center">
      <SwipeImage images={images} index={index} onStep={gallery.onStep} alt={name} onZoom={onZoom} />
      <GalleryControls {...gallery} />
    </div>
  );
};

export default EntityVisual;
