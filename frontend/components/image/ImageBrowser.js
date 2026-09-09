import { memo, useState } from "react";
import useImageWorkspace from "@/hooks/useImageWorkspace";
import { IMAGE_CATEGORY_LABELS } from "@/constants/imageWorkspace";

/**
 * Category-tabbed thumbnail browser (TEM / Diffraction / Output). Selecting
 * an image just changes `activeImageId` in the Project Store -- every
 * image keeps its own viewport (see models/image.js), so switching back
 * and forth never loses zoom/pan/rotation/adjustments.
 */
export default function ImageBrowser() {
  const { categories, imagesByCategory, activeImageId, setActiveImage } = useImageWorkspace();
  const [activeCategory, setActiveCategory] = useState(categories[0]);

  const images = imagesByCategory[activeCategory] ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex border-b border-line">
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => setActiveCategory(category)}
            className={`flex-1 px-3 py-2.5 text-xs font-medium ${
              activeCategory === category
                ? "border-b-2 border-beam-500 text-beam-700"
                : "text-subtle hover:text-muted"
            }`}
          >
            {IMAGE_CATEGORY_LABELS[category]}
            <span className="ml-1 text-subtle">({imagesByCategory[category]?.length ?? 0})</span>
          </button>
        ))}
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto p-2">
        {images.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-subtle">
            No {IMAGE_CATEGORY_LABELS[activeCategory].toLowerCase()} yet.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-2">
            {images.map((image) => (
              <li key={image.id}>
                <ImageThumbnail
                  image={image}
                  isActive={activeImageId === image.id}
                  onSelect={setActiveImage}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * One thumbnail button. Memoized with a custom comparator that only looks
 * at the handful of fields actually rendered (id/filename/thumbnail) plus
 * `isActive` -- not the whole `image` entity, whose reference changes
 * every viewport tick for the active image (see useImageWorkspace's perf
 * note). Without this, every thumbnail in the grid would re-render on
 * every pan/zoom/brightness tick of whichever image is currently active,
 * even though nothing about how a thumbnail looks depends on viewport.
 */
const ImageThumbnail = memo(
  function ImageThumbnail({ image, isActive, onSelect }) {
    return (
      <button
        type="button"
        onClick={() => onSelect(image.id)}
        className={`w-full overflow-hidden rounded-md border text-left transition-colors ${
          isActive ? "border-beam-500 ring-1 ring-beam-500" : "border-line hover:border-lineStrong"
        }`}
      >
        <div className="flex h-16 items-center justify-center bg-gradient-to-br from-zone-600/30 via-ink to-beam-600/20">
          {image.thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image.thumbnail} alt={image.filename} className="h-full w-full object-cover" />
          ) : (
            <span className="text-[10px] uppercase tracking-wide text-white/40">no preview</span>
          )}
        </div>
        <p className="truncate px-2 py-1 text-[11px] text-ink">{image.filename}</p>
      </button>
    );
  },
  (prev, next) =>
    prev.isActive === next.isActive &&
    prev.image.id === next.image.id &&
    prev.image.filename === next.image.filename &&
    prev.image.thumbnail === next.image.thumbnail
);
