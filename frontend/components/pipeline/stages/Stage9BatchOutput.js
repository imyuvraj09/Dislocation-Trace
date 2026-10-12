import { useState, useEffect, useMemo } from "react";
import Button from "@/components/ui/Button";
import DataTable from "@/components/ui/DataTable";
import Alert from "@/components/ui/Alert";
import StaleResultsNotice from "@/components/pipeline/StaleResultsNotice";
import { fetchBatchResults, exportBatchAsCsv, classifyLine } from "@/lib/api";
import useStage from "@/hooks/useStage";
import useProjectStore from "@/store/projectStore";
import { useAsyncAction } from "@/hooks/useAsyncAction";

const BATCH_COLUMNS = [
  { key: "Pair ID",                                     label: "Pair ID" },
  { key: "TEM Image 1",                                 label: "TEM Image 1", mono: true },
  { key: "TEM Image 2",                                 label: "TEM Image 2", mono: true },
  { key: "Indexed true line direction (uT)",            label: "Indexed true line direction (uT)", mono: true },
  { key: "Continuous normalized uT—full precision",     label: "Continuous normalized uT—full precision", mono: true },
  { key: "uT indexing deviation (°)",                   label: "uT indexing deviation (°)", mono: true },
  { key: "Selected Burgers vector (b)",                 label: "Selected Burgers vector (b)", mono: true },
  { key: "Character",                                   label: "Character" },
  { key: "Angle between uT and b (°)",                  label: "Angle between uT and b (°)", mono: true },
  { key: "Continuous slip-plane normal—full precision", label: "Continuous slip-plane normal—full precision", mono: true },
  { key: "Integer-indexed slip plane",                  label: "Integer-indexed slip plane", mono: true },
  { key: "Closest low-index slip plane",                label: "Closest low-index slip plane", mono: true },
  { key: "Low-index plane family",                      label: "Low-index plane family", mono: true },
  { key: "Low-index deviation (°)",                     label: "Low-index deviation (°)", mono: true },
  { key: "Slip system",                                 label: "Slip system", mono: true },
  { key: "Residual",                                    label: "Residual", mono: true },
  { key: "Status",                                      label: "Status" },
];

function getCrystalSystem(materialId) {
  const key = (materialId || "").toLowerCase();
  if (key.includes("hcp") || key.includes("hexagonal")) return "hcp";
  if (key.includes("tetragonal")) return "tetragonal";
  return "cubic";
}

function validateBurgersVector(rawValues, crystalSystem) {
  const expectedCount = crystalSystem === "hcp" ? 4 : 3;
  if (!Array.isArray(rawValues) || rawValues.length !== expectedCount) {
    return { isValid: false, error: `Enter all ${expectedCount} indices for the Burgers vector.`, parsed: null };
  }

  const parsed = [];
  for (let i = 0; i < expectedCount; i++) {
    const v = rawValues[i];
    if (v === "" || v === null || v === undefined) {
      return { isValid: false, error: `Index ${i + 1} is empty.`, parsed: null };
    }
    const num = Number(v);
    if (!Number.isFinite(num)) {
      return { isValid: false, error: `Index "${v}" is not a valid number.`, parsed: null };
    }
    parsed.push(num);
  }

  if (parsed.every((n) => Math.abs(n) < 1e-9)) {
    return { isValid: false, error: "Burgers vector cannot be all zeros.", parsed: null };
  }

  if (crystalSystem === "hcp") {
    const [u, v, t] = parsed;
    if (Math.abs(t + (u + v)) > 1e-6) {
      return {
        isValid: false,
        error: `Invalid HCP direction [${parsed.join(" ")}]: the redundant index must satisfy t = -(u + v) = ${-(u + v)}.`,
        parsed: null,
      };
    }
  }

  return { isValid: true, error: null, parsed };
}

function formatVectorDisplay(vec) {
  if (!vec) return "";
  if (Array.isArray(vec)) return `[${vec.join(" ")}]`;
  return String(vec);
}

function formatNormDisplay(norm) {
  if (!norm) return "";
  if (Array.isArray(norm)) {
    return `[${norm.map((n) => (typeof n === "number" ? n.toFixed(3) : n)).join(", ")}]`;
  }
  return String(norm);
}

/** Stage 7 / Final Stage — Burgers Vector, Classification and Output */
export default function Stage9BatchOutput({ onComplete }) {
  const stage2 = useStage(2).data;
  const stage3 = useStage(3).data;
  const stage6 = useStage(6).data;
  const { data, update, isStale, upstreamStaleIds } = useStage(7);

  const appendExportRecord = useProjectStore((state) => state.appendExportRecord);
  const materialId = useProjectStore((state) => state.project.material?.id ?? null);
  const selectedBurgersVector = useProjectStore((state) => state.project.material?.selectedBurgersVector ?? null);
  const burgersByPair = useProjectStore((state) => state.project.material?.burgersByPair ?? {});
  const burgersSourceByPair = useProjectStore((state) => state.project.material?.burgersSourceByPair ?? {});
  const setPairBurgersVector = useProjectStore((state) => state.setPairBurgersVector);
  const setAllPairsBurgersVector = useProjectStore((state) => state.setAllPairsBurgersVector);
  const setPairClassification = useProjectStore((state) => state.setPairClassification);

  const { loading: batchLoading, error: batchError, run: runBatch } = useAsyncAction();

  const [classifyingPairId, setClassifyingPairId] = useState(null);
  const [pairErrors, setPairErrors] = useState({});

  const crystalSystem = useMemo(() => getCrystalSystem(materialId), [materialId]);
  const indexCount = crystalSystem === "hcp" ? 4 : 3;
  const indexLabels = crystalSystem === "hcp" ? ["u", "v", "t", "w"] : ["u", "v", "w"];
  const batchColumns = BATCH_COLUMNS;

  const pairs = stage3?.submittedPairs ?? [];
  const trueLines = stage6?.lines ?? [];

  // Map true line results by pair id
  const trueLinesByPair = useMemo(() => {
    const map = {};
    trueLines.forEach((tl) => {
      const pid = tl.pairId || tl.pair || tl.id;
      if (pid) map[pid] = tl;
    });
    return map;
  }, [trueLines]);

  const classificationsByPair = data?.classificationsByPair ?? {};
  const rows = data?.rows ?? [];

  // Initialize pair Burgers vectors from Step 0 if selectedBurgersVector exists and not yet set
  useEffect(() => {
    if (selectedBurgersVector && Array.isArray(selectedBurgersVector)) {
      pairs.forEach((p) => {
        if (!burgersByPair[p.pairId]) {
          setPairBurgersVector(p.pairId, selectedBurgersVector, "Identified using g·b");
        }
      });
    }
  }, [selectedBurgersVector, pairs, burgersByPair, setPairBurgersVector]);

  function diffImageFor(temImage) {
    return stage2?.zoneAxisByTemImage?.[temImage]?.diffImage ?? null;
  }

  function handleVectorInputChange(pairId, index, value) {
    const current = burgersByPair[pairId] ? [...burgersByPair[pairId]] : new Array(indexCount).fill("");
    current[index] = value;

    // HCP auto-fill helper for t when u and v are numbers
    if (crystalSystem === "hcp" && (index === 0 || index === 1)) {
      const u = Number(index === 0 ? value : current[0]);
      const v = Number(index === 1 ? value : current[1]);
      if (Number.isFinite(u) && Number.isFinite(v)) {
        current[2] = String(-(u + v));
      }
    }

    setPairBurgersVector(pairId, current, "Known Burgers vector entered manually");
    setPairErrors((prev) => ({ ...prev, [pairId]: null }));
  }

  function handleApplyToAll(pairId) {
    const sourceVector = burgersByPair[pairId];
    if (!sourceVector) return;
    const source = burgersSourceByPair[pairId] || "Known Burgers vector entered manually";
    const pairIds = pairs.map((p) => p.pairId);
    setAllPairsBurgersVector(sourceVector, source, pairIds);
  }

  async function handleClassifyPair(pairId) {
    const rawVector = burgersByPair[pairId];
    const validation = validateBurgersVector(rawVector, crystalSystem);
    if (!validation.isValid) {
      setPairErrors((prev) => ({ ...prev, [pairId]: validation.error }));
      return;
    }

    setPairErrors((prev) => ({ ...prev, [pairId]: null }));
    setClassifyingPairId(pairId);

    try {
      const res = await classifyLine(pairId, validation.parsed);
      setPairClassification(pairId, res.classification);
      // Update stage 7 store
      const updatedClassifications = {
        ...(data?.classificationsByPair ?? {}),
        [pairId]: res.classification,
      };
      update({ classificationsByPair: updatedClassifications });
    } catch (err) {
      setPairErrors((prev) => ({ ...prev, [pairId]: err.message || "Classification failed." }));
    } finally {
      setClassifyingPairId(null);
    }
  }

  async function handleGenerate() {
    const batchPairs = pairs.map((p) => {
      const rawVector = burgersByPair[p.pairId];
      const validation = validateBurgersVector(rawVector, crystalSystem);
      return {
        pair_id: p.pairId,
        gvecs_image1: diffImageFor(p.image1),
        gvecs_image2: diffImageFor(p.image2),
        burgers: validation.isValid ? validation.parsed : null,
      };
    });

    const res = await runBatch(() => fetchBatchResults(batchPairs, selectedBurgersVector));
    if (res === undefined) return;
    update({ rows: res?.rows ?? [] });
    onComplete?.(res);
  }

  function handleExport() {
    if (!rows.length) return;
    const filename = "dislocation_batch_output.csv";
    exportBatchAsCsv(rows, filename);
    const exportedAt = new Date().toISOString();
    update({ lastExportedAt: exportedAt });
    appendExportRecord({ id: `export_${Date.now()}`, filename, rowCount: rows.length, exportedAt });
  }

  if (pairs.length === 0) {
    return <Alert variant="warning">No confirmed line pairs yet — complete Stage 3 first.</Alert>;
  }

  // Check readiness of each pair
  const pairReadiness = pairs.map((p) => {
    const hasTrueLine = Boolean(trueLinesByPair[p.pairId]);
    const vector = burgersByPair[p.pairId];
    const validation = validateBurgersVector(vector, crystalSystem);
    const classification = classificationsByPair[p.pairId];
    const isReady = hasTrueLine && validation.isValid && Boolean(classification);
    return { pair: p, hasTrueLine, validation, classification, isReady };
  });

  const allPairsReady = pairReadiness.length > 0 && pairReadiness.every((r) => r.isReady);
  const readyCount = pairReadiness.filter((r) => r.isReady).length;

  return (
    <div className="space-y-8">
      <StaleResultsNotice isStale={isStale} upstreamStaleIds={upstreamStaleIds} />

      {/* ── Per-Pair Classification Section ── */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-ink">
              Dislocation Pair Classification ({pairs.length} pair{pairs.length === 1 ? "" : "s"})
            </h3>
            <p className="text-xs text-muted">
              Enter or review the Burgers vector for each reconstructed dislocation pair to determine its dislocation character, slip plane, and slip system.
            </p>
          </div>
          <div className="text-xs font-medium text-muted">
            Crystal structure: <span className="font-semibold text-beam-700 uppercase">{crystalSystem}</span>
            {crystalSystem === "hcp" ? " (4-index Miller–Bravais [u v t w])" : " (3-index [u v w])"}
          </div>
        </div>

        <div className="grid gap-4">
          {pairs.map((p) => {
            const tl = trueLinesByPair[p.pairId];
            const hasTrueLine = Boolean(tl);
            const rawVector = burgersByPair[p.pairId] ?? (selectedBurgersVector ? [...selectedBurgersVector] : new Array(indexCount).fill(""));
            const vectorSource = burgersSourceByPair[p.pairId] || (selectedBurgersVector ? "Identified using g·b" : "Known Burgers vector entered manually");
            const classification = classificationsByPair[p.pairId];
            const err = pairErrors[p.pairId];
            const isClassifying = classifyingPairId === p.pairId;

            return (
              <div
                key={p.pairId}
                className="rounded-xl border border-line bg-surface p-5 shadow-sm transition-all hover:border-beam-300"
              >
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-3">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="rounded-md bg-beam-100 px-2 py-0.5 text-xs font-bold text-beam-800">
                        {p.pairId}
                      </span>
                      <span className="text-sm font-semibold text-ink">
                        Line Pair {p.pairId}
                      </span>
                      <span className="text-xs text-muted">
                        ({p.image1} ↔ {p.image2})
                      </span>
                    </div>
                  </div>

                  {/* Burgers vector source badge */}
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        vectorSource === "Identified using g·b"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : "bg-blue-50 text-blue-700 border border-blue-200"
                      }`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {vectorSource}
                    </span>
                  </div>
                </div>

                {/* Grid for True Line, Vector Input, and Classification */}
                <div className="mt-4 grid gap-6 md:grid-cols-3">
                  {/* Column 1: True Line Direction */}
                  <div className="space-y-2 rounded-lg bg-surfaceAlt/50 p-3 text-xs border border-line/60">
                    <p className="font-semibold uppercase tracking-wider text-muted text-[11px]">
                      Reconstructed True Line (u<sub>T</sub>)
                    </p>
                    {hasTrueLine ? (
                      <div className="space-y-1.5">
                        <div className="flex justify-between">
                          <span className="text-muted">Miller direction:</span>
                          <strong className="font-mono text-ink">{formatVectorDisplay(tl.uMiller || tl.direction)}</strong>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted">Normalized Cartesian:</span>
                          <span className="font-mono text-ink">{formatNormDisplay(tl.uNorm)}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-amber-700 bg-amber-50 rounded p-2 text-xs">
                        True line not yet reconstructed. Complete Stage 6 first.
                      </div>
                    )}
                  </div>

                  {/* Column 2: Burgers Vector Input */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold uppercase tracking-wider text-muted text-[11px]">
                        Burgers Vector (b)
                      </label>
                      {pairs.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleApplyToAll(p.pairId)}
                          className="text-[11px] font-medium text-beam-600 hover:text-beam-800 hover:underline"
                          title="Copy this Burgers vector to all other pairs"
                        >
                          Apply to all pairs
                        </button>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-sm text-muted font-bold">[</span>
                      {indexLabels.map((lbl, idx) => (
                        <div key={lbl} className="flex-1 min-w-0">
                          <input
                            type="number"
                            step="any"
                            placeholder={lbl}
                            value={rawVector[idx] ?? ""}
                            onChange={(e) => handleVectorInputChange(p.pairId, idx, e.target.value)}
                            disabled={!hasTrueLine}
                            className="w-full rounded-md border border-line bg-surface px-2 py-1 text-center font-mono text-xs font-medium text-ink placeholder-muted/50 focus:border-beam-500 focus:outline-none focus:ring-1 focus:ring-beam-500 disabled:opacity-50"
                          />
                        </div>
                      ))}
                      <span className="font-mono text-sm text-muted font-bold">]</span>
                    </div>

                    {err && (
                      <p className="text-[11px] font-medium text-rose-600">{err}</p>
                    )}

                    <div className="pt-1">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleClassifyPair(p.pairId)}
                        disabled={!hasTrueLine || isClassifying}
                        loading={isClassifying}
                        className="w-full text-xs"
                      >
                        {classification ? "Recalculate Classification" : "Calculate Classification"}
                      </Button>
                    </div>
                  </div>

                  {/* Column 3: Classification Results */}
                  <div className="space-y-2 rounded-lg bg-surfaceAlt/50 p-3 text-xs border border-line/60">
                    <p className="font-semibold uppercase tracking-wider text-muted text-[11px]">
                      Classification Results
                    </p>
                    {classification ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-muted">Character:</span>
                          <span className="inline-flex items-center gap-1 rounded bg-beam-100 px-2 py-0.5 font-semibold text-beam-800 text-[11px]">
                            {classification.character}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted">∠(u<sub>T</sub>, b):</span>
                          <span className="font-mono text-ink">
                            {typeof classification.ubAngleDeg === "number"
                              ? `${classification.ubAngleDeg.toFixed(2)}°`
                              : `${classification.ubAngleDeg}°`}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted">Slip plane normal:</span>
                          <span className="font-mono text-ink">{classification.slipPlaneNormal || "—"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted">Slip plane:</span>
                          <strong className="font-mono text-ink">{classification.slipPlane || "Undefined"}</strong>
                        </div>
                        {classification.slipPlaneIndexingDeviation != null && (
                          <div className="flex justify-between">
                            <span className="text-muted">Indexing deviation:</span>
                            <span className="font-mono text-ink">
                              {Number(classification.slipPlaneIndexingDeviation).toFixed(4)}°
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-muted">Slip system:</span>
                          <strong className="font-mono text-beam-700">{classification.slipSystem || "Undefined"}</strong>
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-20 items-center justify-center text-center text-xs text-muted">
                        Enter Burgers vector and click &ldquo;Calculate Classification&rdquo;.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Batch Report Generation Section ── */}
      <section className="space-y-4 pt-4 border-t border-line">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-ink">Batch Output Report</h3>
            <p className="text-xs text-muted">
              Generate the unified batch summary containing all trace reconstructions, Burgers vectors, dislocation characters, and indexed slip systems.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleGenerate}
              loading={batchLoading}
              disabled={!allPairsReady || upstreamStaleIds.length > 0}
            >
              Generate batch report ({readyCount} of {pairs.length} ready)
            </Button>
            <Button variant="secondary" onClick={handleExport} disabled={rows.length === 0}>
              Download CSV
            </Button>
          </div>
        </div>

        {!allPairsReady && (
          <Alert variant="info">
            To generate the batch report, ensure all {pairs.length} dislocation pair(s) have a reconstructed true line direction (&mathbf;u<sub>T</sub>), a valid Burgers vector, and a completed classification.
          </Alert>
        )}


        <Alert variant="error" message={batchError} onRetry={handleGenerate} />

        <DataTable columns={batchColumns} rows={rows.length > 0 ? rows : null} emptyLabel="No batch data generated yet. Complete pair classifications and click 'Generate batch report'." />
      </section>
    </div>
  );
}
