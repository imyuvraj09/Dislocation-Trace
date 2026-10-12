import { useMemo, useCallback, memo } from "react";
import Button from "@/components/ui/Button";
import Alert from "@/components/ui/Alert";
import StaleResultsNotice from "@/components/pipeline/StaleResultsNotice";
import GVectorLabelOverlay from "@/components/image/rendering/GVectorLabelOverlay";
import { submitMillerAssignments } from "@/lib/api";
import { isActiveGVector } from "@/lib/annotations";
import useProjectStore from "@/store/projectStore";
import useStage from "@/hooks/useStage";
import { useAsyncAction } from "@/hooks/useAsyncAction";

const DiffractionImageCard = memo(function DiffractionImageCard({
  image,
  gvecs,
  img,
  millerIndices,
  setMillerField,
  millerAxes,
}) {
  const overlayGVectors = useMemo(() => {
    const forImg = millerIndices ?? {};
    return gvecs.map((g) => {
      const value = forImg[g.g_id];
      const hasFullIndex = value?.length === millerAxes.length && value.every((v) => v !== "");
      return { ...g, label: hasFullIndex ? `${g.g_id} [${value.join(" ")}]` : g.g_id };
    });
  }, [gvecs, millerIndices, millerAxes.length]);

  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <GVectorLabelOverlay
        src={img?.thumbnail ?? null}
        filename={image}
        width={img?.width}
        height={img?.height}
        gvecs={overlayGVectors}
      />
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-t border-line text-left text-xs uppercase tracking-wide text-subtle">
            <th className="px-4 py-2 font-medium">Spot</th>
            <th className="px-4 py-2 font-medium">Miller index ({millerAxes.join(" ")})</th>
          </tr>
        </thead>
        <tbody>
          {gvecs.map((g) => {
            const stored = millerIndices?.[g.g_id];
            const value = stored?.length === millerAxes.length ? stored : millerAxes.map(() => "");
            return (
              <tr key={g.g_id} className="border-t border-line">
                <td className="px-4 py-2 font-mono text-[13px]">{g.g_id}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-subtle">(</span>
                    {millerAxes.map((axis, i) => (
                      <input
                        key={axis}
                        type="number"
                        value={value[i]}
                        onChange={(e) => setMillerField(image, g.g_id, axis, e.target.value)}
                        aria-label={`${g.g_id} ${axis}`}
                        className="w-14 rounded border border-line bg-surface px-1.5 py-1 text-center font-mono text-sm text-ink focus:border-beam-500 focus:outline-none"
                      />
                    ))}
                    <span className="text-subtle">)</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});

export default function Stage2MillerIndex({ onComplete }) {
  const stage1 = useStage(1);
  const { data, update, isStale, upstreamStaleIds } = useStage(2);
  const imagesById = useProjectStore((state) => state.project.images.byId);
  const materialId = useProjectStore((state) => state.project.material?.id ?? null);
  const cOverA = useProjectStore((state) => state.project.material?.cOverA ?? null);
  const setCOverA = useProjectStore((state) => state.setCOverA);
  const { loading, error, run } = useAsyncAction();

  const isHcp = materialId === "HCP_Hexagonal_Close_Packed";
  const needsCOverA = isHcp || materialId?.toLowerCase().includes("tetragonal");
  const millerAxes = isHcp ? ["h", "k", "i", "l"] : ["h", "k", "l"];
  const zoneAxisKeys = isHcp ? ["h", "k", "i", "l"] : ["h", "k", "l"];
  const zoneAxisLabels = isHcp ? ["u", "v", "t", "w"] : ["u", "v", "w"];

  const temImages = stage1.data.temImages ?? [];
  const diffImages = useMemo(
    () => (stage1.data.diffImages ?? []).map((d) => ({ ...d, gvecs: d.gvecs.filter(isActiveGVector) })),
    [stage1.data.diffImages]
  );

  const setZoneAxisField = useCallback(
    (image, field, value) => {
      const current = data.zoneAxisByTemImage[image] ?? { h: "", k: "", i: "", l: "", diffImage: null };
      update({
        zoneAxisByTemImage: { ...data.zoneAxisByTemImage, [image]: { ...current, [field]: value } },
      });
    },
    [data.zoneAxisByTemImage, update]
  );

  const setMillerField = useCallback(
    (source, gId, field, value) => {
      const forImage = data.millerIndexByGvector[source] ?? {};
      const stored = forImage[gId];
      const current = stored?.length === millerAxes.length ? stored : millerAxes.map(() => "");
      const index = millerAxes.indexOf(field);
      const next = [...current];
      next[index] = value;
      update({
        millerIndexByGvector: {
          ...data.millerIndexByGvector,
          [source]: { ...forImage, [gId]: next },
        },
      });
    },
    [data.millerIndexByGvector, millerAxes, update]
  );

  const pendingAssignments = useMemo(
    () =>
      diffImages.flatMap(({ image, gvecs }) =>
        gvecs
          .map((g) => ({ source: image, g_id: g.g_id, hkl: data.millerIndexByGvector[image]?.[g.g_id] }))
          .filter(({ hkl }) => hkl?.length === millerAxes.length && hkl.every((v) => v !== ""))
      ),
    [diffImages, data.millerIndexByGvector, millerAxes.length]
  );

  const missingZoneAxis = useMemo(
    () =>
      temImages.filter((t) => {
        const z = data.zoneAxisByTemImage[t.image];
        return !z || zoneAxisKeys.some((key) => z[key] === "" || z[key] == null) || !z.diffImage;
      }),
    [temImages, data.zoneAxisByTemImage, zoneAxisKeys]
  );

  async function handleSave() {
    const res = await run(() => submitMillerAssignments(pendingAssignments, materialId, cOverA));
    if (res === undefined) return; // failed; error banner already shown

    const updatedByKey = new Map(res.updated.map((u) => [`${u.source}::${u.g_id}`, u.hkl]));
    const nextDiffImages = stage1.data.diffImages.map((d) => ({
      ...d,
      gvecs: d.gvecs.map((g) => {
        const key = `${d.image}::${g.g_id}`;
        return updatedByKey.has(key) ? { ...g, hkl: updatedByKey.get(key) } : g;
      }),
    }));
    stage1.update({ diffImages: nextDiffImages });

    onComplete?.(res);
  }

  if (temImages.length === 0 && diffImages.length === 0) {
    return (
      <Alert variant="warning">
        No detected images yet -- complete Stage 1 (Image Detection) first.
      </Alert>
    );
  }

  return (
    <div className="space-y-8">
      <StaleResultsNotice isStale={isStale} upstreamStaleIds={upstreamStaleIds} />
      {!materialId && (
        <Alert variant="warning">Select a material / crystal structure before assigning indices.</Alert>
      )}
      {needsCOverA && (
        <section className="rounded-lg border border-line bg-surfaceAlt px-4 py-3">
          <label className="flex flex-wrap items-center gap-3 text-sm font-medium text-ink">
            Lattice c/a ratio
            <input
              type="number"
              min="0"
              step="any"
              value={cOverA ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                setCOverA(raw === "" ? null : Number.parseFloat(raw));
              }}
              placeholder={isHcp ? "e.g. 1.633" : "Enter c/a"}
              aria-label="Stage 2 lattice c over a ratio"
              className="w-32 rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-sm text-ink focus:border-beam-500 focus:outline-none"
            />
            <span className="text-xs font-normal text-subtle">
              Required for {isHcp ? "HCP" : "tetragonal"} Miller-to-Cartesian conversion.
            </span>
          </label>
        </section>
      )}
      {needsCOverA && (!(Number(cOverA) > 0) || !Number.isFinite(Number(cOverA))) && (
        <Alert variant="warning">Enter a finite positive c/a ratio above before saving indices.</Alert>
      )}
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-ink">TEM–diffraction image pairing</h3>
          <p className="text-xs text-subtle">
            Match each TEM image to its corresponding diffraction pattern and enter the zone axis
          </p>
        </div>
        <div className="space-y-3">
          {temImages.map(({ image }) => {
            const z = data.zoneAxisByTemImage[image] ?? { h: "", k: "", i: "", l: "", diffImage: null };
            return (
              <div
                key={image}
                className="flex flex-wrap items-center gap-4 rounded-lg border border-line px-4 py-3"
              >
                <span className="min-w-[10rem] font-mono text-sm text-ink">{image}</span>
                <div className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1.5">
                  <span className="pl-1 text-subtle">[</span>
                  {zoneAxisKeys.map((axis, index) => (
                    <input
                      key={axis}
                      type="number"
                      value={z[axis]}
                      onChange={(e) => setZoneAxisField(image, axis, e.target.value)}
                      aria-label={`${image} zone axis ${zoneAxisLabels[index]}`}
                      placeholder={zoneAxisLabels[index]}
                      className="w-12 border-0 bg-transparent text-center font-mono text-sm text-ink focus:outline-none focus:ring-0"
                    />
                  ))}
                  <span className="pr-1 text-subtle">]</span>
                </div>
                <label className="flex items-center gap-2 text-sm text-muted">
                  Indexed against
                  <select
                    value={z.diffImage ?? ""}
                    onChange={(e) => setZoneAxisField(image, "diffImage", e.target.value || null)}
                    className="min-w-0 max-w-xs truncate rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink focus:border-beam-500 focus:outline-none"
                  >
                    <option value="">Select diffraction image…</option>
                    {diffImages.map((d) => (
                      <option key={d.image} value={d.image}>
                        {d.image}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            );
          })}
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-ink">Miller indices of marked g-vectors</h3>
          <p className="text-xs text-subtle">
            Enter the Miller indices you determined for each manually marked g-vector. Use the labels in the image below to match each vector to its entry. Index at least three vectors per diffraction pattern. Leave unused entries blank. To adjust the annotations, return to the Image Workspace.
          </p>
        </div>
        {diffImages.map(({ image, gvecs }) => {
          const img = imagesById[image];
          const millerIndices = data.millerIndexByGvector[image];
          return (
            <DiffractionImageCard
              key={image}
              image={image}
              gvecs={gvecs}
              img={img}
              millerIndices={millerIndices}
              setMillerField={setMillerField}
              millerAxes={millerAxes}
            />
          );
        })}
      </section>

      {missingZoneAxis.length > 0 && (
        <Alert variant="warning">
          Zone axis + diffraction image still needed for:{" "}
          {missingZoneAxis.map((t) => t.image).join(", ")}.
        </Alert>
      )}

      <div className="flex items-center gap-3">
        <Button
          onClick={handleSave}
          loading={loading}
          disabled={
            pendingAssignments.length === 0 ||
            !materialId ||
            (needsCOverA && (!(Number(cOverA) > 0) || !Number.isFinite(Number(cOverA))))
          }
        >
          Save Miller indices ({pendingAssignments.length})
        </Button>
      </div>

      <Alert variant="error" message={error} onRetry={handleSave} />
    </div>
  );
}
