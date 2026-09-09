const STYLES = {
  pending: "bg-surfaceAlt text-subtle",
  in_progress: "bg-zone-500/10 text-zone-600",
  complete: "bg-beam-50 text-beam-700",
  stale: "bg-warn/10 text-warn",
};

const LABELS = {
  pending: "Not started",
  in_progress: "In progress",
  complete: "Complete",
  stale: "Needs recompute",
};

export default function Badge({ status = "pending" }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${STYLES[status]}`}
    >
      {LABELS[status]}
    </span>
  );
}
