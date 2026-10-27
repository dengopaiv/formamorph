import { LOCATION_RULE_HOST } from '@/components/editor/ImageRuleCog';
import { IMAGE_CAPS } from '@/lib/imageSlots';
import { mapImages } from '@/lib/mapBackground';
import type { GalleryImage, WorldOverview } from '@/types';
import { ImageGallery, ImageWidget, type GalleryFrameProps } from './ImageTagsField';

/** The Map Background's gallery as the Media tab and the canvas card show it. Its rules read as a location's do (Q74). */
export function MapBackgroundField({ overview, onImagesChange, frame, imageId = 'media-map-background' }: {
  overview: Pick<WorldOverview, 'mapBackground'>;
  onImagesChange: (images: GalleryImage[]) => void;
  frame?: GalleryFrameProps;
  imageId?: string;
}) {
  return (
    <ImageWidget
      label="Map Background"
      images={mapImages(overview)}
      onImagesChange={onImagesChange}
      slots={Infinity}
      imageId={imageId}
      cap={IMAGE_CAPS.map}
      kind="world"
      ruleHost={LOCATION_RULE_HOST}
      {...frame}
    >
      <ImageGallery />
    </ImageWidget>
  );
}
