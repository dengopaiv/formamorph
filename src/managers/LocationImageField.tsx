import { LOCATION_RULE_HOST } from '@/components/editor/ImageRuleCog';
import { IMAGE_CAPS } from '@/lib/imageOptim';
import { locationImages } from '@/lib/locationImages';
import type { GameLocation } from '@/types';
import ImageTagsField, { type GalleryFrameProps } from './ImageTagsField';

/** A location's gallery, as the location panel and the Media tab show it. */
export function LocationImageField({ location, onChange, imageId = `location-image-${location.id}`, tourAnchor, frame }: {
  location: GameLocation;
  onChange: <K extends 'images'>(field: K, value: NonNullable<GameLocation[K]>) => void;
  /** The file inputs' id, unique per rendered widget. */
  imageId?: string;
  tourAnchor?: string;
  /** A host that shows the framed image's details controls the frame. */
  frame?: GalleryFrameProps;
}) {
  return (
    <ImageTagsField
      label="Background Image"
      tourAnchor={tourAnchor}
      images={locationImages(location)}
      onImagesChange={(list) => onChange('images', list)}
      slots={Infinity}
      imageId={imageId}
      cap={IMAGE_CAPS.background}
      kind="location"
      ruleHost={LOCATION_RULE_HOST}
      {...frame}
    />
  );
}
