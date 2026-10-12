import { useCallback, useEffect, useMemo, useState } from "react";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { fetchGbTable, fetchMaterials } from "@/lib/api";
import {
  buildCsv,
  buildJson,
  buildLatex,
  buildTsv,
  computeMetrics,
  downloadFile,
  findCommonInvisibleVectors,
  formatBurgersVectorForDisplay,
  getFilteredRows,
  getInvisibilityCounts,
  getTruthRows,
  normalizeGVectorInput,
  parseGVector,
  parseVector,
  safeFilename,
  withCustomBurgersVector,
} from "@/lib/gbExplorer";
import useCommonBurgersVectors from "@/hooks/useCommonBurgersVectors";
import useProjectStore from "@/store/projectStore";
import GbMultiSelect from "./GbMultiSelect";
import SelectableGbTableGrid from "./SelectableGbTableGrid";
import CommonBResultCard from "./CommonBResultCard";
import { GbBarChart, GbHeatmap, GbHistogram, GbStackedBar } from "./GbCharts";

const TABS = [
  { id: "common-b", label: "Common b Finder" },
  { id: "dataset", label: "Dataset Table" },
  { id: "truth", label: "Truth Table" },
];

/**
 * g.b Explorer, embedded as a reference panel in Stage 7 (Classification).
 * Ported from the standalone crystal-gb-explorer-main app -- same five
 * tabs (Dataset Table, Search & Filter, Visualize, Truth Table, Common b
 * Finder), same underlying math (g.b = g . b, invisibility at g.b = 0),
 * now reading the full reference table from CrystalTrace's own backend
 * (GET /api/materials/{id}/gb-table -- backend/crystallography, the same
 * database this Explorer's own data/*.json files were ported into) rather
 * than fetching its own JSON files.
 *
 * This panel is a *reference tool* -- it doesn't feed observations back
 * into the pair records above it; it's here so the user can look up
 * g.b = 0 conditions and Burgers-vector families for the selected
 * material without leaving Stage 7.
 */
const FALLBACK_MATERIALS = [
  { id: "FCC_Face_Centered_Cubic", name: "(FCC) Face-Centered Cubic", crystalSystem: "cubic", requiresCOverA: false },
  { id: "BCC_Body_Centered_Cubic", name: "(BCC) Body-Centered Cubic", crystalSystem: "cubic", requiresCOverA: false },
  { id: "B2_Ordered_BCC", name: "(B2) Ordered BCC", crystalSystem: "cubic", requiresCOverA: false },
  { id: "Body_Centered_Tetragonal_I", name: "(BCT) Body-Centered Tetragonal", crystalSystem: "tetragonal", requiresCOverA: true },
  { id: "FCT_Face_Centered_Tetragonal", name: "(FCT) Face-Centered Tetragonal", crystalSystem: "tetragonal", requiresCOverA: true },
  { id: "HCP_Hexagonal_Close_Packed", name: "(HCP) Hexagonal Close-Packed", crystalSystem: "hcp", requiresCOverA: true },
];

export default function GbExplorerPanel({ initialMaterialId }) {
  const selectedBurgersVector = useProjectStore((state) => state.project.material?.selectedBurgersVector ?? null);
  const setSelectedBurgersVector = useProjectStore((state) => state.setSelectedBurgersVector);
  const storeMaterialId = useProjectStore((state) => state.project.material?.id ?? null);
  const cOverA = useProjectStore((state) => state.project.material?.cOverA ?? null);
  const setMaterial = useProjectStore((state) => state.setMaterial);
  const setCOverA = useProjectStore((state) => state.setCOverA);

  const [materials, setMaterials] = useState(FALLBACK_MATERIALS);
  const [materialId, setMaterialId] = useState(storeMaterialId || initialMaterialId || "");
  const [table, setTable] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("common-b");

  // Tab 1 — Dataset Table
  const [highlightZero, setHighlightZero] = useState(true);
  // Interactive row-click selection for common-b computation
  const [selectedGVectors, setSelectedGVectors] = useState([]);

  // Tab 2
  const [gSearch, setGSearch] = useState("");
  const [filterMode, setFilterMode] = useState("all");
  const [customVal, setCustomVal] = useState(0);
  const [bFilter, setBFilter] = useState([]);

  // Tab 3
  const [chartType, setChartType] = useState("heatmap");
  const [vizBSelect, setVizBSelect] = useState([]);
  const [gChoice, setGChoice] = useState("");

  // Tab 4
  const [ttGSearch, setTtGSearch] = useState("");
  const [ttOnlyInvisible, setTtOnlyInvisible] = useState(false);
  const [ttBSelect, setTtBSelect] = useState([]);

  // Tab 5
  const [g1Input, setG1Input] = useState("");
  const [g2Input, setG2Input] = useState("");
  const isHcp = materialId === "HCP_Hexagonal_Close_Packed";
  const selectedMaterial = materials.find((material) => material.id === materialId) ?? null;
  const needsCOverA = Boolean(selectedMaterial?.requiresCOverA ?? table?.requiresCOverA);
  const validCOverA = Number.isFinite(Number(cOverA)) && Number(cOverA) > 0;
  const commonInputCount = isHcp ? 4 : 3;

  useEffect(() => {
    fetchMaterials()
      .then((res) => {
        if (Array.isArray(res) && res.length > 0) {
          setMaterials(res.filter((m) => m.id !== "Simple_Cubic_SC" && m.id !== "Simple_Tetragonal_P"));
        }
      })
      .catch(() => {
        // Fall back to built-in list if API request fails
      });
  }, []);

  useEffect(() => {
    const effective = storeMaterialId || initialMaterialId;
    if (effective) {
      setMaterialId(effective);
    }
  }, [storeMaterialId, initialMaterialId]);

  useEffect(() => {
    if (!materialId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchGbTable(materialId)
      .then((t) => {
        if (cancelled) return;
        setTable(t);
        setBFilter([]);
        setVizBSelect(t.bVectors.slice(0, Math.min(4, t.bVectors.length)));
        setTtBSelect(t.bVectors.slice(0, Math.min(6, t.bVectors.length)));
        setGChoice(t.gVectors[0] ?? "");
        // Clear row selection when material changes
        setSelectedGVectors([]);
        setG1Input("");
        setG2Input("");
      })
      .catch((err) => {
        if (cancelled) return;
        const msg =
          err.message?.includes("Failed to fetch") || err.message?.includes("NetworkError") || err.message?.includes("404")
            ? "Unable to connect to backend server (http://localhost:8000). Please ensure the backend server is running."
            : err.message || "Failed to load material dataset.";
        setError(msg);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [materialId]);



  function handleAddCustomBVector(rawInput) {
    if (!table) return null;
    const { table: nextTable, label } = withCustomBurgersVector(table, rawInput);
    if (label) setTable(nextTable);
    return label;
  }

  const metrics = useMemo(() => (table ? computeMetrics(table) : null), [table]);

  // Live common-b computation from the Dataset Table row-click selection
  const { commonBurgersVectors, count: commonBCount } = useCommonBurgersVectors(table, selectedGVectors);

  const handleSelectionChange = useCallback((next) => {
    setSelectedGVectors(next);
  }, []);

  const filtered = useMemo(
    () => (table ? getFilteredRows(table, { gSearch, filterMode, customVal, bFilter }) : { activeBCols: [], rows: [] }),
    [table, gSearch, filterMode, customVal, bFilter]
  );

  const truth = useMemo(
    () => (table ? getTruthRows(table, { bSubset: ttBSelect, gSearch: ttGSearch, onlyInvisible: ttOnlyInvisible }) : { rows: [] }),
    [table, ttBSelect, ttGSearch, ttOnlyInvisible]
  );

  const commonResults = useMemo(() => {
    if (!table) return null;
    const g1 = parseGVector(g1Input, commonInputCount);
    const g2 = parseGVector(g2Input, commonInputCount);
    if (!g1 || !g2) return null;
    if (isHcp && (g1[2] !== -(g1[0] + g1[1]) || g2[2] !== -(g2[0] + g2[1]))) {
      return { error: "Invalid HCP Miller-Bravais plane: i must equal -(h + k)." };
    }
    try {
      return findCommonInvisibleVectors(table, normalizeGVectorInput(g1), normalizeGVectorInput(g2));
    } catch (err) {
      return { error: err.message };
    }
  }, [table, g1Input, g2Input, commonInputCount, isHcp]);

  if (materials.length === 0 && !materialId) {
    return <Alert variant="info">Loading available crystal structures...</Alert>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-xs font-medium text-muted">Crystal structure</label>
        <select
          value={materialId}
          onChange={(e) => {
            const val = e.target.value;
            setMaterialId(val);
            setMaterial(val || null);
          }}
          className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink focus:border-beam-500 focus:outline-none"
        >
          {!materialId && <option value="">Select a crystal structure…</option>}
          {materials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        {needsCOverA && (
          <label className="flex items-center gap-2 text-xs font-medium text-muted">
            c/a ratio
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
              aria-label="Lattice c over a ratio"
              className="w-28 rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-sm text-ink focus:border-beam-500 focus:outline-none"
            />
          </label>
        )}
        {metrics && (
          <span className="text-xs text-subtle">
            {metrics.nG} g-vectors × {metrics.nB} b-vectors · {metrics.nZero.toLocaleString()} invisible ({metrics.pct}%)
          </span>
        )}
      </div>

      {needsCOverA && !validCOverA && (
        <Alert variant="warning">
          Enter a finite positive c/a ratio for this crystal structure before trace calculation.
        </Alert>
      )}

      {selectedBurgersVector && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-beam-300 bg-beam-50/70 px-4 py-2.5 text-sm text-beam-900 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-beam-500 text-xs font-bold text-white">✓</span>
            <span>
              Selected Burgers vector for pipeline: <strong className="font-mono font-bold text-beam-700">[{selectedBurgersVector.join(" ")}]</strong>
            </span>
          </div>
          <button
            type="button"
            onClick={() => setSelectedBurgersVector(null)}
            className="text-xs font-medium text-beam-700 hover:text-beam-900 underline"
          >
            Clear selection
          </button>
        </div>
      )}

      <Alert variant="error" message={error} onRetry={() => setMaterialId((m) => m)} />

      <div className="flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`rounded-t-md px-3 py-2 text-xs font-medium transition-colors ${
              activeTab === t.id ? "border-b-2 border-beam-500 text-beam-700" : "text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!table && !error && (
        <Alert variant="info">
          {loading ? "Loading dataset…" : "Select a crystal structure to begin."}
        </Alert>
      )}

      {activeTab === "dataset" && table && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-xs text-muted">
                <input type="checkbox" checked={highlightZero} onChange={(e) => setHighlightZero(e.target.checked)} className="accent-beam-500" />
                Highlight g·b = 0 cells
              </label>
              {selectedGVectors.length > 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-beam-50 border border-beam-300 px-2.5 py-0.5 text-xs font-medium text-beam-700">
                  <span className="text-beam-500">✓</span>
                  {selectedGVectors.length} row{selectedGVectors.length !== 1 ? "s" : ""} selected
                  <button
                    type="button"
                    onClick={() => setSelectedGVectors([])}
                    className="ml-0.5 text-beam-500 hover:text-beam-700 font-bold leading-none"
                    aria-label="Clear selection"
                  >
                    ×
                  </button>
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => downloadFile(buildCsv(table.gVectors, table.bVectors, table.values), `${safeFilename(table.name)}_gb_data.csv`, "text/csv;charset=utf-8;")}>
                Export CSV
              </Button>
              <Button variant="secondary" onClick={() => downloadFile(buildTsv(table.gVectors, table.bVectors, table.values), `${safeFilename(table.name)}_gb_data.tsv`, "text/tab-separated-values;charset=utf-8;")}>
                Export Excel (TSV)
              </Button>
              <Button variant="secondary" onClick={() => downloadFile(buildJson(table.name, table.gVectors, table.bVectors, table.values), `${safeFilename(table.name)}_gb_data.json`, "application/json;charset=utf-8;")}>
                Export JSON
              </Button>
              <Button
                variant="secondary"
                onClick={() =>
                  downloadFile(
                    buildLatex(`g\u00b7b Products for ${table.name}`, ["g \\ b", ...table.bVectors], table.gVectors.map((g, i) => [g, ...table.values[i]])),
                    `${safeFilename(table.name)}_gb_table.tex`,
                    "text/plain;charset=utf-8;"
                  )
                }
              >
                Export LaTeX
              </Button>
            </div>
          </div>

          {/* Hint text for first-time use */}
          {selectedGVectors.length === 0 && (
            <p className="text-[11px] text-subtle italic">
              💡 Click rows to select them. Select multiple rows to find their common invisible Burgers vectors.
            </p>
          )}

          <SelectableGbTableGrid
            gVectors={table.gVectors}
            bCols={table.bVectors}
            values={table.values}
            highlight={highlightZero}
            selectedGVectors={selectedGVectors}
            onSelectionChange={handleSelectionChange}
          />

          {/* Live common-b result card — appears as soon as any row is selected */}
          {selectedGVectors.length > 0 && (
            <CommonBResultCard
              selectedGVectors={selectedGVectors}
              commonBurgersVectors={commonBurgersVectors}
              count={commonBCount}
            />
          )}
        </div>
      )}

      {activeTab === "search" && table && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Search g-vector</label>
              <input
                type="text"
                value={gSearch}
                onChange={(e) => setGSearch(e.target.value)}
                placeholder="e.g. 1 1 1"
                className="w-full rounded-md border border-line px-2.5 py-1.5 text-sm focus:border-beam-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">g·b filter</label>
              <select
                value={filterMode}
                onChange={(e) => setFilterMode(e.target.value)}
                className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm focus:border-beam-500 focus:outline-none"
              >
                <option value="all">All values</option>
                <option value="zero">Invisible only (g·b = 0)</option>
                <option value="nonzero">Visible only (g·b ≠ 0)</option>
                <option value="custom">Custom value…</option>
              </select>
            </div>
            {filterMode === "custom" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Custom g·b value</label>
                <input
                  type="number"
                  value={customVal}
                  onChange={(e) => setCustomVal(Number.parseFloat(e.target.value) || 0)}
                  className="w-full rounded-md border border-line px-2.5 py-1.5 text-sm focus:border-beam-500 focus:outline-none"
                />
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">b-vectors (columns)</label>
              <GbMultiSelect options={table.bVectors} selected={bFilter} onChange={setBFilter} onAddCustom={handleAddCustomBVector} />
            </div>
          </div>

          <p className="text-xs text-subtle">
            <strong className="text-ink">{filtered.rows.length}</strong> rows match your filters
          </p>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => downloadFile(buildCsv(filtered.rows.map((r) => r.g), filtered.activeBCols, filtered.rows.map((r) => r.values)), `${safeFilename(table.name)}_filtered.csv`, "text/csv;charset=utf-8;")}>
              Export CSV
            </Button>
            <Button variant="secondary" onClick={() => downloadFile(buildTsv(filtered.rows.map((r) => r.g), filtered.activeBCols, filtered.rows.map((r) => r.values)), `${safeFilename(table.name)}_filtered.tsv`, "text/tab-separated-values;charset=utf-8;")}>
              Export Excel (TSV)
            </Button>
            <Button variant="secondary" onClick={() => downloadFile(buildJson(table.name, filtered.rows.map((r) => r.g), filtered.activeBCols, filtered.rows.map((r) => r.values)), `${safeFilename(table.name)}_filtered.json`, "application/json;charset=utf-8;")}>
              Export JSON
            </Button>
          </div>

          <GbTableGrid gVectors={filtered.rows.map((r) => r.g)} bCols={filtered.activeBCols} values={filtered.rows.map((r) => r.values)} highlight />
        </div>
      )}

      {activeTab === "visualize" && table && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Chart type</label>
              <div className="flex gap-3">
                {[
                  { v: "heatmap", label: "Heatmap" },
                  { v: "bar", label: "Bar (single g)" },
                  { v: "distribution", label: "Distribution" },
                ].map((opt) => (
                  <label key={opt.v} className="flex items-center gap-1.5 text-xs text-muted">
                    <input type="radio" name="chartType" checked={chartType === opt.v} onChange={() => setChartType(opt.v)} className="accent-beam-500" />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="min-w-[220px]">
              <label className="mb-1 block text-xs font-medium text-muted">b-vectors</label>
              <GbMultiSelect options={table.bVectors} selected={vizBSelect} onChange={setVizBSelect} onAddCustom={handleAddCustomBVector} />
            </div>
            {chartType === "bar" && (
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">g-vector</label>
                <select value={gChoice} onChange={(e) => setGChoice(e.target.value)} className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm focus:border-beam-500 focus:outline-none">
                  {table.gVectors.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {vizBSelect.length === 0 ? (
            <Alert variant="info">Select at least one Burgers vector.</Alert>
          ) : chartType === "heatmap" ? (
            <GbHeatmap gVectors={table.gVectors} bCols={vizBSelect} values={table.values.map((row) => vizBSelect.map((b) => row[table.bVectors.indexOf(b)]))} />
          ) : chartType === "bar" ? (
            (() => {
              const gi = table.gVectors.indexOf(gChoice);
              const vals = vizBSelect.map((b) => table.values[gi]?.[table.bVectors.indexOf(b)] ?? 0);
              return <GbBarChart labels={vizBSelect} values={vals} title={`g·b for g = ${gChoice}`} />;
            })()
          ) : (
            <GbHistogram values={table.values.flatMap((row) => vizBSelect.map((b) => row[table.bVectors.indexOf(b)]))} />
          )}
        </div>
      )}

      {activeTab === "truth" && table && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">Search g-vector</label>
              <input
                type="text"
                value={ttGSearch}
                onChange={(e) => setTtGSearch(e.target.value)}
                className="w-full rounded-md border border-line px-2.5 py-1.5 text-sm focus:border-beam-500 focus:outline-none"
              />
            </div>
            <label className="mt-5 flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={ttOnlyInvisible} onChange={(e) => setTtOnlyInvisible(e.target.checked)} className="accent-beam-500" />
              Only rows with at least one invisible b
            </label>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">b-vectors</label>
              <GbMultiSelect options={table.bVectors} selected={ttBSelect} onChange={setTtBSelect} onAddCustom={handleAddCustomBVector} />
            </div>
          </div>

          {ttBSelect.length === 0 ? (
            <Alert variant="info">Select at least one Burgers vector.</Alert>
          ) : (
            <>
              <Button
                variant="secondary"
                onClick={() => {
                  const header = ["g \\ b", ...ttBSelect].join(",");
                  const rows = truth.rows.map((r) => [r.g, ...r.booleans.map((b) => (b ? "✓" : "✗"))].join(","));
                  downloadFile([header, ...rows].join("\n"), `${safeFilename(table.name)}_truth_table.csv`, "text/csv;charset=utf-8;");
                }}
              >
                Export CSV
              </Button>
              <div className="overflow-x-auto scroll-thin rounded-md border border-line">
                <table className="w-full border-collapse text-sm min-w-[280px]">
                  <thead>
                    <tr className="bg-surfaceAlt text-left text-xs uppercase tracking-wide text-subtle">
                      <th className="px-3 py-2 font-medium">g \ b</th>
                      {ttBSelect.map((b) => (
                        <th key={b} className="px-3 py-2 font-mono font-medium">
                          {b}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {truth.rows.map((row) => (
                      <tr key={row.g} className="border-t border-line">
                        <td className="px-3 py-2 font-mono text-[13px]">{row.g}</td>
                        {row.booleans.map((isZero, j) => (
                          <td key={j} className={`px-3 py-2 text-center ${isZero ? "text-ok" : "text-err"}`}>
                            {isZero ? "✓" : "✗"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(() => {
                const { invCounts, visCounts } = getInvisibilityCounts(table, ttBSelect);
                return <GbStackedBar labels={ttBSelect} invCounts={invCounts} visCounts={visCounts} />;
              })()}
            </>
          )}
        </div>
      )}

      {activeTab === "common-b" && table && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">g₁ vector</label>
              <input
                type="text"
                value={g1Input}
                onChange={(e) => setG1Input(e.target.value)}
                placeholder={isHcp ? "e.g. 1 0 -1 0" : "e.g. 1 -1 1"}
                className="w-full rounded-md border border-line px-2.5 py-1.5 text-sm font-mono focus:border-beam-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted">g₂ vector</label>
              <input
                type="text"
                value={g2Input}
                onChange={(e) => setG2Input(e.target.value)}
                placeholder={isHcp ? "e.g. 0 1 -1 0" : "e.g. 0 2 0"}
                className="w-full rounded-md border border-line px-2.5 py-1.5 text-sm font-mono focus:border-beam-500 focus:outline-none"
              />
            </div>
          </div>

          {loading && <Alert variant="info">Loading dataset…</Alert>}

          {!loading && commonResults && commonResults.error && <Alert variant="error">{commonResults.error}</Alert>}

          {!loading && commonResults && !commonResults.error && (
            <div className="space-y-2">
              <p className="text-xs text-subtle">
                <strong className="text-ink">{commonResults.length}</strong> Burgers vector(s) satisfy both diffraction conditions simultaneously.
              </p>
              {commonResults.length > 0 && (
                <>
                  {/* Single-selection radio button control */}
                  <div className="my-3 rounded-lg border border-beam-200 bg-beam-50/50 p-3">
                    <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-beam-700">
                      Select ONE common invisible Burgers vector to use for the pipeline:
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {commonResults.map((r) => {
                        const parsedVec = parseVector(r.bStr);
                        const isSelected =
                          selectedBurgersVector &&
                          parsedVec &&
                          selectedBurgersVector.length === parsedVec.length &&
                          selectedBurgersVector.every((v, i) => v === parsedVec[i]);

                        return (
                          <label
                            key={`radio-${r.bStr}`}
                            className={`flex items-center gap-2.5 rounded-lg border p-2.5 cursor-pointer transition-all ${
                              isSelected
                                ? "border-beam-500 bg-surface ring-2 ring-beam-500/20 shadow-sm text-beam-700"
                                : "border-line bg-surface hover:border-lineStrong text-ink"
                            }`}
                          >
                            <input
                              type="radio"
                              name="selectedBurgersVector"
                              checked={Boolean(isSelected)}
                              onChange={() => parsedVec && setSelectedBurgersVector(parsedVec)}
                              className="h-4 w-4 accent-beam-500 cursor-pointer"
                            />
                            <span className="font-mono text-sm font-semibold">
                              {formatBurgersVectorForDisplay(r.bStr)}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        const header = "Burgers vector (b),g1.b,g2.b\n";
                        const rows = commonResults.map((r) => `"${formatBurgersVectorForDisplay(r.bStr)}",${r.val1},${r.val2}`).join("\n");
                        navigator.clipboard?.writeText(header + rows);
                      }}
                    >
                      Copy results
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        const header = "Burgers vector (b),g1.b,g2.b\n";
                        const rows = commonResults.map((r) => `"${formatBurgersVectorForDisplay(r.bStr)}",${r.val1},${r.val2}`).join("\n");
                        downloadFile(header + rows, "common_invisible_burgers_vectors.csv", "text/csv;charset=utf-8;");
                      }}
                    >
                      Export CSV
                    </Button>
                  </div>
                  <div className="overflow-x-auto scroll-thin rounded-md border border-line">
                    <table className="w-full border-collapse text-sm min-w-[320px]">
                      <thead>
                        <tr className="bg-surfaceAlt text-left text-xs uppercase tracking-wide text-subtle">
                          <th className="px-3 py-2 w-12 text-center font-medium">Select</th>
                          <th className="px-3 py-2 font-medium">Burgers vector (b)</th>
                          <th className="px-3 py-2 text-center font-medium">g₁·b</th>
                          <th className="px-3 py-2 text-center font-medium">g₂·b</th>
                        </tr>
                      </thead>
                      <tbody>
                        {commonResults.map((r) => {
                          const parsedVec = parseVector(r.bStr);
                          const isSelected =
                            selectedBurgersVector &&
                            parsedVec &&
                            selectedBurgersVector.length === parsedVec.length &&
                            selectedBurgersVector.every((v, i) => v === parsedVec[i]);

                          return (
                            <tr key={r.bStr} className={`border-t border-line ${isSelected ? "bg-beam-50/40" : ""}`}>
                              <td className="px-3 py-2 text-center">
                                <input
                                  type="radio"
                                  name="tableBurgersVector"
                                  checked={Boolean(isSelected)}
                                  onChange={() => parsedVec && setSelectedBurgersVector(parsedVec)}
                                  className="h-4 w-4 accent-beam-500 cursor-pointer"
                                />
                              </td>
                              <td className="px-3 py-2 font-mono text-[13px] font-semibold">{formatBurgersVectorForDisplay(r.bStr)}</td>
                              <td className="px-3 py-2 text-center">{r.val1}</td>
                              <td className="px-3 py-2 text-center">{r.val2}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {!loading && !commonResults && (g1Input || g2Input) && (
            <Alert variant="warning">
              Enter {commonInputCount} space-separated indices for each g-vector
              {isHcp ? " in (h k i l) notation, with i = -(h + k)" : " in (h k l) notation"}.
            </Alert>
          )}
        </div>
      )}
    </div>
  );
}

function GbTableGrid({ gVectors, bCols, values, highlight }) {
  if (gVectors.length === 0) {
    return <div className="rounded-lg border border-dashed border-line bg-surfaceAlt px-4 py-8 text-center text-sm text-subtle">No rows match.</div>;
  }
  return (
    <div className="max-h-[480px] overflow-auto rounded-md border border-line scroll-thin">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0">
          <tr className="bg-surfaceAlt text-left text-xs uppercase tracking-wide text-subtle">
            <th className="px-3 py-2 font-medium">g \ b</th>
            {bCols.map((b) => (
              <th key={b} className="whitespace-nowrap px-3 py-2 font-mono font-medium">
                {b}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {gVectors.map((g, i) => (
            <tr key={g} className="border-t border-line">
              <td className="whitespace-nowrap px-3 py-2 font-mono text-[13px]">{g}</td>
              {bCols.map((_, j) => {
                const v = values[i][j];
                const isZero = highlight && v === 0;
                return (
                  <td key={j} className={`whitespace-nowrap px-3 py-2 text-center font-mono text-[13px] ${isZero ? "bg-beam-50 text-beam-700 font-semibold" : "text-ink"}`}>
                    {v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
