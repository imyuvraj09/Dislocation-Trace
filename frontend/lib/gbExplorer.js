/**
 * g.b Explorer panel -- pure logic layer.
 *
 * Ported from crystal-gb-explorer-main's app.js + math/vector.js so the
 * panel embedded in Stage 7 behaves identically to the standalone app,
 * just restructured as pure functions React components can call instead
 * of directly poking the DOM. Everything here operates on one already-
 * fetched table ({ name, gVectors, bVectors, values } -- see
 * lib/api.js's fetchGbTable) and never talks to the network itself.
 */

// ─── Vector parsing (mirrors math/vector.js's VectorUtils.parse) ───────────
export function parseVector(str) {
  if (!str || !str.trim()) return null;
  let s = str.trim().replace(/^[[({]+|[\])}]+$/g, "");

  let parts;
  if (s.includes(".")) {
    // Hexagonal 4-index dot-separated notation, e.g. "01-1.1"
    const dotParts = s.split(".");
    const firstPart = dotParts[0].match(/-?\d/g) || [];
    const secondPart = (dotParts[1] || "").match(/-?\d/g) || [];
    parts = [...firstPart, ...secondPart];
  } else if (s.includes(" ") || s.includes(",")) {
    parts = s.split(/[\s,]+/);
  } else {
    parts = s.match(/-?\d/g) || [];
  }
  const arr = parts.map((p) => Number.parseFloat(p)).filter((n) => !Number.isNaN(n));
  return arr.length >= 3 ? arr : null;
}

/** Same as parseVector, but accepts exactly 3 or 4 components (for g1/g2 inputs). */
export function parseGVector(str, expectedCount = null) {
  if (!str || !str.trim()) return null;
  const parts = str
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => !Number.isNaN(n));
  if (expectedCount != null) return parts.length === expectedCount ? parts : null;
  return parts.length >= 3 && parts.length <= 4 ? parts : null;
}

export function formatBurgersVectorForDisplay(str) {
  const s = str.trim();
  if (s.startsWith("[") && s.endsWith("]")) return s;
  return `[${s}]`;
}

/**
 * Appends a user-typed custom Burgers vector to a table (computing its
 * g.b column against every already-loaded g-vector), returning a new
 * table object -- never mutates the one passed in. Returns the original
 * table unchanged if the input doesn't parse to 3 or 4 components, or if
 * it's already present.
 */
export function withCustomBurgersVector(table, rawInput) {
  const bArr = parseVector(rawInput);
  const expectedCount = table.indexNotation === "hkil" ? 4 : 3;
  if (!bArr || bArr.length !== expectedCount) return { table, label: null };

  const formatted = bArr.length === 4 ? bArr.join(" ") : bArr.join("");

  if (table.bVectors.includes(formatted)) return { table, label: formatted };

  const values = table.values.map((row, i) => {
    const g = parseVector(table.gVectors[i]) || [];
    const gb = g.length === bArr.length ? g.reduce((sum, component, idx) => sum + component * bArr[idx], 0) : NaN;
    return [...row, gb];
  });

  return {
    table: { ...table, bVectors: [...table.bVectors, formatted], values },
    label: formatted,
  };
}

// ─── Tab 1: Dataset metrics ─────────────────────────────────────────────────
export function computeMetrics(table) {
  const nG = table.gVectors.length;
  const nB = table.bVectors.length;
  const allVals = table.values.flat();
  const nZero = allVals.filter((v) => v === 0).length;
  const nTotal = allVals.length;
  const pct = nTotal ? ((100 * nZero) / nTotal).toFixed(1) : "0.0";
  return { nG, nB, nZero, nTotal, pct };
}

// ─── Tab 2: Search & Filter ─────────────────────────────────────────────────
export function getFilteredRows(table, { gSearch = "", filterMode = "all", customVal = 0, bFilter = [] } = {}) {
  const activeBCols = bFilter.length ? bFilter : table.bVectors;
  const bIndices = activeBCols.map((b) => table.bVectors.indexOf(b));
  const q = gSearch.trim().toLowerCase();

  const rows = [];
  for (let i = 0; i < table.gVectors.length; i++) {
    const g = table.gVectors[i];
    if (q && !g.toLowerCase().includes(q)) continue;

    const rowVals = bIndices.map((bi) => table.values[i][bi]);
    if (filterMode === "zero" && !rowVals.some((v) => v === 0)) continue;
    if (filterMode === "nonzero" && !rowVals.some((v) => v !== 0)) continue;
    if (filterMode === "custom" && !rowVals.some((v) => v === customVal)) continue;

    rows.push({ g, values: rowVals });
  }
  return { activeBCols, rows };
}

// ─── Tab 4: Truth Table ─────────────────────────────────────────────────────
export function getTruthRows(table, { bSubset = [], gSearch = "", onlyInvisible = false } = {}) {
  if (!bSubset.length) return { bIndices: [], rows: [] };
  const bIndices = bSubset.map((b) => table.bVectors.indexOf(b));
  const q = gSearch.trim().toLowerCase();

  const rows = [];
  for (let i = 0; i < table.gVectors.length; i++) {
    const g = table.gVectors[i];
    if (q && !g.toLowerCase().includes(q)) continue;
    const booleans = bIndices.map((bi) => table.values[i][bi] === 0);
    if (onlyInvisible && !booleans.some(Boolean)) continue;
    rows.push({ g, booleans });
  }
  return { bIndices, rows };
}

export function getInvisibilityCounts(table, bSubset) {
  const bIndices = bSubset.map((b) => table.bVectors.indexOf(b));
  const invCounts = bSubset.map(() => 0);
  const visCounts = bSubset.map(() => 0);
  for (const row of table.values) {
    bIndices.forEach((bi, idx) => {
      if (row[bi] === 0) invCounts[idx]++;
      else visCounts[idx]++;
    });
  }
  return { invCounts, visCounts };
}

// ─── Tab 5: Common b Finder ─────────────────────────────────────────────────
/** g1Str/g2Str must exactly match one of table.gVectors' "h k l" strings. */
export function findCommonInvisibleVectors(table, g1Str, g2Str) {
  const g1Idx = table.gVectors.indexOf(g1Str);
  const g2Idx = table.gVectors.indexOf(g2Str);
  if (g1Idx === -1) throw new Error(`g₁ vector '${g1Str}' not found in this material's tabulated reflections.`);
  if (g2Idx === -1) throw new Error(`g₂ vector '${g2Str}' not found in this material's tabulated reflections.`);

  const results = [];
  for (let col = 0; col < table.bVectors.length; col++) {
    const val1 = table.values[g1Idx][col];
    const val2 = table.values[g2Idx][col];
    if (val1 === 0 && val2 === 0) {
      results.push({ bStr: table.bVectors[col], val1, val2 });
    }
  }
  return results;
}

/**
 * N-vector generalization of findCommonInvisibleVectors.
 *
 * Given an array of g-vector strings (each matching table.gVectors exactly),
 * returns every Burgers vector where g·b = 0 for ALL supplied g-vectors
 * simultaneously — i.e. the intersection of their invisibility sets.
 *
 * Returns [] when gStrings is empty (no filter applied yet).
 * Returns all b-vectors invisible to the single g when gStrings.length === 1.
 *
 * Complexity: O(|gStrings| × |bVectors|) — well under 1 ms for any realistic
 * crystallographic dataset.
 *
 * @param {object}   table    - { gVectors: string[], bVectors: string[], values: number[][] }
 * @param {string[]} gStrings - g-vector labels to intersect (must be in table.gVectors)
 * @returns {{ bStr: string, gbValues: number[] }[]}
 */
export function findCommonInvisibleVectorsForMany(table, gStrings) {
  if (!gStrings || gStrings.length === 0) return [];

  // Resolve each g-string to its row index; skip any not found.
  const gIndices = gStrings
    .map((s) => table.gVectors.indexOf(s))
    .filter((idx) => idx !== -1);

  if (gIndices.length === 0) return [];

  const results = [];
  for (let col = 0; col < table.bVectors.length; col++) {
    // Every selected g-row must have g·b = 0 for this b-column.
    const allZero = gIndices.every((gi) => table.values[gi][col] === 0);
    if (allZero) {
      results.push({
        bStr: table.bVectors[col],
        gbValues: gIndices.map((gi) => table.values[gi][col]),
      });
    }
  }
  return results;
}

/** Normalizes a raw g1/g2 input (3- or 4-index) to the "h k l" form the table's g_vectors use. */
export function normalizeGVectorInput(parts) {
  if (!parts) return null;
  return parts.join(" ");
}

// ─── CSV / TSV / JSON / LaTeX export ────────────────────────────────────────
function csvEscape(str) {
  if (typeof str !== "string") return str;
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function buildCsv(gVectors, bCols, values) {
  const header = ["g \\ b", ...bCols].join(",");
  const rows = gVectors.map((g, i) => [csvEscape(g), ...values[i]].join(","));
  return [header, ...rows].join("\n");
}

export function buildTsv(gVectors, bCols, values) {
  const header = ["g \\ b", ...bCols].join("\t");
  const rows = gVectors.map((g, i) => [g, ...values[i]].join("\t"));
  return [header, ...rows].join("\n");
}

export function buildJson(name, gVectors, bCols, values) {
  return JSON.stringify({ name, g_vectors: gVectors, b_vectors: bCols, values }, null, 2);
}

export function buildLatex(title, headers, rows) {
  let latex = `% LaTeX table exported from CrystalTrace's g.b Explorer\n% Title: ${title}\n`;
  latex += `\\begin{table}[h]\n\\centering\n\\caption{${title}}\n`;
  const colAlign = "|" + Array(headers.length).fill("c").join("|") + "|";
  latex += `\\begin{tabular}{${colAlign}}\n\\hline\n`;
  latex += headers.map((h) => `$${String(h).replace(/\\/g, "\\\\")}$`).join(" & ") + " \\\\ \\hline\n";
  rows.forEach((row) => {
    latex += row.map((v) => (typeof v === "string" ? `$${v}$` : v)).join(" & ") + " \\\\ \\hline\n";
  });
  latex += "\\end{tabular}\n\\end{table}\n";
  return latex;
}

export function safeFilename(name) {
  return name.replace(/\s+/g, "_");
}
