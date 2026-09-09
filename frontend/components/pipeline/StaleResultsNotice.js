import Alert from "@/components/ui/Alert";
import { getStageConfig } from "@/constants/pipeline";

/**
 * Renders the appropriate stale-results warning for a stage, given what
 * `useStage()` reports. Two distinct cases:
 *
 * - `upstreamStaleIds` non-empty: a stage this one depends on is itself
 *   still stale -- recomputing *this* stage right now would build on
 *   outdated input and produce a result that looks fresh but isn't. The
 *   primary action should be disabled until the listed stage(s) are
 *   resolved (the calling stage component is responsible for that; this
 *   component only renders the explanation).
 * - `isStale` alone: this stage's own results were computed from input
 *   that's since changed. They're still shown below (never discarded),
 *   just no longer trustworthy as current -- recomputing here is exactly
 *   what clears this.
 *
 * Renders nothing if neither applies.
 */
export default function StaleResultsNotice({ isStale, upstreamStaleIds = [] }) {
  if (upstreamStaleIds.length > 0) {
    const names = upstreamStaleIds
      .map((id) => getStageConfig(id)?.title ?? `Stage ${id}`)
      .join(", ");
    return (
      <Alert variant="warning">
        {names} still need to be recomputed first -- their results changed, and this stage depends
        on them. Resolve that before recomputing here.
      </Alert>
    );
  }

  if (isStale) {
    return (
      <Alert variant="warning">
        Upstream input changed since these results were computed. They&apos;re kept below for
        reference, but are no longer current -- recompute to refresh them.
      </Alert>
    );
  }

  return null;
}
