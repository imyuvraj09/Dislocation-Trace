import { useMemo } from "react";
import useProjectStore from "@/store/projectStore";
import { IMAGE_CATEGORY_ORDER } from "@/constants/imageWorkspace";

/**
 * Everything the Image Browser (and anything else needing "what images
 * exist / which one is active") needs, read from the global Project
 * Store's `images` registry.
 *
 * Performance note: this selects `categories`, `activeImageId`, and
 * `byId` as three separate store selectors rather than one selector
 * returning the whole `images` object. That matters because
 * `images.categories`/`images.activeImageId` keep the same object/value
 * across a pan/zoom/brightness/contrast update (the store only replaces
 * the active image's entry inside `byId` for those -- see
 * store/projectStore.js's `updateImageViewport`), while `state.project.images`
 * as a whole is a new object on every such update. Selecting the whole
 * bucket would re-render every component that calls this hook (including
 * the full thumbnail grid) on every mouse-move during a drag; selecting
 * the parts individually means only `byId`-dependent work re-runs.
 */
export function useImageWorkspace() {
  const categories = useProjectStore((state) => state.project.images.categories);
  const activeImageId = useProjectStore((state) => state.project.images.activeImageId);
  const byId = useProjectStore((state) => state.project.images.byId);
  const setActiveImage = useProjectStore((state) => state.setActiveImage);
  const registerImages = useProjectStore((state) => state.registerImages);

  const imagesByCategory = useMemo(
    () =>
      Object.fromEntries(
        IMAGE_CATEGORY_ORDER.map((category) => [
          category,
          categories[category].map((id) => byId[id]).filter(Boolean),
        ])
      ),
    [categories, byId]
  );

  const activeImage = activeImageId ? byId[activeImageId] ?? null : null;

  const totalImages = useMemo(
    () => Object.values(categories).reduce((sum, ids) => sum + ids.length, 0),
    [categories]
  );

  return {
    categories: IMAGE_CATEGORY_ORDER,
    imagesByCategory,
    totalImages,
    activeImage,
    activeImageId,
    setActiveImage,
    registerImages,
  };
}

export default useImageWorkspace;
