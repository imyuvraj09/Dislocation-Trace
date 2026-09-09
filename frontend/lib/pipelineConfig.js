/**
 * @deprecated The source of truth for pipeline stage config moved to
 * constants/pipeline.js as part of the Phase 1 architecture migration (see
 * docs/ARCHITECTURE.md). This file re-exports from there so any existing
 * imports of "@/lib/pipelineConfig" keep working unchanged. New code should
 * import from "@/constants/pipeline" directly.
 */
export { STAGES, STATUS, STAGE_IDS, TOTAL_STAGES, getStageConfig } from "@/constants/pipeline";
