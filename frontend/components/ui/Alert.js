/**
 * Single shared banner for every stage's error / warning / success / info
 * messaging, so each stage stops hand-rolling its own colored div/span for
 * "detection succeeded", "saved", "failed, retry?", etc.
 *
 * Accepts either a plain string via `message`, or arbitrary JSX via
 * `children` (e.g. Stage1's success banner links to /workspace) -- children
 * takes precedence if both are given. Renders nothing if there's no content,
 * so callers can pass a possibly-null message/condition unconditionally:
 *
 *   <Alert variant="error" message={error} onRetry={handleRun} />
 *   <Alert variant="success">
 *     Saved. Continue to <Link href="/next">Next Stage</Link>.
 *   </Alert>
 */
const VARIANT_STYLES = {
  error: {
    container: "border-err/20 bg-err/5 text-err",
    action: "border-err/30 text-err hover:bg-err/10",
    role: "alert",
  },
  warning: {
    container: "border-warn/20 bg-warn/5 text-warn",
    action: "border-warn/30 text-warn hover:bg-warn/10",
    role: "status",
  },
  success: {
    container: "border-beam-100 bg-beam-50 text-beam-700",
    action: "border-beam-300 text-beam-700 hover:bg-beam-100",
    role: "status",
  },
  info: {
    container: "border-line bg-surfaceAlt text-muted",
    action: "border-lineStrong text-muted hover:bg-surface",
    role: "status",
  },
};

export default function Alert({
  variant = "info",
  message,
  children,
  onRetry,
  onDismiss,
  className = "",
}) {
  const content = children ?? message;
  if (!content) return null;

  const styles = VARIANT_STYLES[variant] ?? VARIANT_STYLES.info;
  const hasActions = Boolean(onRetry || onDismiss);

  return (
    <div
      role={styles.role}
      className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${styles.container} ${className}`}
    >
      <span>{content}</span>
      {hasActions && (
        <div className="flex shrink-0 items-center gap-2">
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium ${styles.action}`}
            >
              Retry
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Dismiss"
              className={`rounded-md border px-2.5 py-1 text-xs font-medium ${styles.action}`}
            >
              Dismiss
            </button>
          )}
        </div>
      )}
    </div>
  );
}
