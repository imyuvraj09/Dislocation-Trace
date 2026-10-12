import Button from "@/components/ui/Button";
import DataTable from "@/components/ui/DataTable";
import Alert from "@/components/ui/Alert";
import StaleResultsNotice from "@/components/pipeline/StaleResultsNotice";
import { computeTrueLine } from "@/lib/api";
import useStage from "@/hooks/useStage";
import { useAsyncAction } from "@/hooks/useAsyncAction";

const BASE_COLUMNS = [
  { key: "pair", label: "Line pair" },
  { key: "direction", label: "Line direction", mono: true },
];

/** Stage 6 -- reconstructs the true 3-D dislocation line for every pair whose two lines both have an Up-vector solved. */
export default function Stage7TrueDislocationLine({ onComplete }) {
  const stage3 = useStage(3).data;
  const stage5 = useStage(5).data;
  const { data, update, isStale, upstreamStaleIds } = useStage(6);
  const { loading, error, run } = useAsyncAction();

  const pairs = stage3.submittedPairs ?? [];
  const readyPairs = pairs.filter(
    (p) => stage5.resultsByPairImage[`${p.pairId}::${p.image1}`] && stage5.resultsByPairImage[`${p.pairId}::${p.image2}`]
  );
  const notReadyPairs = pairs.filter((p) => !readyPairs.includes(p));
  const resultRows = data.lines.length > 0 ? data.lines : null;
  const columns = resultRows?.some((row) => row.lineIndexingDeviation != null)
    ? [
        ...BASE_COLUMNS,
        { key: "lineIndexingDeviation", label: "Indexing deviation (°)", mono: true },
      ]
    : BASE_COLUMNS;

  async function handleRun() {
    const lines = [];
    for (const p of readyPairs) {
      // eslint-disable-next-line no-await-in-loop -- sequential, one pair at a time
      const res = await run(() => computeTrueLine(p.pairId, p.image1, p.image2));
      if (res === undefined) return; // failed; error banner already shown, stop here
      lines.push(res.line);
    }
    update({ lines });
    onComplete?.({ lines });
  }

  if (pairs.length === 0) {
    return <Alert variant="warning">No confirmed line pairs yet -- complete Stage 3 first.</Alert>;
  }

  return (
    <div className="space-y-5">
      <StaleResultsNotice isStale={isStale} upstreamStaleIds={upstreamStaleIds} />
      {notReadyPairs.length > 0 && (
        <Alert variant="warning">
          {notReadyPairs.length} pair{notReadyPairs.length === 1 ? "" : "s"} still need both lines'
          Up-vectors solved (Stage 5): {notReadyPairs.map((p) => p.pairId).join(", ")}.
        </Alert>
      )}
      <Button
        onClick={handleRun}
        loading={loading}
        disabled={readyPairs.length === 0 || upstreamStaleIds.length > 0}
      >
        Reconstruct true dislocation lines
      </Button>
      <Alert variant="error" message={error} onRetry={handleRun} />
      <DataTable columns={columns} rows={resultRows} />
    </div>
  );
}
