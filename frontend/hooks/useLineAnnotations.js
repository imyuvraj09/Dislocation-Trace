import { useCallback } from "react";
import useStage from "@/hooks/useStage";
import { createManualLine, isActiveLine } from "@/lib/annotations";

/**
 * Add/delete/restore dislocation-line annotations for one TEM image --
 * both manually-drawn ones and (for delete/restore) the backend-detected
 * ones from Stage 1. All of it reads and writes
 * `project.stages[1].temImages[i].lines` -- the same array Stage 1 itself
 * populates -- via `useStage(1)`'s `update()`, so there is exactly one
 * place this data lives and exactly one path (the Project Store) it's
 * ever written through.
 *
 * Deletion is soft: a deleted line is flagged `deleted: true` and kept in
 * the array, never spliced out. `restoreLine` clears the flag. This is
 * what makes "undo" for a deletion trivial and reliable -- there's no
 * separate history stack to replay, the line's full data was never
 * discarded in the first place.
 *
 * Deleting a line is a scientific correction, so it also prunes any Stage
 * 3 line pair (draft or already-submitted) that referenced it -- a pair
 * built from a line that no longer exists can't remain valid. Pruning a
 * *submitted* pair goes through Stage 3's own `update()`, which is exactly
 * "editing an already-complete stage" -- the existing stale-cascade system
 * (store/projectStore.js's updateStageData) takes it from there and flags
 * Stage 4 onward automatically. If the deleted line wasn't used in any
 * pair, nothing downstream is touched at all.
 *
 * @param {string|null} imageBasename The TEM image's filename/id (Stage 1 keys temImages by this).
 */
export function useLineAnnotations(imageBasename) {
  const stage1 = useStage(1);
  const stage3 = useStage(3);
  const temImages = stage1.data.temImages ?? [];
  const entry = temImages.find((t) => t.image === imageBasename) ?? null;
  const lines = entry?.lines ?? [];

  const activeLines = lines.filter(isActiveLine);
  const deletedLines = lines.filter((l) => l.deleted);
  const manualLines = activeLines.filter((l) => l.source === "manual");

  const addLine = useCallback(
    (x1, y1, x2, y2) => {
      if (!imageBasename) return;

      // If Stage 1 detection hasn't run yet (or this image wasn't part of it),
      // the temImages array won't have an entry for this image. Auto-create one
      // so manually-drawn lines always have somewhere to live -- the same array
      // detection results populate later, so detected + manual lines coexist.
      const currentEntry = entry;
      const currentLines = currentEntry?.lines ?? [];
      const newLine = createManualLine(imageBasename, currentLines, x1, y1, x2, y2);

      if (currentEntry) {
        // Entry exists — append to its lines array.
        const nextTemImages = temImages.map((t) =>
          t.image === imageBasename ? { ...t, lines: [...t.lines, newLine] } : t
        );
        stage1.update({ temImages: nextTemImages });
      } else {
        // No entry yet — create one with just this manual line.
        stage1.update({
          temImages: [...temImages, { image: imageBasename, lines: [newLine] }],
        });
      }
    },
    [imageBasename, entry, lines, temImages, stage1]
  );

  const setDeleted = useCallback(
    (id, deleted) => {
      if (!imageBasename || !entry) return;

      const target = lines.find((l) => l.id === id);
      const nextTemImages = temImages.map((t) =>
        t.image === imageBasename
          ? { ...t, lines: t.lines.map((l) => (l.id === id ? { ...l, deleted } : l)) }
          : t
      );
      stage1.update({ temImages: nextTemImages });

      // Deleting (not restoring) also prunes any pair that referenced this
      // line -- a pair can't stay valid once one of its two lines is gone.
      if (deleted && target) {
        const referencesTarget = (p) =>
          (p.image1 === imageBasename && p.lineId1 === target.label) ||
          (p.image2 === imageBasename && p.lineId2 === target.label);

        const prunedDraft = stage3.data.pairs.filter((p) => !referencesTarget(p));
        const prunedSubmitted = stage3.data.submittedPairs
          ? stage3.data.submittedPairs.filter((p) => !referencesTarget(p))
          : null;

        const draftChanged = prunedDraft.length !== stage3.data.pairs.length;
        const submittedChanged =
          stage3.data.submittedPairs && prunedSubmitted.length !== stage3.data.submittedPairs.length;

        if (draftChanged || submittedChanged) {
          stage3.update({ pairs: prunedDraft, submittedPairs: prunedSubmitted });
        }
      }
    },
    [imageBasename, entry, lines, temImages, stage1, stage3]
  );

  const updateLineEndpoint = useCallback(
    (id, pointIndex, x, y) => {
      if (!imageBasename || !entry) return;
      const roundX = Math.round(x);
      const roundY = Math.round(y);
      const nextTemImages = temImages.map((t) => {
        if (t.image !== imageBasename) return t;
        return {
          ...t,
          lines: t.lines.map((l) => {
            if (l.id !== id) return l;
            const x1 = pointIndex === 1 ? roundX : l.x1;
            const y1 = pointIndex === 1 ? roundY : l.y1;
            const x2 = pointIndex === 2 ? roundX : l.x2;
            const y2 = pointIndex === 2 ? roundY : l.y2;
            const vx = x2 - x1;
            const vy = y2 - y1;
            const length_px = Math.round(Math.hypot(vx, vy) * 100) / 100;
            return { ...l, x1, y1, x2, y2, vx, vy, length_px };
          }),
        };
      });
      stage1.update({ temImages: nextTemImages });
    },
    [imageBasename, entry, temImages, stage1]
  );

  const moveLine = useCallback(
    (id, dx, dy, initialLine) => {
      if (!imageBasename || !entry || !initialLine) return;
      const rDx = Math.round(dx);
      const rDy = Math.round(dy);
      const nextTemImages = temImages.map((t) => {
        if (t.image !== imageBasename) return t;
        return {
          ...t,
          lines: t.lines.map((l) => {
            if (l.id !== id) return l;
            const x1 = initialLine.x1 + rDx;
            const y1 = initialLine.y1 + rDy;
            const x2 = initialLine.x2 + rDx;
            const y2 = initialLine.y2 + rDy;
            const vx = x2 - x1;
            const vy = y2 - y1;
            const length_px = Math.round(Math.hypot(vx, vy) * 100) / 100;
            return { ...l, x1, y1, x2, y2, vx, vy, length_px };
          }),
        };
      });
      stage1.update({ temImages: nextTemImages });
    },
    [imageBasename, entry, temImages, stage1]
  );

  const deleteLine = useCallback((id) => setDeleted(id, true), [setDeleted]);
  const restoreLine = useCallback((id) => setDeleted(id, false), [setDeleted]);

  return { lines, activeLines, manualLines, deletedLines, addLine, updateLineEndpoint, moveLine, deleteLine, restoreLine };
}

export default useLineAnnotations;
