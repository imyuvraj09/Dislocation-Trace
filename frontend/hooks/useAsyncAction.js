import { useCallback, useRef, useState } from "react";

/**
 * Transient state for a single "run this backend call" UI action --
 * loading spinner, human-readable error message, and protection against a
 * slow request's result clobbering a newer one if the user fires the
 * action again before the first resolves (e.g. double-click, or click ->
 * edit inputs -> click again).
 *
 * Deliberately separate from useStage(): useStage owns *permanent*,
 * project-scoped data (see hooks/useStage.js's own doc comment), while
 * loading/error here is purely transient per-component UI state that has
 * no reason to survive a re-render, let alone a project reload.
 *
 * Usage:
 *   const { loading, error, run, clearError } = useAsyncAction();
 *
 *   async function handleRun() {
 *     const res = await run(() => someApiCall(...));
 *     if (res === undefined) return; // request failed; `error` is already set
 *     // ...use res
 *   }
 */
export function useAsyncAction() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Bumped on every run() call so a resolving/rejecting *older* call can
  // recognize it's stale and skip updating state -- the actual race-
  // condition guard for "multiple rapid user actions".
  const runIdRef = useRef(0);

  /**
   * Runs `fn` (an async function with no args), tracking loading/error.
   * Returns fn's resolved value, or `undefined` if it threw (in which case
   * `error` will be set -- callers should treat an `undefined` return as
   * "the action failed, stop here" rather than a valid result).
   */
  const run = useCallback(async (fn) => {
    const thisRunId = ++runIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fn();
      if (runIdRef.current === thisRunId) setLoading(false);
      return result;
    } catch (err) {
      if (runIdRef.current === thisRunId) {
        setError(err?.message || "Something went wrong. Please try again.");
        setLoading(false);
      }
      return undefined;
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return { loading, error, run, clearError };
}

export default useAsyncAction;
