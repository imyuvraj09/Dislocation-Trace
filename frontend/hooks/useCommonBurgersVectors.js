import { useMemo } from "react";
import { findCommonInvisibleVectorsForMany } from "@/lib/gbExplorer";

/**
 * Computes the intersection of invisible Burgers vectors for a set of
 * selected g-vectors, live and in-memory.
 *
 * Usage:
 *   const { commonBurgersVectors, count } = useCommonBurgersVectors(table, selectedGVectors);
 *
 * @param {object|null}  table            - The loaded g·b table ({ gVectors, bVectors, values })
 * @param {string[]}     selectedGVectors - Array of g-vector label strings currently selected
 * @returns {{ commonBurgersVectors: { bStr: string, gbValues: number[] }[], count: number }}
 */
export default function useCommonBurgersVectors(table, selectedGVectors) {
  return useMemo(() => {
    if (!table || !selectedGVectors || selectedGVectors.length === 0) {
      return { commonBurgersVectors: [], count: 0 };
    }
    const commonBurgersVectors = findCommonInvisibleVectorsForMany(table, selectedGVectors);
    return { commonBurgersVectors, count: commonBurgersVectors.length };
  }, [table, selectedGVectors]);
}
