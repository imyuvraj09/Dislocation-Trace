import Badge from "@/components/ui/Badge";

export default function StagePanel({ stage, status, expanded, onToggle, children }) {
  return (
    <div
      className={`overflow-hidden rounded-xl border bg-surface shadow-panel transition-colors ${
        expanded ? "border-beam-300" : "border-line"
      }`}
    >
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="font-mono text-xs text-subtle">
            {String(stage.id).padStart(2, "0")}
          </span>
          <div>
            <h3 className="text-[15px] font-semibold text-ink">{stage.title}</h3>
            <p className="mt-0.5 hidden max-w-xl text-sm text-muted sm:block whitespace-pre-line">
              {typeof stage.summary === "string" && stage.summary.includes("uₚ") ? (
                <>
                  {stage.summary.split("uₚ")[0]}
                  u<sub>p</sub>
                  {stage.summary.split("uₚ")[1]}
                </>
              ) : (
                stage.summary
              )}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <Badge status={status} />
          <svg
            viewBox="0 0 20 20"
            className={`h-4 w-4 text-subtle transition-transform ${
              expanded ? "rotate-180" : ""
            }`}
          >
            <path
              d="M5 7.5 10 12.5 15 7.5"
              stroke="currentColor"
              strokeWidth="1.6"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-line px-5 py-6">{children}</div>
      )}
    </div>
  );
}
