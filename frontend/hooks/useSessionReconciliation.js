import { useEffect, useRef, useState } from "react";
import { getSessionStatus, clearSessionResults } from "@/lib/api";

/**
 * Reconciles the backend session with the frontend once per real page load
 * (not on every client-side route change -- this hook is meant to be used
 * once, from a component that lives in pages/_app.js's tree, like Navbar).
 *
 * The frontend's Zustand project store is never persisted (no localStorage
 * / autosave-to-disk yet -- see services/autosave.js), so a hard refresh
 * always starts the store over from a blank project. Meanwhile the backend
 * session id (lib/api.js's getSessionId()) *is* persisted in
 * sessionStorage, so a refreshed tab keeps talking to the *same* backend
 * session -- which may still be holding pipeline results from before the
 * refresh.
 *
 * Rather than leave that backend data silently orphaned and invisible (the
 * frontend has no mechanism to reconstruct its Zustand shape from it), this
 * clears it and surfaces a one-time notice, so "what's on screen" and
 * "what the server remembers" never quietly disagree. Full state
 * restoration (rehydrating the pipeline UI from backend session data after
 * a refresh) is a larger feature -- see the PR notes -- not attempted here.
 */
export function useSessionReconciliation() {
  const [notice, setNotice] = useState(null);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    (async () => {
      try {
        const status = await getSessionStatus();
        if (!status?.hasData) return;

        await clearSessionResults();
        setNotice(
          "Cleared in-progress pipeline results left over from before this page was reloaded — they hadn't been saved yet."
        );
      } catch {
        // Best-effort reconciliation only. A failed check/clear here isn't
        // worth surfacing as an error to a user who hasn't done anything
        // yet; the same cleanup will happen naturally via the backend's
        // idle-session sweep (see backend/app/session_store.py) even if
        // this call fails.
      }
    })();
  }, []);

  return { notice, dismissNotice: () => setNotice(null) };
}

export default useSessionReconciliation;
