/**
 * Mock data for the standalone UI review.
 *
 * Every shape here mirrors what the real backend endpoints are expected to
 * return (see lib/api.js). When the backend is ready, only lib/api.js needs
 * to change -- these shapes double as informal API contracts.
 */

export const MOCK_IMAGES = [
  {
    id: "img-001",
    type: "TEM",
    filename: "foil_A_g200_BF.tif",
    width: 2048,
    height: 2048,
    uploadedAt: "2026-06-14T09:12:00Z",
  },
  {
    id: "img-002",
    type: "Diffraction",
    filename: "foil_A_g200_SAED.tif",
    width: 1024,
    height: 1024,
    uploadedAt: "2026-06-14T09:12:41Z",
  },
];

export const MOCK_LINE_PAIRS = [
  { id: "p1", imageA: "foil_A_g200_BF.tif", lineA: "L1", imageB: "foil_A_g111_BF.tif", lineB: "L1'", confidence: 0.94 },
  { id: "p2", imageA: "foil_A_g200_BF.tif", lineA: "L2", imageB: "foil_A_g111_BF.tif", lineB: "L2'", confidence: 0.88 },
  { id: "p3", imageA: "foil_A_g200_BF.tif", lineA: "L3", imageB: "foil_A_g111_BF.tif", lineB: "L3'", confidence: 0.71 },
];

export const MOCK_ANGLES = [
  { id: "p1", pair: "L1 / L1'", gVector: "[200]", angleDeg: 34.2, referenceDeg: 0.0 },
  { id: "p2", pair: "L2 / L2'", gVector: "[200]", angleDeg: 61.7, referenceDeg: 0.0 },
  { id: "p3", pair: "L3 / L3'", gVector: "[111]", angleDeg: 12.9, referenceDeg: 0.0 },
];

export const MOCK_G_VECTOR_CANDIDATES = [
  { id: "g1", image: "foil_A_g200_SAED.tif", indices: "[2 0 0]", dSpacingA: 2.03, intensity: "strong", suggested: true },
  { id: "g2", image: "foil_A_g200_SAED.tif", indices: "[0 2 0]", dSpacingA: 2.03, intensity: "weak", suggested: false },
  { id: "g3", image: "foil_A_g111_SAED.tif", indices: "[1 1 1]", dSpacingA: 2.35, intensity: "strong", suggested: true },
];

export const MOCK_UP_VECTOR_RESULT = {
  upVector: "[0.12  0.98  0.04]",
  method: "Two-tilt g-vector cross product",
  residualDeg: 0.6,
  inputsUsed: ["[2 0 0]", "[1 1 1]"],
};

export const MOCK_TRUE_LINES = [
  { id: "d1", pair: "L1 / L1'", direction: "[1 1 0]", magnitudeNm: 182.4, planeIndex: "(1 1 1)" },
  { id: "d2", pair: "L2 / L2'", direction: "[0 1 1]", magnitudeNm: 96.1, planeIndex: "(1 1 1)" },
  { id: "d3", pair: "L3 / L3'", direction: "[1 0 1]", magnitudeNm: 211.7, planeIndex: "(1 -1 1)" },
];

export const MOCK_CLASSIFICATION = [
  { id: "d1", direction: "[1 1 0]", character: "Screw", slipSystem: "(111)[1 -1 0]", confidence: 0.91 },
  { id: "d2", direction: "[0 0 1]", character: "Mixed-Screw-Dominant", slipSystem: "(111)[0 1 -1]", confidence: 0.77 },
  { id: "d3", direction: "[1 0 1]", character: "Edge", slipSystem: "(1 -1 1)[1 0 -1]", confidence: 0.85 },
];

export const MOCK_BATCH_ROWS = MOCK_CLASSIFICATION.map((row, i) => ({
  ...row,
  sample: "Foil A",
  pair: MOCK_TRUE_LINES[i].pair,
  magnitudeNm: MOCK_TRUE_LINES[i].magnitudeNm,
}));
