import { useEffect, useState } from "react";
import Alert from "@/components/ui/Alert";
import useProjectStore from "@/store/projectStore";
import { fetchMaterials } from "@/lib/api";
import { useAsyncAction } from "@/hooks/useAsyncAction";

/**
 * Project-level material selection -- NOT a pipeline stage (see the
 * integration plan: "material selection as a lightweight project-level
 * setting"). Sets project.material.id, which Stage 7 needs to know which
 * crystallographically-allowed Burgers-vector family to solve candidate
 * vectors against (backend/crystallography, reused from the g.b project).
 *
 * Backed entirely by GET /api/materials -- this component never hardcodes
 * a crystal-structure list itself.
 */
export default function MaterialSelector() {
  const materialId = useProjectStore((state) => state.project.material?.id ?? null);
  const cOverA = useProjectStore((state) => state.project.material?.cOverA ?? null);
  const setMaterial = useProjectStore((state) => state.setMaterial);
  const setCOverA = useProjectStore((state) => state.setCOverA);
  const [materials, setMaterials] = useState([]);
  const { loading, error, run } = useAsyncAction();

  useEffect(() => {
    run(() => fetchMaterials()).then((list) => {
      if (list) setMaterials(list);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetch once on mount
  }, []);

  const selectedMaterial = materials.find((m) => m.id === materialId) ?? null;
  const needsCOverA = Boolean(selectedMaterial?.requiresCOverA);

  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor="material-select" className="text-sm font-medium text-ink">
          Material / crystal structure
        </label>
        <select
          id="material-select"
          value={materialId ?? ""}
          onChange={(e) => setMaterial(e.target.value || null)}
          disabled={loading}
          className="min-w-[240px] rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink focus:border-beam-500 focus:outline-none"
        >
          <option value="">Select a material…</option>
          {materials.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        {needsCOverA && (
          <label className="flex items-center gap-2 text-sm text-muted">
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
              placeholder={selectedMaterial?.crystalSystem === "hcp" ? "e.g. 1.633" : "Enter c/a"}
              aria-label="Lattice c over a ratio"
              className="w-28 rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-sm text-ink focus:border-beam-500 focus:outline-none"
            />
          </label>
        )}
        {!materialId && (
          <span className="text-xs text-subtle">
            Required before Stage 7 can resolve candidate Burgers vectors from g.b observations.
          </span>
        )}
        {needsCOverA && (!(Number(cOverA) > 0) || !Number.isFinite(Number(cOverA))) && (
          <span className="text-xs text-warn">
            A finite positive c/a ratio is required before trace calculation.
          </span>
        )}
      </div>
      <Alert variant="error" message={error} onRetry={() => run(() => fetchMaterials()).then((l) => l && setMaterials(l))} className="mt-2" />
    </div>
  );
}
