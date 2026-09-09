import { useCallback } from "react";
import useProjectStore, { stageStatus } from "@/store/projectStore";
import { STAGE_DEPENDENCIES } from "@/constants/pipeline";

/**
 * Scopes the global Project Store down to a single stage's permanent data.
 *
 * Every Stage*.js component should use this instead of `useState` for
 * anything that needs to survive a re-render, an accordion collapse, or a
 * project save/reload (uploaded selections, computed results, confirmed
 * choices, etc). Purely transient UI state -- a "loading" spinner while a
 * mock API call is in flight, for example -- should stay as local
 * `useState` in the component, since it has no reason to persist.
 *
 * @param {number} stageId
 */
export function useStage(stageId) {
  const data = useProjectStore((state) => state.project.stages[stageId]);
  const project = useProjectStore((state) => state.project);
  const updateStageData = useProjectStore((state) => state.updateStageData);
  const markStageComplete = useProjectStore((state) => state.markStageComplete);
  const markStageIncomplete = useProjectStore((state) => state.markStageIncomplete);

  const update = useCallback(
    (partial) => updateStageData(stageId, partial),
    [stageId, updateStageData]
  );
  const complete = useCallback(() => markStageComplete(stageId), [stageId, markStageComplete]);
  const reopen = useCallback(() => markStageIncomplete(stageId), [stageId, markStageIncomplete]);

  const staleStages = project.pipeline.staleStages;
  // Direct dependencies that are themselves still stale -- i.e. recomputing
  // this stage right now would build on results the user hasn't refreshed
  // yet. Stage components use this to warn (or block) rather than let a
  // "recompute" produce a result that looks fresh but isn't.
  const upstreamStaleIds = (STAGE_DEPENDENCIES[stageId] ?? []).filter((id) => staleStages.includes(id));

  return {
    /** This stage's slice of `project.stages`, e.g. `{ angles: [...] }` for Stage 4. */
    data,
    /** Shallow-merges a partial update into this stage's data. */
    update,
    /** Marks this stage complete in the pipeline (and clears its own stale flag, if any). */
    complete,
    /** Marks this stage incomplete again (e.g. after editing an already-completed stage). */
    reopen,
    status: stageStatus(project, stageId),
    isComplete: project.pipeline.completedStages.includes(stageId),
    /** True if this stage's own displayed results were computed from input that's since changed upstream. */
    isStale: staleStages.includes(stageId),
    /** This stage's direct dependencies (constants/pipeline.js's STAGE_DEPENDENCIES) that are themselves still stale. */
    upstreamStaleIds,
  };
}

export default useStage;
