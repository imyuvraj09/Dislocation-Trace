import { useEffect, useRef, useState } from "react";
import { formatBurgersVectorForDisplay } from "@/lib/gbExplorer";

/**
 * CommonBResultCard
 *
 * Live result card rendered below the Dataset Table when at least one
 * g-vector row is selected. Shows the intersection of invisible Burgers
 * vectors (g·b = 0 for ALL selected g-vectors simultaneously).
 *
 * Features:
 *  - Fade+scale entry animation for each new result item (staggered).
 *  - Fade-out on removal via an "exiting" state.
 *  - Warning state when no common vector exists.
 *  - Subtle animated connector line connecting the table to this card.
 *
 * Props:
 *   selectedGVectors      string[]                             - labels of currently-selected rows
 *   commonBurgersVectors  { bStr: string, gbValues: number[] }[] - result from useCommonBurgersVectors
 *   count                 number
 */
export default function CommonBResultCard({
  selectedGVectors,
  commonBurgersVectors,
  count,
}) {
  // Animated connector: show pulsing line only when ≥2 g-vectors are selected
  const showConnector = selectedGVectors.length >= 2;

  // Track which b-vector items are "entering" for stagger animation
  const prevBStrsRef = useRef([]);
  const [animatingIn, setAnimatingIn] = useState(new Set());

  useEffect(() => {
    const prevSet = new Set(prevBStrsRef.current);
    const newItems = commonBurgersVectors
      .filter((r) => !prevSet.has(r.bStr))
      .map((r) => r.bStr);

    if (newItems.length > 0) {
      setAnimatingIn(new Set(newItems));
      const t = setTimeout(
        () => setAnimatingIn(new Set()),
        150 + newItems.length * 50 + 200 // wait until all stagger timers finish
      );
      prevBStrsRef.current = commonBurgersVectors.map((r) => r.bStr);
      return () => clearTimeout(t);
    }

    prevBStrsRef.current = commonBurgersVectors.map((r) => r.bStr);
  }, [commonBurgersVectors]);

  return (
    <div className="mt-2 space-y-1">
      {/* ── Animated connector ───────────────────────────────────────────── */}
      <div
        className="flex items-center gap-2 px-1"
        style={{ minHeight: 24 }}
        aria-hidden="true"
      >
        <div
          className="flex-1 rounded-full"
          style={{
            height: 2,
            background: showConnector
              ? "linear-gradient(90deg, #12938A 0%, #3768D6 100%)"
              : "#E1E5EA",
            animation: showConnector
              ? "gbConnectorPulse 1.8s ease-in-out infinite"
              : "none",
            transition: "background 0.3s ease",
          }}
        />
        {showConnector && (
          <span
            className="flex-shrink-0 rounded-full bg-beam-500 text-white"
            style={{
              width: 8,
              height: 8,
              animation: "gbConnectorPulse 1.8s ease-in-out infinite",
            }}
          />
        )}
      </div>

      {/* ── Result card ──────────────────────────────────────────────────── */}
      <div
        className="rounded-xl border border-line bg-surface shadow-panel overflow-hidden"
        style={{ transition: "box-shadow 0.2s" }}
      >
        {/* Card header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-surfaceAlt">
          <div className="flex items-center gap-2">
            <span className="text-beam-500" style={{ fontSize: 16 }}>⬡</span>
            <span className="text-sm font-semibold text-ink font-display">
              Common Invisible Burgers vectors
            </span>
          </div>
          {count > 0 && (
            <span
              className="rounded-full px-2.5 py-0.5 text-xs font-medium bg-ok/10 text-ok"
              style={{ animation: "gbResultIn 200ms ease-out" }}
            >
              Found: {count}
            </span>
          )}
        </div>

        <div className="px-4 py-3 space-y-4">
          {/* Selected g-vectors */}
          {selectedGVectors.length > 0 && (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-subtle mb-2">
                Selected g-vectors
              </p>
              <div className="flex flex-wrap gap-1.5">
                {selectedGVectors.map((g) => (
                  <span
                    key={g}
                    className="inline-flex items-center gap-1.5 rounded-md border border-beam-300 bg-beam-50 px-2.5 py-1 font-mono text-xs text-beam-700"
                  >
                    <span className="text-beam-500 font-bold text-[10px]">●</span>
                    {g}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Results or empty state */}
          {count > 0 ? (
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wider text-subtle mb-2">
                Common b vectors
              </p>
              <div className="flex flex-col gap-1.5">
                {commonBurgersVectors.map((r, idx) => {
                  const isNew = animatingIn.has(r.bStr);
                  return (
                    <div
                      key={r.bStr}
                      className="flex items-center gap-3 rounded-lg border border-ok/20 bg-ok/5 px-3 py-2"
                      style={{
                        animation: isNew
                          ? `gbResultIn 180ms ease-out ${idx * 45}ms both`
                          : undefined,
                      }}
                    >
                      {/* Green check */}
                      <span
                        className="flex-shrink-0 flex items-center justify-center rounded-full bg-ok/15 text-ok"
                        style={{ width: 22, height: 22, fontSize: 13 }}
                      >
                        ✓
                      </span>
                      {/* Burgers vector label */}
                      <span className="font-mono text-[13px] font-semibold text-ink">
                        {formatBurgersVectorForDisplay(r.bStr)}
                      </span>
                      {/* g·b values badge row */}
                      <div className="ml-auto flex items-center gap-1">
                        {r.gbValues.map((v, gi) => (
                          <span
                            key={gi}
                            className="rounded bg-beam-50 px-1.5 py-0.5 font-mono text-[11px] text-beam-600"
                            title={`g${gi + 1}·b = ${v}`}
                          >
                            {v}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : selectedGVectors.length > 0 ? (
            // Empty state with warning
            <div className="flex items-start gap-3 rounded-lg border border-warn/30 bg-warn/5 px-3 py-3">
              <span
                className="flex-shrink-0 text-warn mt-0.5"
                style={{ fontSize: 18 }}
                aria-hidden="true"
              >
                ⚠
              </span>
              <div>
                <p className="text-sm font-medium text-warn">
                  No common invisible Burgers vector exists
                </p>
                <p className="text-xs text-subtle mt-0.5">
                  for the selected diffraction vectors.
                </p>
              </div>
            </div>
          ) : (
            // Nothing selected yet
            <p className="text-xs text-subtle text-center py-2">
              Click one or more g-vector rows above to find their common invisible Burgers vectors.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
