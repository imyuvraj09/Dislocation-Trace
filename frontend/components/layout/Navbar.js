import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import useProjectStore from "@/store/projectStore";
import { clearSessionResults } from "@/lib/api";
import { useSessionReconciliation } from "@/hooks/useSessionReconciliation";
import Alert from "@/components/ui/Alert";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/about", label: "About" },
];

/**
 * "Clear results" -- lets the user wipe this session's pipeline results
 * (backend in-memory state + exported CSV, and the local project store)
 * on demand, rather than waiting for the backend's idle-session timeout.
 * See backend/app/routers/session_admin.py for what actually gets cleared.
 */
function ClearResultsButton() {
  const resetProject = useProjectStore((state) => state.resetProject);
  const [status, setStatus] = useState("idle"); // idle | confirming | clearing | error
  const [errorMessage, setErrorMessage] = useState("");

  async function handleConfirm() {
    // Guards against a double-click firing two overlapping clears: once
    // status flips to "clearing" the button below is disabled, so a second
    // handleConfirm can't start until this one settles.
    setStatus("clearing");
    setErrorMessage("");
    try {
      await clearSessionResults();
      resetProject();
      setStatus("idle");
    } catch (err) {
      setStatus("error");
      setErrorMessage(err?.message || "Failed to clear results.");
    }
  }

  if (status === "confirming") {
    return (
      <div className="ml-2 flex items-center gap-1.5 rounded-md border border-line px-2 py-1.5">
        <span className="px-1 text-xs text-muted">Clear all results?</span>
        <button
          type="button"
          onClick={handleConfirm}
          className="rounded px-2 py-1 text-xs font-medium text-err hover:bg-err/10"
        >
          Yes, clear
        </button>
        <button
          type="button"
          onClick={() => setStatus("idle")}
          className="rounded px-2 py-1 text-xs font-medium text-muted hover:bg-surfaceAlt"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="ml-2 flex items-center gap-2">
      <button
        type="button"
        onClick={() => setStatus("confirming")}
        disabled={status === "clearing"}
        title="Clears this session's pipeline results from the server and this browser tab"
        className="rounded-md border border-line px-3.5 py-2 text-sm font-medium text-muted transition-colors hover:border-lineStrong hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "clearing" ? "Clearing…" : "Clear results"}
      </button>
      {status === "error" && (
        <span className="text-xs text-err" role="alert">
          {errorMessage}
        </span>
      )}
    </div>
  );
}

export default function Navbar() {
  const router = useRouter();
  const { notice, dismissNotice } = useSessionReconciliation();

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-3">
          {/* Mark: a stylized zone-axis / diffraction-spot glyph, doubles as
              the node marker used throughout the pipeline timeline. */}
          <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-beam-gradient">
            <span className="h-2 w-2 rounded-full bg-white" />
            <span className="absolute h-5 w-5 rounded-full border border-white/50" />
          </span>
          <span className="font-display text-[15px] font-semibold tracking-tight text-ink">
            Dislocation <span className="text-beam-500">Trace</span>
          </span>
        </Link>

        <nav className="flex items-center gap-1">
          {LINKS.map((link) => {
            const active = router.pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3.5 py-2 text-sm font-medium transition-colors ${active
                    ? "bg-beam-50 text-beam-700"
                    : "text-muted hover:bg-surfaceAlt hover:text-ink"
                  }`}
              >
                {link.label}
              </Link>
            );
          })}
          <ClearResultsButton />
          <a
            href="https://github.com/imyuvraj09/IISc-Research-Internshipp"
            target="_blank"
            rel="noreferrer"
            className="ml-2 rounded-md border border-line px-3.5 py-2 text-sm font-medium text-muted hover:border-lineStrong hover:text-ink"
          >
            GitHub ↗
          </a>
        </nav>
      </div>

      {notice && (
        <div className="mx-auto max-w-7xl px-6 pb-3">
          <Alert variant="info" message={notice} onDismiss={dismissNotice} />
        </div>
      )}
    </header>
  );
}
