import { STAGES } from "@/constants/pipeline";

/**
 * One validator per stage: given that stage's data and the full project
 * (for cross-stage lookups, e.g. Stage 2 checking Stage 1's detected
 * images), return `true` if it's complete/valid, or a human-readable error
 * string if not.
 */
const STAGE_VALIDATORS = {
  1: (data, project) =>
    (project.images.tem.length > 0 && project.images.diffraction.length > 0) ||
    "At least one TEM image and one diffraction image are required.",
  2: (data, project) => {
    const materialId = project.material?.id;
    if (!materialId) return "Select a material / crystal structure first.";
    const isHcp = materialId === "HCP_Hexagonal_Close_Packed";
    const needsCOverA = isHcp || materialId.toLowerCase().includes("tetragonal");
    if (needsCOverA && (!(Number(project.material?.cOverA) > 0) || !Number.isFinite(Number(project.material?.cOverA)))) {
      return "Enter a finite positive c/a ratio for the selected crystal structure.";
    }
    const temImages = project.stages[1]?.temImages ?? [];
    if (temImages.length === 0) return "Complete Stage 1 first.";
    const incomplete = temImages.filter((t) => {
      const z = data.zoneAxisByTemImage[t.image];
      const keys = isHcp ? ["h", "k", "i", "l"] : ["h", "k", "l"];
      return !z || keys.some((key) => z[key] === "" || z[key] == null) || !z.diffImage;
    });
    return (
      incomplete.length === 0 ||
      `Zone axis and diffraction image still needed for: ${incomplete.map((t) => t.image).join(", ")}.`
    );
  },
  3: (data) => (data.submittedPairs?.length ?? 0) > 0 || "Submit at least one line pair.",
  4: (data) => (data.angles?.length ?? 0) > 0 || "Assign g-vectors and compute trace angles first.",
  5: (data) => Object.keys(data.resultsByPairImage ?? {}).length > 0 || "Solve at least one Up-vector.",
  6: (data) => (data.lines?.length ?? 0) > 0 || "Reconstruct dislocation lines first.",
  7: (data, project) => {
    const pairs = project.stages[3]?.submittedPairs ?? [];
    if (pairs.length === 0) return "Submit line pairs first.";
    const stage6Lines = project.stages[6]?.lines ?? [];
    if (stage6Lines.length === 0) return "Reconstruct true dislocation lines first.";
    const burgersByPair = project.material?.burgersByPair ?? {};
    const selectedBurgers = project.material?.selectedBurgersVector;
    const classifications = data.classificationsByPair ?? {};
    const rows = data.rows ?? [];
    if (rows.length > 0) return true;

    const problems = [];
    for (const p of pairs) {
      const b = burgersByPair[p.pairId] || selectedBurgers;
      if (!b) {
        problems.push(`Pair ${p.pairId}: enter or select a Burgers vector.`);
        continue;
      }
      if (!classifications[p.pairId]) {
        problems.push(`Pair ${p.pairId}: calculate classification.`);
      }
    }
    return problems.length === 0 || problems.join(" ");
  },
  8: (data) => (data.rows?.length ?? 0) > 0 || "No batch rows available to export.",
};

/**
 * Validates a single stage's data against its rule in {@link STAGE_VALIDATORS}.
 * @param {number} stageId
 * @param {import("@/models/project").Project} project
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateStage(stageId, project) {
  const validator = STAGE_VALIDATORS[stageId];
  if (!validator) return { valid: true, errors: [] };

  const result = validator(project.stages[stageId], project);
  return result === true ? { valid: true, errors: [] } : { valid: false, errors: [result] };
}

/**
 * Validates every stage in a project. Used before export, and available for
 * a future "project health" panel.
 * @param {import("@/models/project").Project} project
 * @returns {{valid: boolean, errors: Array<{stageId: number, title: string, messages: string[]}>}}
 */
export function validateProject(project) {
  const errors = [];
  for (const stage of STAGES) {
    const { valid, errors: stageErrors } = validateStage(stage.id, project);
    if (!valid) errors.push({ stageId: stage.id, title: stage.title, messages: stageErrors });
  }
  return { valid: errors.length === 0, errors };
}

/** The top-level keys every Project must have. Used to sanity-check files on import. */
const REQUIRED_PROJECT_KEYS = [
  "metadata",
  "pipeline",
  "images",
  "annotations",
  "stages",
  "settings",
  "exports",
  "history",
];

/**
 * Cheap structural check -- "does this look like a Project object at all" --
 * as opposed to {@link validateProject}, which checks whether the pipeline
 * data itself is complete. Used by the serializer when opening a file.
 * @param {unknown} project
 * @returns {{valid: boolean, missing: string[]}}
 */
export function validateProjectShape(project) {
  const missing = REQUIRED_PROJECT_KEYS.filter((key) => !(project && key in project));
  return { valid: missing.length === 0, missing };
}
