import { createProject, cloneProject } from "@/models/project";
import { serializeProject, deserializeProject } from "@/services/serializer";
import { validateProjectShape } from "@/services/validation";

/**
 * ProjectManager centralizes project lifecycle operations: create, open,
 * save, close, duplicate.
 *
 * Deliberately filesystem-agnostic for Phase 1 -- there's no Electron main
 * process or Python backend yet, so `saveProject` hands back a JSON string
 * instead of writing a file, and `openProject` takes a JSON string instead
 * of a path. When the Electron shell exists, a thin adapter can wrap these
 * calls with real native save/open dialogs and `fs` reads/writes without
 * this module (or the store/hooks built on top of it) needing to change.
 */
export const projectManager = {
  /** @param {{name?: string, description?: string}} [opts] */
  createProject(opts) {
    return createProject(opts);
  },

  /** @param {string} jsonString */
  openProject(jsonString) {
    return deserializeProject(jsonString);
  },

  /**
   * @param {import("@/models/project").Project} project
   * @returns {string} the project serialized as JSON, ready to hand to a
   *   download / future `fs.writeFile` call.
   */
  saveProject(project) {
    const { valid, missing } = validateProjectShape(project);
    if (!valid) {
      throw new Error(`Cannot save an invalid project (missing ${missing.join(", ")}).`);
    }
    return serializeProject(project);
  },

  /**
   * "Closing" a project in Phase 1 just means handing back a fresh, empty
   * one. Once autosave + real fs persistence exist, this is where a
   * save-on-close would be triggered first.
   */
  closeProject() {
    return createProject();
  },

  /**
   * @param {import("@/models/project").Project} project
   * @param {Partial<import("@/models/project").ProjectMetadata>} [overrides]
   */
  duplicateProject(project, overrides = {}) {
    return cloneProject(project, { name: `${project.metadata.name} (copy)`, ...overrides });
  },
};

export default projectManager;
