import { useState, useEffect } from "react";
import Button from "@/components/ui/Button";
import DataTable from "@/components/ui/DataTable";
import Alert from "@/components/ui/Alert";
import StaleResultsNotice from "@/components/pipeline/StaleResultsNotice";
import { computeAngles, syncAnnotations } from "@/lib/api";
import { isActiveGVector } from "@/lib/annotations";
import useStage from "@/hooks/useStage";
import useProjectStore from "@/store/projectStore";
import { useAsyncAction } from "@/hooks/useAsyncAction";

const COLUMNS = [
  { key: "pair_id", label: "Pair" },
  { key: "image", label: "Image", mono: true },
  { key: "line_id", label: "Line", mono: true },
  { key: "g_id", label: "g-vector", mono: true },
  { key: "acute_deg", label: "Angle (°)", mono: true },
];

/**
 * Stage 4 -- G-vector Assignment & Angle Computation
 * Supports optional bulk g-vector assignment ("Use common g-vectors for all pairs")
 * while preserving pair-specific overrides, state persistence, and full scientific independence.
 */
export default function Stage4AngleComputation({ onComplete }) {
  const stage1 = useStage(1).data;
  const stage2 = useStage(2).data;
  const stage3 = useStage(3).data;
  const { data, update, isStale, upstreamStaleIds } = useStage(4);
  const { loading, error, run } = useAsyncAction();
  const [appliedNotice, setAppliedNotice] = useState(null);

  const useCommonGVectors = data?.useCommonGVectors ?? false;
  const commonSelections = data?.commonSelections ?? {};
  const overrides = data?.overrides ?? {};

  const pairs = (stage3.submittedPairs && stage3.submittedPairs.length > 0)
    ? stage3.submittedPairs
    : (stage3.pairs ?? []);
  const gvecsFor = (diffImage) =>
    (stage1.diffImages?.find((d) => d.image === diffImage)?.gvecs ?? []).filter(isActiveGVector);
  const diffImageFor = (temImage) => stage2.zoneAxisByTemImage?.[temImage]?.diffImage ?? null;

  // One row per (pair, line) -- i.e. 2 rows per pair.
  const rows = pairs.flatMap((p) => [
    { pairId: p.pairId, image: p.image1, lineId: p.lineId1 },
    { pairId: p.pairId, image: p.image2, lineId: p.lineId2 },
  ]);

  const allTemImages = Array.from(
    new Set([
      ...(stage1?.temImages ?? []).map((t) => (typeof t === "string" ? t : t?.image)).filter(Boolean),
      ...rows.map((r) => r.image).filter(Boolean),
    ])
  );

  // Unique TEM images actually used in current pairs
  const uniqueTemImages = Array.from(new Set(rows.map((r) => r.image).filter(Boolean)));

  const missingDiffImage = (Array.isArray(allTemImages) ? allTemImages : []).filter(
    (img) => !diffImageFor(img)
  );

  function selectionFor(pairId, image) {
    return (data?.selections ?? []).find((s) => s.pairId === pairId && s.image === image);
  }

  // Auto-inherit common selections for new pairs added while common mode is active
  useEffect(() => {
    if (!useCommonGVectors) return;
    let needsUpdate = false;
    const currentSelections = data?.selections ?? [];
    let nextSelections = [...currentSelections];

    pairs.forEach((p) => {
      if (overrides[p.pairId]) return;

      const sel1 = nextSelections.find((s) => s.pairId === p.pairId && s.image === p.image1);
      const sel2 = nextSelections.find((s) => s.pairId === p.pairId && s.image === p.image2);

      const common1 = commonSelections[p.image1] ?? [];
      const common2 = commonSelections[p.image2] ?? [];

      if (common1.length === 3 && (!sel1 || sel1.gIds.length === 0)) {
        needsUpdate = true;
        nextSelections = nextSelections.filter((s) => !(s.pairId === p.pairId && s.image === p.image1));
        nextSelections.push({ pairId: p.pairId, image: p.image1, diffImage: diffImageFor(p.image1), gIds: [...common1] });
      }

      if (common2.length === 3 && (!sel2 || sel2.gIds.length === 0)) {
        needsUpdate = true;
        nextSelections = nextSelections.filter((s) => !(s.pairId === p.pairId && s.image === p.image2));
        nextSelections.push({ pairId: p.pairId, image: p.image2, diffImage: diffImageFor(p.image2), gIds: [...common2] });
      }
    });

    if (needsUpdate) {
      update({ selections: nextSelections, angles: null });
    }
  }, [useCommonGVectors, pairs, commonSelections, overrides]);

  const incompleteRows = rows.filter(
    (r) => (selectionFor(r.pairId, r.image)?.gIds?.length ?? 0) < 3
  );

  const imagesById = useProjectStore((state) => state.project.images.byId);

  function handleToggleCommonMode(checked) {
    setAppliedNotice(null);
    update({ useCommonGVectors: checked });
  }

  function toggleCommonGId(temImage, gId) {
    setAppliedNotice(null);
    const current = commonSelections[temImage] ?? [];
    let nextGIds;
    if (current.includes(gId)) {
      nextGIds = current.filter((g) => g !== gId);
    } else if (current.length < 3) {
      nextGIds = [...current, gId];
    } else {
      return;
    }
    const nextCommon = { ...commonSelections, [temImage]: nextGIds };
    update({ commonSelections: nextCommon });
  }

  const allCommonValid =
    uniqueTemImages.length > 0 &&
    uniqueTemImages.every((temImg) => (commonSelections[temImg]?.length ?? 0) === 3);

  function handleApplyCommonSelections() {
    let appliedCount = 0;
    const currentSelections = data?.selections ?? [];
    let nextSelections = [...currentSelections];

    pairs.forEach((p) => {
      if (overrides[p.pairId]) return; // Skip overridden pairs

      appliedCount++;
      const gIds1 = commonSelections[p.image1] ?? [];
      const gIds2 = commonSelections[p.image2] ?? [];

      const diff1 = diffImageFor(p.image1);
      const diff2 = diffImageFor(p.image2);

      // Remove existing selections for this pair
      nextSelections = nextSelections.filter((s) => s.pairId !== p.pairId);

      nextSelections.push(
        { pairId: p.pairId, image: p.image1, diffImage: diff1, gIds: gIds1 },
        { pairId: p.pairId, image: p.image2, diffImage: diff2, gIds: gIds2 }
      );
    });

    update({ selections: nextSelections, angles: null });
    setAppliedNotice(`Common g-vector selections applied to ${appliedCount} pair${appliedCount === 1 ? "" : "s"}.`);
  }

  function handleOverridePair(pairId) {
    const nextOverrides = { ...overrides, [pairId]: true };
    setAppliedNotice(null);
    update({ overrides: nextOverrides, angles: null });
  }

  function handleUseCommonForPair(pairId) {
    const nextOverrides = { ...overrides };
    delete nextOverrides[pairId];
    setAppliedNotice(null);

    const p = pairs.find((pair) => pair.pairId === pairId);
    let nextSelections = (data?.selections ?? []).filter((s) => s.pairId !== pairId);

    if (p) {
      const gIds1 = commonSelections[p.image1] ?? [];
      const gIds2 = commonSelections[p.image2] ?? [];
      const diff1 = diffImageFor(p.image1);
      const diff2 = diffImageFor(p.image2);

      if (gIds1.length > 0) {
        nextSelections.push({ pairId, image: p.image1, diffImage: diff1, gIds: gIds1 });
      }
      if (gIds2.length > 0) {
        nextSelections.push({ pairId, image: p.image2, diffImage: diff2, gIds: gIds2 });
      }
    }

    update({ overrides: nextOverrides, selections: nextSelections, angles: null });
  }

  function toggleGId(pairId, image, diffImage, gId) {
    setAppliedNotice(null);
    const existing = selectionFor(pairId, image);
    const current = existing?.gIds ?? [];
    let nextGIds;
    if (current.includes(gId)) {
      nextGIds = current.filter((g) => g !== gId);
    } else if (current.length < 3) {
      nextGIds = [...current, gId];
    } else {
      return; // already 3 selected
    }

    const others = (data?.selections ?? []).filter((s) => !(s.pairId === pairId && s.image === image));
    update({ selections: [...others, { pairId, image, diffImage, gIds: nextGIds }], angles: null });
  }

  async function handleCompute() {
    const selections = (data?.selections ?? []).map((s) => ({
      pair_id: s.pairId,
      image: s.image,
      diff_image: s.diffImage,
      g_ids: s.gIds,
    }));
    const temToDiff = {};
    for (const r of rows) {
      const d = diffImageFor(r.image);
      if (d) temToDiff[r.image] = d;
    }

    const res = await run(async () => {
      if (stage1?.temImages?.length || stage1?.diffImages?.length) {
        try {
          await syncAnnotations(stage1.temImages, stage1.diffImages, imagesById);
        } catch (e) {
          console.warn("Annotation sync warning:", e);
        }
      }
      return computeAngles(selections, temToDiff);
    });
    if (res === undefined) return;

    update({ angles: res.angles });
    onComplete?.(res);
  }

  if (pairs.length === 0) {
    return (
      <Alert variant="warning">
        No confirmed line pairs yet -- submit at least one pair in Stage 3 (Line Pairing) first.
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <StaleResultsNotice isStale={isStale} upstreamStaleIds={upstreamStaleIds} />

      <div className="flex items-center justify-between rounded-lg border border-line bg-surfaceAlt px-4 py-3">
        <label className="flex items-center gap-2.5 text-sm font-medium text-ink cursor-pointer select-none">
          <input
            type="checkbox"
            checked={useCommonGVectors}
            onChange={(e) => handleToggleCommonMode(e.target.checked)}
            className="h-4 w-4 rounded border-line text-beam-600 focus:ring-beam-500"
          />
          Use common g-vectors for all pairs
        </label>
        <span className="text-xs text-subtle">
          {useCommonGVectors ? "Common mode active" : "Pair-specific mode active"}
        </span>
      </div>

      {useCommonGVectors && (
        <section className="space-y-4 rounded-lg border border-beam-200 bg-beam-50/40 p-4">
          <div>
            <h3 className="text-sm font-semibold text-beam-900">Common g-vector assignment</h3>
            <p className="text-xs text-beam-700">
              Select exactly 3 g-vectors for each image/orientation. Applying will assign them to all
              non-overridden pairs.
            </p>
          </div>

          <div className="space-y-3">
            {uniqueTemImages.map((temImg, idx) => {
              const diffImg = diffImageFor(temImg);
              const selectedGIds = commonSelections[temImg] ?? [];
              const availableGVecs = diffImg ? gvecsFor(diffImg) : [];

              return (
                <div key={temImg} className="rounded-md border border-beam-200 bg-surface p-3">
                  <p className="mb-2 text-sm text-ink font-medium">
                    Image/orientation {idx + 1}: <span className="font-mono">{temImg}</span>
                    {diffImg ? (
                      <span className="text-xs font-normal text-muted"> (indexed against {diffImg})</span>
                    ) : (
                      <span className="text-xs text-warn"> (no diffraction image assigned)</span>
                    )}
                  </p>

                  {diffImg && (
                    <div className="flex flex-wrap gap-1.5">
                      {availableGVecs.map((g) => {
                        const selected = selectedGIds.includes(g.g_id);
                        return (
                          <button
                            key={g.g_id}
                            type="button"
                            onClick={() => toggleCommonGId(temImg, g.g_id)}
                            disabled={!selected && selectedGIds.length >= 3}
                            className={`rounded-full border px-2.5 py-1 font-mono text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                              selected
                                ? "border-beam-600 bg-beam-100 text-beam-800 font-semibold"
                                : "border-line text-muted hover:border-lineStrong"
                            }`}
                          >
                            {g.g_id}
                            {g.hkl && <span className="ml-1 text-subtle">{`[${g.hkl.join(" ")}]`}</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <p className="mt-1.5 text-xs text-subtle">{selectedGIds.length} / 3 selected</p>
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button
              variant="secondary"
              onClick={handleApplyCommonSelections}
              disabled={!allCommonValid}
            >
              Apply common selections to all pairs
            </Button>
          </div>

          {appliedNotice && <Alert variant="success">{appliedNotice}</Alert>}
        </section>
      )}

      {pairs.map((p) => {
        const isOverridden = Boolean(overrides[p.pairId]);
        const isUsingCommon = useCommonGVectors && !isOverridden;

        return (
          <section key={p.pairId} className="space-y-3 rounded-lg border border-line p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-ink">Pair {p.pairId}</h3>
                {useCommonGVectors && (
                  isOverridden ? (
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800">
                      Pair-specific override
                    </span>
                  ) : (
                    <span className="rounded-full bg-beam-100 px-2.5 py-0.5 text-xs font-medium text-beam-800">
                      Using common g-vector selection
                    </span>
                  )
                )}
              </div>

              {useCommonGVectors && (
                isOverridden ? (
                  <Button variant="ghost" size="sm" onClick={() => handleUseCommonForPair(p.pairId)}>
                    Use common selection
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" onClick={() => handleOverridePair(p.pairId)}>
                    Override for this pair
                  </Button>
                )
              )}
            </div>

            {[
              { image: p.image1, lineId: p.lineId1 },
              { image: p.image2, lineId: p.lineId2 },
            ].map(({ image, lineId }) => {
              const diffImage = diffImageFor(image);
              const selection = selectionFor(p.pairId, image);
              const selectedIds = selection?.gIds ?? [];
              const chipsReadOnly = isUsingCommon;

              return (
                <div key={image} className="rounded-md border border-line p-3">
                  <p className="mb-2 text-sm text-muted">
                    <span className="font-mono text-ink">{image}</span> — line{" "}
                    <span className="font-mono text-ink">{lineId}</span>
                    {diffImage ? (
                      <>
                        {" "}
                        · indexed against <span className="font-mono text-ink">{diffImage}</span>
                      </>
                    ) : (
                      <span className="text-warn"> · no diffraction image set in Stage 2</span>
                    )}
                  </p>
                  {diffImage && (
                    <div className="flex flex-wrap gap-1.5">
                      {gvecsFor(diffImage).map((g) => {
                        const selected = selectedIds.includes(g.g_id);
                        return (
                          <button
                            key={g.g_id}
                            type="button"
                            onClick={() => {
                              if (!chipsReadOnly) {
                                toggleGId(p.pairId, image, diffImage, g.g_id);
                              }
                            }}
                            disabled={chipsReadOnly || (!selected && selectedIds.length >= 3)}
                            className={`rounded-full border px-2.5 py-1 font-mono text-xs transition-colors ${
                              chipsReadOnly ? "cursor-default opacity-85" : "disabled:cursor-not-allowed disabled:opacity-40"
                            } ${
                              selected
                                ? "border-beam-500 bg-beam-50 text-beam-700 font-medium"
                                : "border-line text-muted hover:border-lineStrong"
                            }`}
                          >
                            {g.g_id}
                            {g.hkl && <span className="ml-1 text-subtle">{`[${g.hkl.join(" ")}]`}</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <p className="mt-1.5 text-xs text-subtle">{selectedIds.length} / 3 selected</p>
                </div>
              );
            })}
          </section>
        );
      })}

      {(missingDiffImage?.length ?? 0) > 0 && (
        <Alert variant="warning">
          Set a diffraction image for every TEM image in Stage 2 before assigning g-vectors here.
        </Alert>
      )}
      {(missingDiffImage?.length ?? 0) === 0 && (incompleteRows?.length ?? 0) > 0 && (
        <Alert variant="warning">
          {(incompleteRows?.length ?? 0)} line{(incompleteRows?.length ?? 0) === 1 ? "" : "s"} still need exactly 3
          g-vectors selected.
        </Alert>
      )}

      <div className="flex items-center gap-3">
        <Button
          onClick={handleCompute}
          loading={loading}
          disabled={(incompleteRows?.length ?? 0) > 0 || (missingDiffImage?.length ?? 0) > 0 || (upstreamStaleIds?.length ?? 0) > 0}
        >
          Compute trace angles
        </Button>
      </div>

      <Alert variant="error" message={error} onRetry={handleCompute} />

      {data.angles?.length > 0 && (
        <DataTable
          columns={COLUMNS}
          rows={data.angles.map((a) => ({
            ...a,
            acute_deg: typeof a.acute_deg === "number" ? a.acute_deg.toFixed(1) : a.acute_deg,
          }))}
        />
      )}
    </div>
  );
}

