import { useMemo, useState } from "react";
import Button from "@/components/ui/Button";
import Alert from "@/components/ui/Alert";
import StaleResultsNotice from "@/components/pipeline/StaleResultsNotice";
import useStage from "@/hooks/useStage";
import useProjectStore from "@/store/projectStore";
import { submitGbObservations, selectBurgersCandidate, classifyLine } from "@/lib/api";

const GB_OPTIONS = [
  { value: 1, label: "+1" },
  { value: 0, label: "0" },
  { value: -1, label: "\u22121" },
];

const CHARACTER_STYLES = {
  Screw: "bg-zone-500/10 text-zone-600",
  "Mixed-Screw-Dominant": "bg-zone-500/10 text-zone-600",
  "Mixed-Edge-Dominant": "bg-beam-50 text-beam-700",
  Edge: "bg-beam-50 text-beam-700",
  "Screw Dominant": "bg-zone-500/10 text-zone-600",
  "Edge Dominant": "bg-beam-50 text-beam-700",
  Mixed: "bg-warn/10 text-warn",
};

function rowKey(o) {
  return `${o.imageId}::${o.gVectorId}`;
}

/**
 * Auto-generates this pair's observation rows -- one per (image, selected
 * g-vector), sourced entirely from earlier stages (Stage 3's pairing,
 * Stage 4's g-vector selections, Stage 2's Miller indexing). Nothing here
 * is user-typed; the only thing the UI collects for these rows is `gb`.
 */
function generateRowsForPair(pair, selections, millerIndexByGvector) {
  const rows = [];
  for (const sel of selections.filter((s) => s.pairId === pair.pairId)) {
    for (const gId of sel.gIds ?? []) {
      const hklStrings = millerIndexByGvector?.[sel.diffImage]?.[gId];
      if (!hklStrings) continue; // not yet Miller-indexed in Stage 2 -- can't generate this row yet
      rows.push({
        imageId: sel.image,
        gVectorId: gId,
        millerIndex: hklStrings.map((v) => Number.parseInt(v, 10)),
        gb: null,
        notes: "",
      });
    }
  }
  return rows;
}

/** Carries over any g.b already recorded for a row from the persisted record. */
function mergeWithPersisted(generatedRows, persistedObservations) {
  const persistedByKey = new Map((persistedObservations ?? []).map((o) => [rowKey(o), o]));
  return generatedRows.map((r) => {
    const existing = persistedByKey.get(rowKey(r));
    return existing ? { ...r, gb: existing.gb, notes: existing.notes } : r;
  });
}

function emptyRecord(pairId, observations) {
  return {
    pairId,
    observations,
    candidateBurgersVectors: [],
    resolvedBurgersVector: null,
    mathDerivation: "",
    classification: null,
  };
}

/**
 * Stage 7 -- experimental g.b observations + classification using the
 * globally selected Burgers vector from g·b Explorer.
 */
export default function Stage8Classification({ onComplete }) {
  const stage2 = useStage(2).data;
  const stage3 = useStage(3).data;
  const stage4 = useStage(4).data;
  const { data, update, isStale, upstreamStaleIds } = useStage(7);
  const materialId = useProjectStore((state) => state.project.material?.id ?? null);
  const selectedBurgersVector = useProjectStore((state) => state.project.material?.selectedBurgersVector ?? null);

  const [pairLoading, setPairLoading] = useState({});
  const [pairError, setPairError] = useState({});

  const pairs = stage3.submittedPairs ?? [];

  const recordsByPairId = useMemo(() => {
    const map = {};
    for (const pair of pairs) {
      const generated = generateRowsForPair(pair, stage4.selections ?? [], stage2.millerIndexByGvector ?? {});
      const persisted = data.gbObservations.find((r) => r.pairId === pair.pairId);
      const merged = mergeWithPersisted(generated, persisted?.observations);
      map[pair.pairId] = persisted
        ? { ...persisted, observations: merged, resolvedBurgersVector: selectedBurgersVector || persisted.resolvedBurgersVector }
        : { ...emptyRecord(pair.pairId, merged), resolvedBurgersVector: selectedBurgersVector };
    }
    return map;
  }, [pairs, stage4.selections, stage2.millerIndexByGvector, data.gbObservations, selectedBurgersVector]);

  function replacePairRecord(pairId, nextRecord) {
    const others = data.gbObservations.filter((r) => r.pairId !== pairId);
    update({ gbObservations: [...others, nextRecord] });
  }

  function allPairsResolved(updatedPairId, updatedRecord) {
    return pairs.every((p) => {
      const rec = p.pairId === updatedPairId ? updatedRecord : recordsByPairId[p.pairId];
      return Boolean(rec?.resolvedBurgersVector || selectedBurgersVector);
    });
  }

  function setRowGb(pairId, key, gbValue) {
    const record = recordsByPairId[pairId];
    const observations = record.observations.map((o) => (rowKey(o) === key ? { ...o, gb: gbValue } : o));
    replacePairRecord(pairId, { ...record, observations });
  }

  async function handleAnalyze(pairId) {
    if (!selectedBurgersVector) return;
    const record = recordsByPairId[pairId];
    setPairError((e) => ({ ...e, [pairId]: null }));
    setPairLoading((l) => ({ ...l, [pairId]: true }));
    try {
      const classifyRes = await classifyLine(pairId, selectedBurgersVector);
      const updatedRecord = {
        ...record,
        resolvedBurgersVector: selectedBurgersVector,
        classification: classifyRes.classification,
      };
      replacePairRecord(pairId, updatedRecord);
      if (allPairsResolved(pairId, updatedRecord)) onComplete?.();
    } catch (err) {
      setPairError((e) => ({ ...e, [pairId]: err?.message || "Failed to analyze classification." }));
    } finally {
      setPairLoading((l) => ({ ...l, [pairId]: false }));
    }
  }

  async function handleConfirmCandidate(pairId, vector) {
    setPairError((e) => ({ ...e, [pairId]: null }));
    setPairLoading((l) => ({ ...l, [pairId]: true }));
    try {
      const result = await selectBurgersCandidate(pairId, vector);
      replacePairRecord(pairId, result);
      if (allPairsResolved(pairId, result)) onComplete?.();
    } catch (err) {
      setPairError((e) => ({ ...e, [pairId]: err?.message || "Failed to confirm candidate." }));
    } finally {
      setPairLoading((l) => ({ ...l, [pairId]: false }));
    }
  }

  function scrollToExplorer() {
    const el = document.getElementById("gb-explorer-section");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="space-y-6">
      {!selectedBurgersVector && (
        <Alert variant="warning" className="font-semibold">
          Please select a common invisible Burgers vector in the g·b Explorer before generating Character, Slip Plane, and Batch Output.
        </Alert>
      )}

      {pairs.length === 0 && (
        <Alert variant="warning">No confirmed line pairs yet -- complete Stage 3 first.</Alert>
      )}

      {pairs.length > 0 && (
        <>
          <StaleResultsNotice isStale={isStale} upstreamStaleIds={upstreamStaleIds} />

          {!materialId && (
            <Alert variant="warning">
              Select a material / crystal structure above before recording g.b observations -- candidate
              Burgers vectors are resolved against that material&apos;s crystallographically-allowed family.
            </Alert>
          )}

          {pairs.map((pair) => {
        const record = recordsByPairId[pair.pairId];
        const rows = record.observations;
        const allRecorded = rows.length > 0 && rows.every((o) => o.gb !== null && o.gb !== undefined);
        const candidates = record.candidateBurgersVectors ?? [];
        const needsConfirmation = allRecorded && !record.resolvedBurgersVector && candidates.length > 1;
        const noValidCandidate = allRecorded && !record.resolvedBurgersVector && candidates.length === 0;
        const showExplorerHint = !record.resolvedBurgersVector;

        return (
          <section key={pair.pairId} className="space-y-3 rounded-lg border border-line p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">Pair {pair.pairId}</h3>
              {record.resolvedBurgersVector && (
                <span className="rounded-full bg-beam-50 px-2.5 py-0.5 text-xs font-medium text-beam-700">
                  b = [{record.resolvedBurgersVector.map((v) => (Number.isInteger(v) ? v : v.toFixed(2))).join(" ")}]
                </span>
              )}
            </div>

            {rows.length === 0 ? (
              <p className="text-sm text-subtle">
                No observation rows yet -- assign g-vectors for this pair in Stage 4 first.
              </p>
            ) : (
              <div className="overflow-hidden rounded-md border border-line">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="bg-surfaceAlt text-left text-xs uppercase tracking-wide text-subtle">
                      <th className="px-3 py-2 font-medium">Image</th>
                      <th className="px-3 py-2 font-medium">g-vector</th>
                      <th className="px-3 py-2 font-medium">Miller index</th>
                      <th className="px-3 py-2 font-medium">Observed g.b</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((o) => (
                      <tr key={rowKey(o)} className="border-t border-line">
                        <td className="px-3 py-2 font-mono text-[13px]">{o.imageId}</td>
                        <td className="px-3 py-2 font-mono text-[13px]">{o.gVectorId}</td>
                        <td className="px-3 py-2 font-mono text-[13px]">[{o.millerIndex.join(" ")}]</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            {GB_OPTIONS.map((opt) => (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => setRowGb(pair.pairId, rowKey(o), opt.value)}
                                className={`rounded-md border px-2.5 py-1 font-mono text-xs transition-colors ${
                                  o.gb === opt.value
                                    ? "border-beam-500 bg-beam-50 text-beam-700"
                                    : "border-line text-muted hover:border-lineStrong"
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center gap-3">
              <Button
                onClick={() => handleAnalyze(pair.pairId)}
                loading={pairLoading[pair.pairId]}
                disabled={!allRecorded || !materialId}
              >
                Analyze observations
              </Button>
              {rows.length > 0 && !allRecorded && (
                <span className="text-xs text-subtle">
                  {rows.filter((o) => o.gb === null || o.gb === undefined).length} row(s) still need g.b recorded.
                </span>
              )}
            </div>

            <Alert variant="error" message={pairError[pair.pairId]} onRetry={() => handleAnalyze(pair.pairId)} />

            {noValidCandidate && (
              <Alert variant="error">
                No crystallographically consistent Burgers vector was found for this material&apos;s allowed
                family. Double-check the recorded observations, or confirm the selected material is
                correct.
              </Alert>
            )}

            {needsConfirmation && (
              <div className="space-y-2 rounded-md border border-warn/30 bg-warn/5 p-3">
                <p className="text-sm text-warn">
                  {candidates.length} candidates are consistent with every recorded observation. Confirm
                  which one is correct -- Dislocation Trace won&apos;t guess.
                </p>
                <div className="flex flex-wrap gap-2">
                  {candidates.map((c) => (
                    <button
                      key={c.label}
                      type="button"
                      onClick={() => handleConfirmCandidate(pair.pairId, c.vector)}
                      className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-mono text-ink hover:border-beam-500 hover:bg-beam-50"
                    >
                      {c.label}
                      {c.status === "Verified" && <span className="ml-1.5 text-xs text-beam-600">✓</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {record.classification && (
              <div className="flex items-center gap-3 rounded-md bg-surfaceAlt px-3 py-2 text-sm">
                <span
                  className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    CHARACTER_STYLES[record.classification.character] ?? "bg-surfaceAlt text-muted"
                  }`}
                >
                  {record.classification.character}
                </span>
                <span className="font-mono text-[13px] text-ink">
                  Slip system {record.classification.slipSystem}
                </span>
              </div>
            )}

            {/* "Open g·b Explorer" button -- shown when Burgers vector is not yet resolved */}
            {showExplorerHint && (
              <button
                type="button"
                onClick={scrollToExplorer}
                className="flex items-center gap-2 rounded-md border border-beam-300 bg-beam-50 px-3 py-2 text-sm font-medium text-beam-700 transition-colors hover:bg-beam-100 hover:border-beam-500"
              >
                <span style={{ fontSize: 14 }}>⬡</span>
                Open g·b Explorer
                <span className="text-beam-400">↑</span>
              </button>
            )}
          </section>
        );
          })}
        </>
      )}
    </div>
  );
}
