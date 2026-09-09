import { useState, useMemo, useCallback, memo } from "react";
import Button from "@/components/ui/Button";
import Alert from "@/components/ui/Alert";
import StaleResultsNotice from "@/components/pipeline/StaleResultsNotice";
import LineLabelOverlay from "@/components/image/rendering/LineLabelOverlay";
import { submitLinePairs, syncAnnotations } from "@/lib/api";
import { isActiveLine } from "@/lib/annotations";
import useProjectStore from "@/store/projectStore";
import useStage from "@/hooks/useStage";
import { useAsyncAction } from "@/hooks/useAsyncAction";

const EMPTY_DRAFT = { image1: "", lineId1: "", image2: "", lineId2: "" };

const SLOT1_COLOR = "#38BDF8"; // beam
const SLOT2_COLOR = "#FBBF24"; // amber

const TemImageCard = memo(function TemImageCard({ image, lines, img, highlighted, onLineClick }) {
  const handleClick = useCallback(
    (label) => {
      onLineClick(image, label);
    },
    [image, onLineClick]
  );

  return (
    <LineLabelOverlay
      src={img?.thumbnail ?? null}
      filename={image}
      width={img?.width}
      height={img?.height}
      lines={lines}
      highlightedLabels={highlighted}
      onLineClick={handleClick}
    />
  );
});

export default function Stage3LinePairing({ onComplete }) {
  const stage1 = useStage(1).data;
  const { data, update, isStale, upstreamStaleIds } = useStage(3);
  const imagesById = useProjectStore((state) => state.project.images.byId);
  const { loading, error, run } = useAsyncAction();
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState(null);

  const temImages = useMemo(
    () => (stage1.temImages ?? []).map((t) => ({ ...t, lines: t.lines.filter(isActiveLine) })),
    [stage1.temImages]
  );

  const linesFor = useCallback(
    (image) => temImages.find((t) => t.image === image)?.lines ?? [],
    [temImages]
  );

  function nextPairId() {
    const n = data.pairs.length + 1;
    let id = `P${n}`;
    const used = new Set(data.pairs.map((p) => p.pairId));
    let i = n;
    while (used.has(id)) {
      i += 1;
      id = `P${i}`;
    }
    return id;
  }

  function resetDraft() {
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
  }

  function handleAddOrSave() {
    if (!draft.image1 || !draft.lineId1 || !draft.image2 || !draft.lineId2) return;

    if (editingId) {
      update({
        pairs: data.pairs.map((p) => (p.pairId === editingId ? { ...p, ...draft } : p)),
      });
    } else {
      update({ pairs: [...data.pairs, { pairId: nextPairId(), ...draft }] });
    }
    resetDraft();
  }

  function handleEdit(pair) {
    setEditingId(pair.pairId);
    setDraft({ image1: pair.image1, lineId1: pair.lineId1, image2: pair.image2, lineId2: pair.lineId2 });
  }

  function handleRemove(pairId) {
    update({ pairs: data.pairs.filter((p) => p.pairId !== pairId) });
    if (editingId === pairId) resetDraft();
  }

  const handleOverlayLineClick = useCallback((image, label) => {
    setDraft((prev) => {
      if (!prev.image1 || !prev.lineId1) {
        return { ...prev, image1: image, lineId1: label };
      } else if (!prev.image2 || !prev.lineId2) {
        return { ...prev, image2: image, lineId2: label };
      } else {
        return { image1: image, lineId1: label, image2: "", lineId2: "" };
      }
    });
  }, []);

  async function handleSubmit() {
    const res = await run(async () => {
      if (stage1.temImages?.length || stage1.diffImages?.length) {
        try {
          await syncAnnotations(stage1.temImages, stage1.diffImages, imagesById);
        } catch (e) {
          console.warn("Annotation sync warning:", e);
        }
      }
      return submitLinePairs(data.pairs.map((p) => ({ pair_id: p.pairId, image1: p.image1, line_id1: p.lineId1, image2: p.image2, line_id2: p.lineId2 })));
    });
    if (res === undefined) return; // failed; error banner already shown

    const confirmed = res?.pairs && res.pairs.length > 0 ? res.pairs : data.pairs;
    update({ submittedPairs: confirmed, pairs: confirmed });
    onComplete?.(res);
  }

  const draftValid = draft.image1 && draft.lineId1 && draft.image2 && draft.lineId2;

  if (temImages.length < 2) {
    return (
      <Alert variant="warning">
        At least 2 TEM images with detected lines are needed to create a pair -- complete Stage 1
        first.
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <StaleResultsNotice isStale={isStale} upstreamStaleIds={upstreamStaleIds} />
      <section className="space-y-2">
        <p className="text-xs text-subtle">
          Detected line labels, drawn on their own image (identifiers only -- not implied
          correspondence across images). Click a line as a shortcut to fill the pair builder below, or
          use the dropdowns directly.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {temImages.map(({ image, lines }) => {
            const img = imagesById[image];
            const highlighted = {};
            if (draft.image1 === image && draft.lineId1) highlighted[draft.lineId1] = SLOT1_COLOR;
            if (draft.image2 === image && draft.lineId2) highlighted[draft.lineId2] = SLOT2_COLOR;

            return (
              <TemImageCard
                key={image}
                image={image}
                lines={lines}
                img={img}
                highlighted={highlighted}
                onLineClick={handleOverlayLineClick}
              />
            );
          })}
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-line p-4">
        <h3 className="text-sm font-semibold text-ink">
          {editingId ? `Editing pair ${editingId}` : "Create a pair"}
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          {[1, 2].map((side) => {
            const imageKey = `image${side}`;
            const lineKey = `lineId${side}`;
            const swatch = side === 1 ? SLOT1_COLOR : SLOT2_COLOR;
            return (
              <div key={side} className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: swatch }}
                  aria-hidden="true"
                />
                <select
                  value={draft[imageKey]}
                  onChange={(e) => setDraft({ ...draft, [imageKey]: e.target.value, [lineKey]: "" })}
                  className="min-w-0 flex-1 truncate rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink focus:border-beam-500 focus:outline-none"
                >
                  <option value="">Image {side}…</option>
                  {temImages.map((t) => (
                    <option key={t.image} value={t.image}>
                      {t.image}
                    </option>
                  ))}
                </select>
                <select
                  value={draft[lineKey]}
                  onChange={(e) => setDraft({ ...draft, [lineKey]: e.target.value })}
                  disabled={!draft[imageKey]}
                  className="w-28 shrink-0 rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink focus:border-beam-500 focus:outline-none disabled:opacity-50"
                >
                  <option value="">Label…</option>
                  {linesFor(draft[imageKey]).map((l) => (
                    <option key={l.label} value={l.label}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={handleAddOrSave} disabled={!draftValid}>
            {editingId ? "Save pair" : "Add pair"}
          </Button>
          {editingId && (
            <Button variant="ghost" onClick={resetDraft}>
              Cancel
            </Button>
          )}
        </div>
      </section>

      {data.pairs.length > 0 && (
        <section className="overflow-hidden rounded-lg border border-line">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-surfaceAlt text-left text-xs uppercase tracking-wide text-subtle">
                <th className="px-4 py-2.5 font-medium">Pair</th>
                <th className="px-4 py-2.5 font-medium">Image 1 / line</th>
                <th className="px-4 py-2.5 font-medium">Image 2 / line</th>
                <th className="px-4 py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody>
              {data.pairs.map((p) => (
                <tr key={p.pairId} className="border-t border-line">
                  <td className="px-4 py-2.5 font-mono text-[13px]">{p.pairId}</td>
                  <td className="px-4 py-2.5 font-mono text-[13px]">
                    {p.image1} — {p.lineId1}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[13px]">
                    {p.image2} — {p.lineId2}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => handleEdit(p)}
                      className="mr-3 text-xs font-medium text-beam-600 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(p.pairId)}
                      className="text-xs font-medium text-err hover:underline"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <div className="flex items-center gap-3">
        <Button
          onClick={handleSubmit}
          loading={loading}
          disabled={data.pairs.length === 0 || upstreamStaleIds.length > 0}
        >
          Submit {data.pairs.length} pair{data.pairs.length === 1 ? "" : "s"}
        </Button>
      </div>

      {data.submittedPairs && (
        <Alert variant="success">
          {data.submittedPairs.length} pair{data.submittedPairs.length === 1 ? "" : "s"} confirmed by the
          backend. Continue to G-vector Assignment.
        </Alert>
      )}

      <Alert variant="error" message={error} onRetry={handleSubmit} />
    </div>
  );
}
