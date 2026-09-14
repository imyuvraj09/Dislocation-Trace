/**
 * API layer -- calls the real FastAPI backend (backend/main.py).
 *
 * Every function here does exactly one thing: build the request shape a
 * real backend endpoint already expects (see backend/app/routers/*.py),
 * using only values the user explicitly provided in the UI. None of these
 * functions invent, infer, or default a scientific value (a Miller index,
 * a line correspondence, a g-vector assignment, a zone axis, a Burgers
 * vector) on the caller's behalf -- if a required field isn't supplied,
 * the function throws rather than filling in a placeholder. Crystallographic
 * interpretation is the user's job; this file's job is only to move their
 * decisions to the backend and bring the computed results back.
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

/**
 * Stable per-tab session id so multi-stage state lines up on the backend.
 * Persisted in sessionStorage so a same-tab refresh keeps talking to the
 * same backend SessionState (see hooks/useSessionReconciliation.js for how
 * a stale one left over from before a refresh gets reconciled).
 */
function getSessionId() {
  if (typeof window === "undefined") return "server";
  if (!window.__temSessionId) {
    let stored;
    try {
      stored = window.sessionStorage?.getItem("temSessionId");
    } catch {
      stored = null; // sessionStorage can throw in locked-down/private contexts
    }
    window.__temSessionId =
      stored || window.crypto?.randomUUID?.() || `sess-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    try {
      window.sessionStorage?.setItem("temSessionId", window.__temSessionId);
    } catch {
      // Best-effort only -- if sessionStorage isn't writable, the id still
      // works for this page load, it just won't survive a refresh.
    }
  }
  return window.__temSessionId;
}

async function apiFetch(path, { method = "GET", body, isFormData = false } = {}) {
  const headers = { "X-Session-Id": getSessionId() };
  if (!isFormData) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {
      /* response wasn't JSON */
    }
    throw new Error(`API ${method} ${path} failed (${res.status}): ${detail}`);
  }
  return res.json();
}

function parseIndexVector(values, expectedCount, label, { integer = false } = {}) {
  if (!Array.isArray(values) || values.length !== expectedCount) {
    throw new Error(`${label} requires exactly ${expectedCount} indices.`);
  }
  const parsed = values.map((v) => (integer ? Number.parseInt(v, 10) : Number.parseFloat(v)));
  if (parsed.some((n) => !Number.isFinite(n))) {
    throw new Error(`Invalid ${label} [${values.join(", ")}] -- every index must be a ${integer ? "whole number" : "number"}.`);
  }
  return parsed;
}

function expectedIndexCount(materialId) {
  return materialId === "HCP_Hexagonal_Close_Packed" ? 4 : 3;
}

function vecToLabel(arr) {
  if (!Array.isArray(arr)) return "Undefined";
  return `[${arr.map((n) => (Number.isInteger(n) ? n : Number(n).toFixed(2))).join(" ")}]`;
}

/**
 * Stage 1 -- upload TEM + diffraction images, run line/g-vector detection.
 * `files` = { tem: File[], diffraction: File[] }
 *
 * Returns each image's *full* detected-line / detected-g-vector detail (not
 * just counts), since Stage 2 and Stage 3 need the actual labels/ids to let
 * the user build their own Miller assignments and line pairs from them.
 */
export async function uploadImages(files) {
  const temFiles = files.tem ?? [];
  const diffFiles = files.diffraction ?? [];

  const temResults = [];
  for (const file of temFiles) {
    const form = new FormData();
    form.append("file", file);
    form.append("min_px", "20");
    const res = await apiFetch("/api/stage1/detect-lines", { method: "POST", body: form, isFormData: true });
    temResults.push(res);
  }

  const diffResults = [];
  for (const file of diffFiles) {
    const form = new FormData();
    form.append("file", file);
    const res = await apiFetch("/api/stage1/detect-gvecs", { method: "POST", body: form, isFormData: true });
    diffResults.push(res);
  }

  const temImages = temResults.map((r) => ({ image: r.image, lines: r.lines }));
  const diffImages = diffResults.map((r) => ({ image: r.image, gvecs: r.candidates }));

  const images = [
    ...temResults.map((r) => ({
      id: r.image,
      filename: r.image,
      type: "TEM",
      width: r.width,
      height: r.height,
      uploadedAt: new Date().toISOString(),
    })),
    ...diffResults.map((r) => ({
      id: r.image,
      filename: r.image,
      type: "Diffraction",
      width: r.width,
      height: r.height,
      uploadedAt: new Date().toISOString(),
    })),
  ];

  const detectedLines = temResults.reduce((sum, r) => sum + r.detectedLines, 0);
  return { images, detectedLines, temImages, diffImages };
}

/**
 * Stage 2 -- submit user-entered Miller indices for detected g-vectors.
 * `assignments` = [{ source, g_id, hkl: [h, k, l] }] -- exactly the shape
 * backend/app/routers/stage2_miller.py's MillerRequest expects. `hkl`
 * values are the literal strings the user typed, parsed to integers here;
 * nothing is defaulted or inferred.
 * POST /api/stage2/miller
 *
 * Returns the backend's own confirmation of what was updated
 * (`res.updated`); it's the caller's job (Stage2MillerIndex.js) to fold
 * that back into the Project Store's Stage 1 data via `update()` -- this
 * file no longer keeps any mutable copy of that data itself, so there's
 * exactly one place (the store) where a detected g-vector's hkl lives.
 * POST /api/stage2/miller
 */
export async function submitMillerAssignments(assignments, materialId, cOverA = null) {
  if (!assignments || assignments.length === 0) {
    throw new Error("No Miller indices to submit -- assign at least one hkl value first.");
  }
  if (!materialId) throw new Error("Select a material / crystal structure before saving Miller indices.");
  const count = expectedIndexCount(materialId);
  const body = {
    material_id: materialId,
    c_over_a: cOverA,
    assignments: assignments.map((a) => ({
      source: a.source,
      g_id: a.g_id,
      hkl: parseIndexVector(a.hkl, count, count === 4 ? "Miller-Bravais plane" : "Miller plane", { integer: true }),
    })),
  };
  return apiFetch("/api/stage2/miller", { method: "POST", body });
}

import { rotateVector } from "@/lib/coordinates";

/**
 * Synchronize line annotations and g-vector annotations from frontend store
 * to the backend session state, applying image rotation transformations.
 */
export async function syncAnnotations(temImages = [], diffImages = [], imagesById = {}) {
  const getRotation = (imgRecord) => {
    if (!imgRecord) return 0;
    if (typeof imgRecord.rotation === "number") return imgRecord.rotation;
    if (typeof imgRecord.viewport?.rotation === "number") return imgRecord.viewport.rotation;
    const name = imgRecord.image || imgRecord.filename || imgRecord.id;
    const matched = Object.values(imagesById ?? {}).find((i) => i.filename === name || i.id === name);
    return matched?.viewport?.rotation ?? 0;
  };

  const payload = {
    temImages: temImages.map((t) => {
      const rot = getRotation(t);
      return {
        image: t.image,
        lines: (t.lines ?? []).filter((l) => !l.deleted).map((l) => {
          const rawVx = l.vx ?? (l.x2 - l.x1);
          const rawVy = l.vy ?? (l.y2 - l.y1);
          const { vx: rVx, vy: rVy } = rotateVector(rawVx, rawVy, rot);
          return {
            label: l.label,
            color: l.color ?? "manual",
            x1: Math.round(l.x1),
            y1: Math.round(l.y1),
            x2: Math.round(l.x2),
            y2: Math.round(l.y2),
            vx: Math.round(rVx),
            vy: Math.round(rVy),
          };
        }),
      };
    }),
    diffImages: diffImages.map((d) => {
      const rot = getRotation(d);
      return {
        image: d.image,
        gvecs: (d.gvecs ?? []).filter((g) => !g.deleted).map((g) => {
          const rawVx = g.vx ?? (g.tx - g.ox);
          const rawVy = g.vy ?? (g.ty - g.oy);
          const { vx: rVx, vy: rVy } = rotateVector(rawVx, rawVy, rot);
          return {
            g_id: g.g_id,
            ox: Math.round(g.ox),
            oy: Math.round(g.oy),
            tx: Math.round(g.tx),
            ty: Math.round(g.ty),
            vx: Math.round(rVx),
            vy: Math.round(rVy),
            hkl: g.hkl ?? null,
          };
        }),
      };
    }),
  };
  return apiFetch("/api/stage1/sync-annotations", { method: "POST", body: payload });
}

/**
 * Stage 3 -- submit user-created line pairs. `pairs` = [{ pair_id, image1,
 * line_id1, image2, line_id2 }], built entirely from the user's own
 * label-to-label selections (see components/pipeline/stages/Stage3LinePairing.js) --
 * exactly backend/app/routers/stage3_pairs.py's PairsRequest shape.
 * POST /api/stage3/pairs
 */
export async function submitLinePairs(pairs) {
  if (!pairs || pairs.length === 0) {
    throw new Error("No line pairs to submit -- create at least one pair first.");
  }
  const res = await apiFetch("/api/stage3/pairs", { method: "POST", body: { pairs } });
  return {
    pairs: res.pairs.map((p) => ({
      pairId: p.pair_id,
      image1: p.line1.image,
      lineId1: p.line1.label,
      image2: p.line2.image,
      lineId2: p.line2.label,
    })),
  };
}

/** Stage 3 -- re-fetch the pairs the backend currently has for this session. GET /api/stage3/pairs */
export async function fetchLinePairs() {
  const res = await apiFetch("/api/stage3/pairs", { method: "GET" });
  return {
    pairs: res.pairs.map((p) => ({
      pairId: p.pair_id,
      image1: p.line1.image,
      lineId1: p.line1.label,
      image2: p.line2.image,
      lineId2: p.line2.label,
    })),
  };
}

/**
 * Stage 4 -- submit the user's per-pair g-vector selections and compute
 * pixel-space trace angles. `selections` = [{ pair_id, image, diff_image,
 * g_ids: [3 ids] }], `temToDiff` = { temImage: diffImage }, both built
 * entirely from user choices (see Stage4GVectorAssignment.js) -- exactly
 * backend/app/routers/stage4_angles.py's AnglesRequest shape.
 * POST /api/stage4/angles
 */
export async function computeAngles(selections, temToDiff) {
  if (!selections || selections.length === 0) {
    throw new Error("No g-vector selections to submit -- assign g-vectors for at least one pair first.");
  }
  for (const s of selections) {
    if (!s.g_ids || s.g_ids.length !== 3) {
      throw new Error(`Pair ${s.pair_id} (${s.image}) needs exactly 3 g-vectors selected, got ${s.g_ids?.length ?? 0}.`);
    }
  }
  const res = await apiFetch("/api/stage4/angles", {
    method: "POST",
    body: { selections, tem_to_diff: temToDiff },
  });
  return { angles: res.angles };
}

/**
 * Stage 5 -- solve the Up-vector for one (pair, image) line, using the
 * user-entered zone axis for that image and the g-vectors already assigned
 * to it in Stage 4. `entry` = { pairId, image, lineId, diffImage, gIds,
 * zoneAxis: [h,k,l], forceZone? } -- exactly backend/app/routers/
 * stage6_solve.py's SolveUpRequest shape (renamed fields aside).
 * POST /api/stage6/solve-up
 *
 * Call once per (pair, image) -- i.e. twice per pair. This file does not
 * loop over "all pairs" itself so the caller (Stage5UpVectorSolving.js)
 * stays the single place that decides which pairs are ready to solve.
 */
export async function solveUpVector(entry) {
  if (!entry.zoneAxis || entry.zoneAxis.some((v) => v === "" || v == null)) {
    throw new Error(`Zone axis for '${entry.image}' is required before solving its Up-vector.`);
  }
  if (!entry.materialId) throw new Error("Select a material / crystal structure before solving Up.");
  if (
    (entry.materialId === "HCP_Hexagonal_Close_Packed" || entry.materialId.toLowerCase().includes("tetragonal")) &&
    (!(Number(entry.cOverA) > 0) || !Number.isFinite(Number(entry.cOverA)))
  ) {
    throw new Error("A finite positive c/a ratio is required for this crystal structure.");
  }
  const res = await apiFetch("/api/stage6/solve-up", {
    method: "POST",
    body: {
      pair_id: entry.pairId,
      image: entry.image,
      line_id: entry.lineId,
      diff_image: entry.diffImage,
      g_ids: entry.gIds,
      material_id: entry.materialId,
      c_over_a: entry.cOverA,
      zone_axis: parseIndexVector(
        entry.zoneAxis,
        expectedIndexCount(entry.materialId),
        entry.materialId === "HCP_Hexagonal_Close_Packed" ? "HCP zone axis" : "zone axis"
      ),
      force_zone: Boolean(entry.forceZone),
    },
  });
  return { result: res.result };
}

/**
 * Stage 6 -- reconstruct the true 3-D dislocation line for one pair.
 * POST /api/stage7/true-line
 */
export async function computeTrueLine(pairId, image1, image2) {
  const res = await apiFetch("/api/stage7/true-line", {
    method: "POST",
    body: { pair_id: pairId, image1, image2 },
  });
  const tl = res.line;
  return {
    line: {
      id: tl.pair_id,
      pair: tl.pair_id,
      pairId: tl.pair_id,
      direction: vecToLabel(tl.U_miller),
      uMiller: tl.U_miller,
      uNorm: tl.U_norm,
      lineIndexingDeviation: tl.U_indexing_deviation_deg ?? null,
      rawLine: tl,
    },
  };
}

/**
 * Stage 8 / Final classification entry point -- classify one pair's character + slip plane
 * from a supplied Burgers vector.
 * POST /api/stage8/classify
 */
export async function classifyLine(pairId, burgers) {
  const parsedBurgers = burgers.map((v) => Number.parseFloat(v));
  if (parsedBurgers.some((n) => !Number.isFinite(n))) {
    throw new Error("Every Burgers-vector index must be numeric.");
  }
  const res = await apiFetch("/api/stage8/classify", {
    method: "POST",
    body: { pair_id: pairId, burgers: parsedBurgers },
  });
  const cr = res.classification;
  const slipPlaneStr = cr.slip_miller && cr.slip_miller.some((x) => x !== 0)
    ? `(${cr.slip_miller.join(" ")})`
    : "Undefined";
  const slipSystemStr = cr.slip_miller && cr.slip_miller.some((x) => x !== 0) && cr.burgers
    ? `(${cr.slip_miller.join("")})[${cr.burgers.map(Math.round).join("")}]`
    : "Undefined";

  return {
    classification: {
      id: cr.pair_id,
      pairId: cr.pair_id,
      direction: vecToLabel(cr.slip_miller),
      character: formatCharacter(cr.character),
      ubAngleDeg: cr.ub_angle_deg,
      slipPlaneNormal: Array.isArray(cr.slip_raw)
        ? `[${cr.slip_raw.map((n) => (typeof n === "number" ? (n >= 0 ? "+" : "") + n.toFixed(2) : n)).join(" ")}]`
        : (cr.slip_raw || ""),
      slipMiller: cr.slip_miller,
      slipPlane: slipPlaneStr,
      slipSystem: slipSystemStr,
      slipPlaneIndexingDeviation: cr.slip_plane_indexing_deviation_deg ?? null,
      burgers: cr.burgers,
      burgersFormatted: vecToLabel(cr.burgers),
      rawClassification: cr,
    },
  };
}

function serializeClassification(cr) {
  if (!cr) return null;
  return {
    id: cr.pair_id,
    direction: vecToLabel(cr.slip_miller),
    character: formatCharacter(cr.character),
    slipSystem: cr.slip_miller ? `(${cr.slip_miller.join(" ")})` : "Undefined",
    burgers: vecToLabel(cr.burgers),
  };
}

function serializePairGbRecord(p) {
  return {
    pairId: p.pairId,
    observations: (p.observations ?? []).map((o) => ({
      imageId: o.image_id,
      gVectorId: o.g_vector_id,
      millerIndex: o.miller_index,
      gb: o.gb,
      notes: o.notes,
      timestamp: o.timestamp,
    })),
    candidateBurgersVectors: (p.candidateBurgersVectors ?? []).map((c) => ({
      label: c.label,
      vector: c.b_vector,
      confidence: c.confidence,
      status: c.status,
    })),
    resolvedBurgersVector: p.resolvedBurgersVector ?? null,
    mathDerivation: p.mathDerivation ?? "",
    classification: serializeClassification(p.classification),
  };
}

/**
 * Materials -- read-only access to the crystallography reference service
 * (backend/crystallography, reused from the g.b project's databases).
 * GET /api/materials
 */
export async function fetchMaterials() {
  try {
    const res = await apiFetch("/api/materials", { method: "GET" });
    return (res.materials || []).filter(
      (m) => m.id !== "Simple_Cubic_SC" && m.id !== "Simple_Tetragonal_P"
    );
  } catch {
    try {
      const localRes = await fetch("/data/manifest.json");
      if (localRes.ok) {
        const manifest = await localRes.json();
        return Object.entries(manifest)
          .filter(([id]) => id !== "Simple_Cubic_SC" && id !== "Simple_Tetragonal_P")
          .map(([id, name]) => {
            const crystalSystem = id === "HCP_Hexagonal_Close_Packed"
              ? "hcp"
              : id.toLowerCase().includes("tetragonal")
                ? "tetragonal"
                : "cubic";
            return {
              id,
              name,
              crystalSystem,
              indexNotation: crystalSystem === "hcp" ? "hkil" : "hkl",
              requiresCOverA: crystalSystem !== "cubic",
            };
          });
      }
    } catch {
      /* fallback unavailable */
    }
    return [];
  }
}

export async function fetchGbTable(materialId) {
  if (!materialId) {
    throw new Error("Select a crystal structure before opening the g.b Explorer.");
  }
  try {
    const res = await apiFetch(`/api/materials/${encodeURIComponent(materialId)}/gb-table`, { method: "GET" });
    return {
      id: res.id,
      name: res.name,
      crystalSystem: res.crystal_system,
      indexNotation: res.index_notation,
      requiresCOverA: res.requires_c_over_a,
      gVectors: res.g_vectors,
      bVectors: res.b_vectors,
      values: res.values,
    };
  } catch (err) {
    // Static fallback: fetch from /data/${materialId}.json (works when backend server is offline/unreachable)
    try {
      const localRes = await fetch(`/data/${encodeURIComponent(materialId)}.json`);
      if (localRes.ok) {
        const data = await localRes.json();
        return {
          id: materialId,
          name: data.name ?? materialId,
          crystalSystem: materialId === "HCP_Hexagonal_Close_Packed" ? "hcp" : materialId.toLowerCase().includes("tetragonal") ? "tetragonal" : "cubic",
          indexNotation: materialId === "HCP_Hexagonal_Close_Packed" ? "hkil" : "hkl",
          requiresCOverA: materialId === "HCP_Hexagonal_Close_Packed" || materialId.toLowerCase().includes("tetragonal"),
          gVectors: data.g_vectors ?? data.gVectors ?? [],
          bVectors: data.b_vectors ?? data.bVectors ?? [],
          values: data.values ?? [],
        };
      }
    } catch {
      /* throw original error if local fetch fails */
    }
    throw err;
  }
}

/**
 * Stage 7 -- submit (or update) one pair's experimental g.b observations.
 * `observations` = [{ imageId, gVectorId, millerIndex: [h,k,l], gb, notes }],
 * auto-generated by the caller (Stage8Classification.js) from Stage 3's
 * submittedPairs + Stage 4's selections + Stage 2's millerIndexByGvector --
 * this file never invents a row itself. The backend re-runs the ported
 * Burgers-vector solver against `materialId`'s crystallographically-allowed
 * family on every submission and, if the observations resolve to exactly
 * one consistent candidate, automatically classifies the pair too (see
 * backend/app/routers/stage8_classify.py).
 * POST /api/stage8/gb-observations
 */
export async function submitGbObservations(pairId, materialId, observations, cOverA = null) {
  if (!materialId) {
    throw new Error("Select a material before recording g.b observations.");
  }
  if (!observations || observations.length === 0) {
    throw new Error(`No g.b observation rows to submit for pair '${pairId}'.`);
  }
  const res = await apiFetch("/api/stage8/gb-observations", {
    method: "POST",
    body: {
      pair_id: pairId,
      material_id: materialId,
      c_over_a: cOverA,
      observations: observations.map((o) => ({
        image_id: o.imageId,
        g_vector_id: o.gVectorId,
        miller_index: parseIndexVector(
          o.millerIndex,
          expectedIndexCount(materialId),
          materialId === "HCP_Hexagonal_Close_Packed" ? "Miller-Bravais plane" : "Miller plane",
          { integer: true }
        ),
        gb: o.gb === "" || o.gb == null ? null : Number.parseInt(o.gb, 10),
        notes: o.notes ?? "",
      })),
    },
  });
  return serializePairGbRecord(res);
}

/** Stage 7 -- re-fetch every pair's currently recorded g.b observations. GET /api/stage8/gb-observations */
export async function fetchGbObservations() {
  const res = await apiFetch("/api/stage8/gb-observations", { method: "GET" });
  return res.pairs.map(serializePairGbRecord);
}

/**
 * Stage 7 -- explicit user confirmation of one candidate Burgers vector
 * when the solver left more than one crystallographically-consistent
 * candidate for a pair (see AUTOMATIC BURGERS-VECTOR DETERMINATION in the
 * integration spec: "If multiple candidates exist ... Allow the user to
 * select the correct one. Never guess."). `burgers` must be one of the
 * candidate vectors already returned for that pair -- the backend rejects
 * anything else. Triggers classification automatically once confirmed.
 * POST /api/stage8/select-burgers-candidate
 */
export async function selectBurgersCandidate(pairId, burgers) {
  const res = await apiFetch("/api/stage8/select-burgers-candidate", {
    method: "POST",
    body: { pair_id: pairId, burgers },
  });
  return serializePairGbRecord(res);
}

/** Stage 7 -- every classification computed so far this session (keyed by pair on the caller's side). GET /api/stage8/classify */
export async function fetchClassifications() {
  const res = await apiFetch("/api/stage8/classify", { method: "GET" });
  return res.classifications.map(serializeClassification);
}

/**
 * Stage 8 -- write + fetch the batch CSV. `pairs` = [{ pair_id,
 * gvecs_image1, gvecs_image2 }] -- the diffraction image each pair's two
 * lines were indexed against, taken from Stage 2's user-set TEM-image ->
 * diffraction-image associations.
 * POST /api/stage9/batch
 */
export function formatCharacter(c) {
  if (!c) return "";
  const u = c.toUpperCase().replace(/\s+/g, " ").trim();
  if (u === "SCREW" || u === "SCREW DOMINANT") return "Screw";
  if (u === "EDGE" || u === "EDGE DOMINANT") return "Edge";
  if (
    u === "MIXED-SCREW-DOMINANT" ||
    u === "MIXED-SCREW- DOMINANT" ||
    u === "MIXED SCREW DOMINANT" ||
    u === "MIXED_SCREW_DOMINANT" ||
    u === "SCREW-DOMINANT"
  ) {
    return "Mixed-Screw-Dominant";
  }
  if (
    u === "MIXED-EDGE-DOMINANT" ||
    u === "MIXED-EDGE -DOMINANT" ||
    u === "MIXED EDGE DOMINANT" ||
    u === "MIXED_EDGE_DOMINANT" ||
    u === "EDGE-DOMINANT"
  ) {
    return "Mixed-Edge-Dominant";
  }
  if (u === "MIXED") return "Mixed-Screw-Dominant";
  return c;
}

export async function fetchBatchResults(pairs, selectedBurgersVector = null) {
  if (!pairs || pairs.length === 0) {
    throw new Error("No pairs ready for batch output -- complete Stages 3-6 for at least one pair first.");
  }
  const formattedPairs = pairs.map((p) => ({
    pair_id: p.pair_id || p.pairId,
    gvecs_image1: p.gvecs_image1 || p.gvecsImage1 || null,
    gvecs_image2: p.gvecs_image2 || p.gvecsImage2 || null,
    burgers: p.burgers || null,
  }));
  const res = await apiFetch("/api/stage9/batch", {
    method: "POST",
    body: { pairs: formattedPairs, selected_burgers: selectedBurgersVector },
  });

  const rows = res.rows.map((r, i) => {
    const pairId = r["Pair ID"] || r.pair_label || r.pair_id || "";
    return {
      id: `${r.pair_id || i}-${i}`,
      "Pair ID": pairId,
      "TEM Image 1": r["TEM Image 1"] || r.tem_image_1 || "",
      "TEM Image 2": r["TEM Image 2"] || r.tem_image_2 || "",
      "Indexed true line direction (uT)": r["Indexed true line direction (uT)"] || r.U_miller || "",
      "Continuous normalized uT—full precision": r["Continuous normalized uT—full precision"] || r.U_norm || "",
      "uT indexing deviation (°)": r["uT indexing deviation (°)"] || r.U_indexing_deviation_deg || "N/A",
      "Selected Burgers vector (b)": r["Selected Burgers vector (b)"] || r.burgers || "",
      "Character": formatCharacter(r["Character"] || r.character),
      "Angle between uT and b (°)": r["Angle between uT and b (°)"] || r.ub_angle_deg || "",
      "Continuous slip-plane normal—full precision": r["Continuous slip-plane normal—full precision"] || r.slip_plane_normal || "",
      "Integer-indexed slip plane": r["Integer-indexed slip plane"] || r.slip_miller || "",
      "Closest low-index slip plane": r["Closest low-index slip plane"] || r.closest_low_index_plane_str || "",
      "Low-index plane family": r["Low-index plane family"] || r.low_index_family || "N/A",
      "Low-index deviation (°)": r["Low-index deviation (°)"] || r.low_index_deviation_deg || "N/A",
      "Slip system": r["Slip system"] || r.slip_system || "",
      "Residual": r["Residual"] || r.residual || "",
      "Status": r["Status"] || r.status || "OK",

      // Component property aliases
      pairId,
      temImage1: r["TEM Image 1"] || r.tem_image_1 || "",
      temImage2: r["TEM Image 2"] || r.tem_image_2 || "",
      zoneAxis: r["Indexed true line direction (uT)"] || r.U_miller || "",
      uNorm: r["Continuous normalized uT—full precision"] || r.U_norm || "",
      utIndexingDeviation: r["uT indexing deviation (°)"] || r.U_indexing_deviation_deg || "N/A",
      burgersVector: r["Selected Burgers vector (b)"] || r.burgers || "",
      character: formatCharacter(r["Character"] || r.character),
      ubAngle: r["Angle between uT and b (°)"] || r.ub_angle_deg || "",
      continuousSlipNormal: r["Continuous slip-plane normal—full precision"] || r.slip_plane_normal || "",
      integerIndexedSlipPlane: r["Integer-indexed slip plane"] || r.slip_miller || "",
      closestLowIndexPlane: r["Closest low-index slip plane"] || r.closest_low_index_plane_str || "",
      lowIndexFamily: r["Low-index plane family"] || r.low_index_family || "N/A",
      lowIndexDeviation: r["Low-index deviation (°)"] || r.low_index_deviation_deg || "N/A",
      slipSystem: r["Slip system"] || r.slip_system || "",
      residual: r["Residual"] || r.residual || "",
      status: r["Status"] || r.status || "OK",
    };
  });
  return { rows, downloadUrl: res.downloadUrl, rawRows: res.rows };
}

const BATCH_EXPORT_COLUMNS = [
  "Pair ID",
  "TEM Image 1",
  "TEM Image 2",
  "Indexed true line direction (uT)",
  "Continuous normalized uT—full precision",
  "uT indexing deviation (°)",
  "Selected Burgers vector (b)",
  "Character",
  "Angle between uT and b (°)",
  "Continuous slip-plane normal—full precision",
  "Integer-indexed slip plane",
  "Closest low-index slip plane",
  "Low-index plane family",
  "Low-index deviation (°)",
  "Slip system",
  "Residual",
  "Status",
];

/** Stage 8 -- export any row set as a CSV file (client-side, no backend call). */
export function exportBatchAsCsv(rows, filename = "dislocation_batch_output.csv") {
  if (!rows || rows.length === 0) return;

  const headers = BATCH_EXPORT_COLUMNS;
  const csvLines = [
    headers.join(","),
    ...rows.map((row) => headers.map((key) => JSON.stringify(row[key] ?? "")).join(",")),
  ];
  const csvContent = csvLines.join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Session lifecycle -- mirrors backend/app/routers/session_admin.py.
 *
 * Uploaded images are never retained server-side past the moment they're
 * detected (see backend/app/routers/stage1_detection.py); what persists for
 * the session's lifetime is the pipeline's derived results (lines, pairs,
 * angles, ...) in the backend's in-memory SessionStore, and, on the
 * frontend, the same data mirrored in the Project Store (project.stages).
 * Clearing results empties both; this file holds no data of its own.
 */

/** GET /api/session -- whether this session currently holds any pipeline data. */
export async function getSessionStatus() {
  return apiFetch("/api/session", { method: "GET" });
}

/**
 * DELETE /api/session -- clears the backend's in-memory results and exported
 * CSV for this session. Safe to call any time; a fresh upload afterwards
 * starts a clean session. The caller (Navbar.js) is responsible for also
 * resetting the Project Store (via resetProject()), since this file no
 * longer keeps any state of its own to reset.
 */
export async function clearSessionResults() {
  return apiFetch("/api/session", { method: "DELETE" });
}
