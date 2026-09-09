import { useCallback } from "react";
import useStage from "@/hooks/useStage";
import { createManualGVector, isActiveGVector } from "@/lib/annotations";

/**
 * Add/delete/restore g-vector annotations for one diffraction image --
 * the g-vector counterpart to hooks/useLineAnnotations.js. Both manually-
 * marked and backend-detected g-vectors live in
 * `project.stages[1].diffImages[i].gvecs`, written only through
 * `useStage(1)`'s `update()` -- the same single-source-of-truth pattern as
 * lines.
 *
 * Deletion is soft (`deleted: true`, never spliced out), so `restoreGVector`
 * is a simple, reliable "undo": the g-vector's full data was never
 * discarded.
 *
 * Deleting a g-vector is a scientific correction, so it also prunes:
 *   - its Stage 2 Miller-index assignment, if one was entered, and
 *   - its g_id out of any Stage 4 selection that included it (a selection
 *     left with fewer than 3 g-vectors is exactly what Stage 4 already
 *     treats as "incomplete, needs re-selecting" -- no separate signal
 *     needed for that).
 * Both go through Stage 2's/Stage 4's own `update()`, so if either stage
 * was already complete, the existing stale-cascade system flags whatever
 * depends on it automatically.
 *
 * @param {string|null} imageBasename The diffraction image's filename/id.
 */
export function useGVectorAnnotations(imageBasename) {
  const stage1 = useStage(1);
  const stage2 = useStage(2);
  const stage4 = useStage(4);

  const diffImages = stage1.data.diffImages ?? [];
  const entry = diffImages.find((d) => d.image === imageBasename) ?? null;
  const gvecs = entry?.gvecs ?? [];

  const activeGVectors = gvecs.filter(isActiveGVector);
  const deletedGVectors = gvecs.filter((g) => g.deleted);
  const manualGVectors = activeGVectors.filter((g) => g.source === "manual");

  const addGVector = useCallback(
    (ox, oy, tx, ty) => {
      if (!imageBasename) return;

      // If Stage 1 detection hasn't run yet (or this image wasn't part of it),
      // the diffImages array won't have an entry for this image. Auto-create one
      // so manually-marked g-vectors always have somewhere to live -- the same
      // array detection results populate later, so detected + manual coexist.
      const currentEntry = entry;
      const currentGVecs = currentEntry?.gvecs ?? [];
      const newGVector = createManualGVector(imageBasename, currentGVecs, ox, oy, tx, ty);

      if (currentEntry) {
        // Entry exists — append to its gvecs array.
        const nextDiffImages = diffImages.map((d) =>
          d.image === imageBasename ? { ...d, gvecs: [...d.gvecs, newGVector] } : d
        );
        stage1.update({ diffImages: nextDiffImages });
      } else {
        // No entry yet — create one with just this manual g-vector.
        stage1.update({
          diffImages: [...diffImages, { image: imageBasename, gvecs: [newGVector] }],
        });
      }
    },
    [imageBasename, entry, gvecs, diffImages, stage1]
  );

  const setDeleted = useCallback(
    (id, deleted) => {
      if (!imageBasename || !entry) return;
      const target = gvecs.find((g) => g.id === id);

      const nextDiffImages = diffImages.map((d) =>
        d.image === imageBasename
          ? { ...d, gvecs: d.gvecs.map((g) => (g.id === id ? { ...g, deleted } : g)) }
          : d
      );
      stage1.update({ diffImages: nextDiffImages });

      if (!deleted || !target) return; // only deletion prunes dependents, restore does not

      // Prune this g-vector's Miller-index assignment, if any (Stage 2).
      const forImage = stage2.data.millerIndexByGvector[imageBasename];
      if (forImage && forImage[target.g_id]) {
        const { [target.g_id]: _removed, ...rest } = forImage;
        stage2.update({
          millerIndexByGvector: { ...stage2.data.millerIndexByGvector, [imageBasename]: rest },
        });
      }

      // Remove this g_id from any Stage 4 selection that included it.
      const nextSelections = stage4.data.selections.map((s) =>
        s.diffImage === imageBasename && s.gIds.includes(target.g_id)
          ? { ...s, gIds: s.gIds.filter((gid) => gid !== target.g_id) }
          : s
      );
      const selectionsChanged = nextSelections.some(
        (s, i) => s.gIds.length !== stage4.data.selections[i].gIds.length
      );
      if (selectionsChanged) {
        stage4.update({ selections: nextSelections });
      }
    },
    [imageBasename, entry, gvecs, diffImages, stage1, stage2, stage4]
  );

  const updateGVectorEndpoint = useCallback(
    (id, pointIndex, x, y) => {
      if (!imageBasename || !entry) return;
      const roundX = Math.round(x);
      const roundY = Math.round(y);
      const nextDiffImages = diffImages.map((d) => {
        if (d.image !== imageBasename) return d;
        return {
          ...d,
          gvecs: d.gvecs.map((g) => {
            if (g.id !== id) return g;
            const ox = pointIndex === 1 ? roundX : g.ox;
            const oy = pointIndex === 1 ? roundY : g.oy;
            const tx = pointIndex === 2 ? roundX : g.tx;
            const ty = pointIndex === 2 ? roundY : g.ty;
            const vx = tx - ox;
            const vy = ty - oy;
            const length_px = Math.round(Math.hypot(vx, vy) * 100) / 100;
            return { ...g, ox, oy, tx, ty, vx, vy, length_px };
          }),
        };
      });
      stage1.update({ diffImages: nextDiffImages });
    },
    [imageBasename, entry, diffImages, stage1]
  );

  const moveGVector = useCallback(
    (id, dx, dy, initialGVector) => {
      if (!imageBasename || !entry || !initialGVector) return;
      const rDx = Math.round(dx);
      const rDy = Math.round(dy);
      const nextDiffImages = diffImages.map((d) => {
        if (d.image !== imageBasename) return d;
        return {
          ...d,
          gvecs: d.gvecs.map((g) => {
            if (g.id !== id) return g;
            const ox = initialGVector.ox + rDx;
            const oy = initialGVector.oy + rDy;
            const tx = initialGVector.tx + rDx;
            const ty = initialGVector.ty + rDy;
            const vx = tx - ox;
            const vy = ty - oy;
            const length_px = Math.round(Math.hypot(vx, vy) * 100) / 100;
            return { ...g, ox, oy, tx, ty, vx, vy, length_px };
          }),
        };
      });
      stage1.update({ diffImages: nextDiffImages });
    },
    [imageBasename, entry, diffImages, stage1]
  );

  const deleteGVector = useCallback((id) => setDeleted(id, true), [setDeleted]);
  const restoreGVector = useCallback((id) => setDeleted(id, false), [setDeleted]);

  return { gvecs, activeGVectors, manualGVectors, deletedGVectors, addGVector, updateGVectorEndpoint, moveGVector, deleteGVector, restoreGVector };
}

export default useGVectorAnnotations;
