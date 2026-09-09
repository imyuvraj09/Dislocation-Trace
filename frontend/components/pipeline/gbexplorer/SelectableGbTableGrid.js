import { useCallback, useRef } from "react";

/**
 * SelectableGbTableGrid
 *
 * An interactive version of the Dataset Table that supports selecting multiple rows:
 *   - Click        → toggle row selection (select 1 or more rows)
 *   - Shift+Click  → range select rows
 *
 * Selected rows are visually distinguished:
 *   - Blue left border accent (3px beam-500)
 *   - Light blue background (beam-50)
 *   - Leading ✓ checkmark column in beam-700
 *
 * Props:
 *   gVectors        string[]    - row labels
 *   bCols           string[]    - column labels (Burgers vectors)
 *   values          number[][]  - g·b value matrix
 *   highlight       boolean     - whether to highlight g·b = 0 cells
 *   selectedGVectors string[]   - currently selected g-vector labels
 *   onSelectionChange (next: string[]) => void
 */
export default function SelectableGbTableGrid({
  gVectors,
  bCols,
  values,
  highlight,
  selectedGVectors = [],
  onSelectionChange,
}) {
  const lastClickedIndexRef = useRef(null);
  const selectedSet = new Set(selectedGVectors);

  const handleRowClick = useCallback(
    (e, g, rowIndex) => {
      e.preventDefault();
      const isSelected = selectedSet.has(g);

      if (e.shiftKey && lastClickedIndexRef.current !== null) {
        // Range select
        const lo = Math.min(lastClickedIndexRef.current, rowIndex);
        const hi = Math.max(lastClickedIndexRef.current, rowIndex);
        const rangeGs = gVectors.slice(lo, hi + 1);
        const next = Array.from(new Set([...selectedGVectors, ...rangeGs]));
        onSelectionChange(next);
        return;
      }

      // Click to toggle row selection (select one or multiple rows)
      const next = isSelected
        ? selectedGVectors.filter((v) => v !== g)
        : [...selectedGVectors, g];
      onSelectionChange(next);
      lastClickedIndexRef.current = rowIndex;
    },
    [selectedGVectors, selectedSet, gVectors, onSelectionChange]
  );

  if (gVectors.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-line bg-surfaceAlt px-4 py-8 text-center text-sm text-subtle">
        No rows match.
      </div>
    );
  }

  return (
    <div className="max-h-[480px] overflow-auto rounded-md border border-line scroll-thin">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10">
          <tr className="bg-surfaceAlt text-left text-xs uppercase tracking-wide text-subtle">
            {/* Check column */}
            <th className="w-8 px-2 py-2 font-medium" aria-label="Selection" />
            <th className="px-3 py-2 font-medium">g \ b</th>
            {bCols.map((b) => (
              <th key={b} className="whitespace-nowrap px-3 py-2 font-mono font-medium">
                {b}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {gVectors.map((g, i) => {
            const isSelected = selectedSet.has(g);
            return (
              <tr
                key={g}
                onClick={(e) => handleRowClick(e, g, i)}
                title="Click to select/toggle row (select multiple rows to find common invisible Burgers vectors)"
                className={[
                  "border-t border-line cursor-pointer transition-colors duration-100 select-none",
                  "hover:bg-surfaceAlt",
                  isSelected
                    ? "bg-beam-50 border-l-[3px] border-l-beam-500 hover:bg-beam-100"
                    : "border-l-[3px] border-l-transparent",
                ].join(" ")}
                style={{ borderLeftWidth: "3px" }}
              >
                {/* Checkmark cell */}
                <td className="w-8 px-2 py-2 text-center">
                  {isSelected ? (
                    <span
                      className="inline-flex items-center justify-center text-beam-700 font-bold text-sm"
                      style={{ animation: "gbRowCheck 140ms ease-out" }}
                    >
                      ✓
                    </span>
                  ) : (
                    <span className="inline-block w-4 h-4 rounded border border-line bg-surface" />
                  )}
                </td>

                {/* g-vector label */}
                <td
                  className={[
                    "whitespace-nowrap px-3 py-2 font-mono text-[13px]",
                    isSelected ? "text-beam-700 font-semibold" : "text-ink",
                  ].join(" ")}
                >
                  {g}
                </td>

                {/* g·b value cells */}
                {bCols.map((_, j) => {
                  const v = values[i][j];
                  const isZero = highlight && v === 0;
                  return (
                    <td
                      key={j}
                      className={[
                        "whitespace-nowrap px-3 py-2 text-center font-mono text-[13px]",
                        isZero
                          ? isSelected
                            ? "bg-beam-100 text-beam-700 font-semibold"
                            : "bg-beam-50 text-beam-700 font-semibold"
                          : isSelected
                          ? "text-beam-700"
                          : "text-ink",
                      ].join(" ")}
                    >
                      {v}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Inline keyframes via a style tag — avoids needing tailwind plugin for custom animations */}
      <style jsx global>{`
        @keyframes gbRowCheck {
          0% { transform: scale(0.5); opacity: 0; }
          60% { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes gbResultIn {
          0% { opacity: 0; transform: scale(0.92) translateY(4px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes gbConnectorPulse {
          0%, 100% { opacity: 0.3; transform: scaleX(0.95); }
          50% { opacity: 0.7; transform: scaleX(1); }
        }
      `}</style>
    </div>
  );
}
