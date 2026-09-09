import useProjectStore from "@/store/projectStore";
import { projectManager } from "@/services/projectManager";

/**
 * Project-level lifecycle operations (create / open / save / duplicate /
 * close), bound to the global Project Store. UI that needs to act on "the
 * project" as a whole (a future File menu, project switcher, etc.) should
 * go through this hook rather than importing projectManager + the store
 * separately.
 */
export function useProject() {
  const project = useProjectStore((state) => state.project);
  const isDirty = useProjectStore((state) => state.isDirty);
  const setProject = useProjectStore((state) => state.setProject);
  const updateMetadata = useProjectStore((state) => state.updateMetadata);

  return {
    project,
    metadata: project.metadata,
    isDirty,

    updateMetadata,

    createProject: (opts) => setProject(projectManager.createProject(opts)),

    /** @param {string} jsonString A previously-saved project, as JSON. */
    openProject: (jsonString) => setProject(projectManager.openProject(jsonString)),

    /** Returns the current project serialized as a JSON string. Does not touch the filesystem (see services/projectManager.js). */
    saveProject: () => projectManager.saveProject(project),

    duplicateProject: () => setProject(projectManager.duplicateProject(project)),

    closeProject: () => setProject(projectManager.closeProject()),
  };
}

export default useProject;
