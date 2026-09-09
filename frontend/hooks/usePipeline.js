import useProjectStore, { stageStatus } from "@/store/projectStore";
import { STAGES, TOTAL_STAGES } from "@/constants/pipeline";

/**
 * Everything PipelineTimeline (and anything else showing pipeline-wide
 * progress/navigation) needs, read from the global Project Store.
 *
 * PipelineTimeline used to own `expandedId` / `statusById` as local
 * `useState`. That state now lives on `project.pipeline` in the store, so
 * this hook is the only thing the timeline needs -- it should hold no
 * state of its own beyond what a component derives for its own rendering.
 */
export function usePipeline() {
  const project = useProjectStore((state) => state.project);
  const setExpandedStage = useProjectStore((state) => state.setExpandedStage);
  const setCurrentStage = useProjectStore((state) => state.setCurrentStage);
  const markStageComplete = useProjectStore((state) => state.markStageComplete);

  const { pipeline } = project;

  return {
    stages: STAGES,
    totalStages: TOTAL_STAGES,

    currentStage: pipeline.currentStage,
    expandedStage: pipeline.expandedStage,
    completedStages: pipeline.completedStages,
    completedCount: pipeline.completedStages.length,
    progress: pipeline.progress,

    isExpanded: (stageId) => pipeline.expandedStage === stageId,
    statusOf: (stageId) => stageStatus(project, stageId),
    isComplete: (stageId) => pipeline.completedStages.includes(stageId),

    /** Expands/collapses a stage's panel and makes it the active stage. */
    toggleStage: (stageId) => {
      setExpandedStage(stageId);
      setCurrentStage(stageId);
    },

    completeStage: markStageComplete,
  };
}

export default usePipeline;
