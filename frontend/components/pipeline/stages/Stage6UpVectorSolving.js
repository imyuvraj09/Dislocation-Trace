import Button from "@/components/ui/Button";
import Alert from "@/components/ui/Alert";
import StaleResultsNotice from "@/components/pipeline/StaleResultsNotice";
import { solveUpVector } from "@/lib/api";
import useStage from "@/hooks/useStage";
import useProjectStore from "@/store/projectStore";
import { useAsyncAction } from "@/hooks/useAsyncAction";

/**
 * Stage 5 -- solves the Up-vector for every line in every pair, using each
 * image's zone axis (entered by the user in Stage 2) and the 3 g-vectors
 * already assigned to that line (chosen by the user in Stage 4). This
 * stage doesn't collect any new scientific input of its own -- it reuses
 * the single source of truth already recorded upstream, one backend call
 * per (pair, image).
 */
export default function Stage6UpVectorSolving({ onComplete }) {
  const stage2 = useStage(2).data;
  const stage3 = useStage(3).data;
  const stage4 = useStage(4).data;
  const { data, update, isStale, upstreamStaleIds } = useStage(5);
  const materialId = useProjectStore((state) => state.project.material?.id ?? null);
  const cOverA = useProjectStore((state) => state.project.material?.cOverA ?? null);
  const { loading, error, run } = useAsyncAction();
  const isHcp = materialId === "HCP_Hexagonal_Close_Packed";
  const needsCOverA = isHcp || materialId?.toLowerCase().includes("tetragonal");

  const pairs = stage3.submittedPairs ?? [];
  const rows = pairs.flatMap((p) => [
    { pairId: p.pairId, image: p.image1, lineId: p.lineId1 },
    { pairId: p.pairId, image: p.image2, lineId: p.lineId2 },
  ]);

  function zoneAxisFor(image) {
    const z = stage2.zoneAxisByTemImage?.[image];
    const keys = isHcp ? ["h", "k", "i", "l"] : ["h", "k", "l"];
    if (!z || keys.some((key) => z[key] === "" || z[key] == null)) return null;
    return keys.map((key) => z[key]);
  }

  function selectionFor(pairId, image) {
    return stage4.selections?.find((s) => s.pairId === pairId && s.image === image);
  }

  const readyRows = rows.filter((r) => zoneAxisFor(r.image) && selectionFor(r.pairId, r.image)?.gIds?.length === 3);
  const notReadyRows = rows.filter((r) => !readyRows.includes(r));

  async function handleSolveAll() {
    const results = { ...data.resultsByPairImage };
    for (const r of readyRows) {
      const selection = selectionFor(r.pairId, r.image);
      // eslint-disable-next-line no-await-in-loop -- solve-up must run
      // sequentially per line so a failure on one doesn't race a partial
      // update to the shared `results` object below.
      const res = await run(() =>
        solveUpVector({
          pairId: r.pairId,
          image: r.image,
          lineId: r.lineId,
          diffImage: selection.diffImage,
          gIds: selection.gIds,
          zoneAxis: zoneAxisFor(r.image),
          materialId,
          cOverA,
        })
      );
      if (res === undefined) return; // failed; error banner already shown, stop here
      results[`${r.pairId}::${r.image}`] = res.result;
    }
    update({ resultsByPairImage: results });
    onComplete?.({ results });
  }

  if (pairs.length === 0) {
    return <Alert variant="warning">No confirmed line pairs yet -- complete Stage 3 first.</Alert>;
  }

  return (
    <div className="space-y-5">
      <StaleResultsNotice isStale={isStale} upstreamStaleIds={upstreamStaleIds} />
      {!materialId && <Alert variant="warning">Select a material / crystal structure before solving.</Alert>}
      {needsCOverA && (!(Number(cOverA) > 0) || !Number.isFinite(Number(cOverA))) && (
        <Alert variant="warning">Enter a finite positive c/a ratio above before solving.</Alert>
      )}
      {notReadyRows.length > 0 && (
        <Alert variant="warning">
          {notReadyRows.length} line{notReadyRows.length === 1 ? "" : "s"} still missing a zone axis
          (Stage 2) or 3 assigned g-vectors (Stage 4):{" "}
          {notReadyRows.map((r) => `${r.pairId}/${r.image}`).join(", ")}.
        </Alert>
      )}

      <Button
        onClick={handleSolveAll}
        loading={loading}
        disabled={
          readyRows.length === 0 ||
          upstreamStaleIds.length > 0 ||
          !materialId ||
          (needsCOverA && (!(Number(cOverA) > 0) || !Number.isFinite(Number(cOverA))))
        }
      >
        Solve Up-vectors ({readyRows.length} line{readyRows.length === 1 ? "" : "s"} ready)
      </Button>

      <Alert variant="error" message={error} onRetry={handleSolveAll} />

      {Object.keys(data.resultsByPairImage).length > 0 && (
        <div className="overflow-hidden rounded-lg border border-line">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-surfaceAlt text-left text-xs uppercase tracking-wide text-subtle">
                <th className="px-4 py-2.5 font-medium">Pair / image</th>
                <th className="px-4 py-2.5 font-medium">Up-vector</th>
                <th className="px-4 py-2.5 font-medium">Method</th>
                <th className="px-4 py-2.5 font-medium">Residual</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(data.resultsByPairImage).map(([key, r]) => (
                <tr key={key} className="border-t border-line">
                  <td className="px-4 py-2.5 font-mono text-[13px]">{key.replace("::", " / ")}</td>
                  <td className="px-4 py-2.5 font-mono text-[13px]">
                    [{r.Up_norm.map((n) => (typeof n === "number" ? n.toFixed(2) : n)).join(", ")}]
                  </td>
                  <td className="px-4 py-2.5 text-muted">{r.method}</td>
                  <td className="px-4 py-2.5 font-mono text-[13px]">{r.residual.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
