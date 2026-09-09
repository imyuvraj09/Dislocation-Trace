import usePipeline from "@/hooks/usePipeline";
import StageNode from "@/components/pipeline/StageNode";
import StagePanel from "@/components/pipeline/StagePanel";

import Stage1ImageDetection from "@/components/pipeline/stages/Stage1ImageDetection";
import Stage2MillerIndex from "@/components/pipeline/stages/Stage2MillerIndex";
import Stage3LinePairing from "@/components/pipeline/stages/Stage3LinePairing";
import Stage4AngleComputation from "@/components/pipeline/stages/Stage4AngleComputation";
import Stage6UpVectorSolving from "@/components/pipeline/stages/Stage6UpVectorSolving";
import Stage7TrueDislocationLine from "@/components/pipeline/stages/Stage7TrueDislocationLine";
import Stage9BatchOutput from "@/components/pipeline/stages/Stage9BatchOutput";

// Maps stage id (constants/pipeline.js) -> the interaction component mounted
// inside its panel. Classification has been moved out of the pipeline into
// its own dedicated g·b Explorer section on the pipeline page.
const STAGE_COMPONENTS = {
  1: Stage1ImageDetection,
  2: Stage2MillerIndex,
  3: Stage3LinePairing,
  4: Stage4AngleComputation,
  5: Stage6UpVectorSolving,
  6: Stage7TrueDislocationLine,
  7: Stage9BatchOutput,
};

/**
 * Renders the 8-stage accordion timeline.
 *
 * This component used to own `expandedId` and `statusById` as local
 * `useState` -- that made the pipeline's position and completion state
 * invisible to the rest of the app (e.g. a project sidebar, autosave, or a
 * future "jump to stage" command couldn't see or drive it). All of that now
 * lives on the global Project Store, reached here via `usePipeline()`, so
 * this component is nearly stateless: it just maps store state to markup.
 */
export default function PipelineTimeline({ excludeStage1 = false }) {
  const {
    stages,
    totalStages,
    completedCount,
    statusOf,
    isExpanded,
    toggleStage,
    completeStage,
  } = usePipeline();

  const displayedStages = excludeStage1
    ? stages.filter((s) => s.id !== 1)
    : stages;

  return (
    <div>
      {/* Progress summary */}
      <div className="mb-8 flex items-center justify-between rounded-xl border border-line bg-surface px-5 py-4 shadow-panel">
        <div>
          <p className="text-sm font-medium text-ink">Pipeline progress</p>
          <p className="text-xs text-subtle">
            {completedCount} of {totalStages} stages complete
          </p>
        </div>
        <div className="h-2 w-40 overflow-hidden rounded-full bg-surfaceAlt">
          <div
            className="h-full rounded-full bg-beam-gradient transition-all"
            style={{ width: `${(completedCount / totalStages) * 100}%` }}
          />
        </div>
      </div>

      <div className="relative">
        {/* The beam line -- a continuous rail behind every node, evoking the
            electron beam column the whole analysis is built around. */}
        <div className="absolute left-5 top-5 bottom-5 w-px bg-gradient-to-b from-beam-500 via-beam-300 to-line" />

        <ol className="space-y-5">
          {displayedStages.map((stage) => {
            const StageComponent = STAGE_COMPONENTS[stage.id];
            const expanded = isExpanded(stage.id);
            return (
              <li key={stage.id} className="relative flex gap-4">
                <div className="relative z-10">
                  <StageNode status={statusOf(stage.id)} active={expanded} />
                </div>
                <div className="flex-1">
                  <StagePanel
                    stage={stage}
                    status={statusOf(stage.id)}
                    expanded={expanded}
                    onToggle={() => toggleStage(stage.id)}
                  >
                    <StageComponent onComplete={() => completeStage(stage.id)} />
                  </StagePanel>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
