import { useState, useEffect } from "react";
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
function ClearResultsButton({ isMobile = false, onCleared }) {
  const resetProject = useProjectStore((state) => state.resetProject);
  const [status, setStatus] = useState("idle"); // idle | confirming | clearing | error
  const [errorMessage, setErrorMessage] = useState("");

  async function handleConfirm() {
    setStatus("clearing");
    setErrorMessage("");
    try {
      await clearSessionResults();
      resetProject();
      setStatus("idle");
      onCleared?.();
    } catch (err) {
      setStatus("error");
      setErrorMessage(err?.message || "Failed to clear results.");
    }
  }

  if (status === "confirming") {
    return (
      <div className={`flex flex-wrap items-center gap-2 rounded-md border border-line px-2.5 py-1.5 ${isMobile ? "w-full justify-between" : "ml-2"}`}>
        <span className="text-xs text-muted">Clear all results?</span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleConfirm}
            className="rounded px-2.5 py-1.5 text-xs font-medium text-err hover:bg-err/10 min-h-[36px]"
          >
            Yes, clear
          </button>
          <button
            type="button"
            onClick={() => setStatus("idle")}
            className="rounded px-2.5 py-1.5 text-xs font-medium text-muted hover:bg-surfaceAlt min-h-[36px]"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${isMobile ? "w-full" : "ml-2"}`}>
      <button
        type="button"
        onClick={() => setStatus("confirming")}
        disabled={status === "clearing"}
        title="Clears this session's pipeline results from the server and this browser tab"
        className={`rounded-md border border-line px-3.5 py-2 text-sm font-medium text-muted transition-colors hover:border-lineStrong hover:text-ink disabled:cursor-not-allowed disabled:opacity-60 min-h-[40px] ${
          isMobile ? "w-full text-left" : ""
        }`}
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
  const [isOpen, setIsOpen] = useState(false);

  // Close mobile menu on navigation
  useEffect(() => {
    function handleRouteChange() {
      setIsOpen(false);
    }
    router.events?.on("routeChangeStart", handleRouteChange);
    return () => {
      router.events?.off("routeChangeStart", handleRouteChange);
    };
  }, [router]);

  // Close mobile menu on Escape key
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen]);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-3 focus-visible:outline-beam-500 rounded-md py-1"
          onClick={() => setIsOpen(false)}
        >
          {/* Mark: a stylized zone-axis / diffraction-spot glyph */}
          <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-beam-gradient">
            <span className="h-2 w-2 rounded-full bg-white" />
            <span className="absolute h-5 w-5 rounded-full border border-white/50" />
          </span>
          <span className="font-display text-[15px] font-semibold tracking-tight text-ink">
            Dislocation <span className="text-beam-500">Trace</span>
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1" aria-label="Main Navigation">
          {LINKS.map((link) => {
            const active = router.pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-md px-3.5 py-2 text-sm font-medium transition-colors ${
                  active
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
            className="ml-2 rounded-md border border-line px-3.5 py-2 text-sm font-medium text-muted hover:border-lineStrong hover:text-ink min-h-[38px] inline-flex items-center"
          >
            GitHub ↗
          </a>
        </nav>

        {/* Mobile menu toggle button */}
        <div className="flex md:hidden items-center">
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            aria-expanded={isOpen}
            aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
            className="flex h-11 w-11 items-center justify-center rounded-md border border-line text-ink hover:bg-surfaceAlt transition-colors focus-visible:outline-beam-500"
          >
            {isOpen ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="7" x2="20" y2="7" />
                <line x1="4" y1="12" x2="20" y2="12" />
                <line x1="4" y1="17" x2="20" y2="17" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Accessible mobile menu dropdown */}
      {isOpen && (
        <div className="border-t border-line bg-surface px-4 py-4 md:hidden shadow-lg animate-in slide-in-from-top-1">
          <nav className="flex flex-col gap-2" aria-label="Mobile Navigation">
            {LINKS.map((link) => {
              const active = router.pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setIsOpen(false)}
                  className={`rounded-md px-3.5 py-2.5 text-base font-medium transition-colors min-h-[44px] flex items-center ${
                    active
                      ? "bg-beam-50 text-beam-700 font-semibold"
                      : "text-muted hover:bg-surfaceAlt hover:text-ink"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
            <div className="my-1 border-t border-line" />
            <div className="pt-1">
              <ClearResultsButton isMobile onCleared={() => setIsOpen(false)} />
            </div>
            <a
              href="https://github.com/imyuvraj09/IISc-Research-Internshipp"
              target="_blank"
              rel="noreferrer"
              onClick={() => setIsOpen(false)}
              className="mt-1 flex items-center justify-between rounded-md border border-line px-3.5 py-2.5 text-base font-medium text-muted hover:border-lineStrong hover:text-ink min-h-[44px]"
            >
              <span>GitHub</span>
              <span className="text-sm">↗</span>
            </a>
          </nav>
        </div>
      )}

      {notice && (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 pb-3">
          <Alert variant="info" message={notice} onDismiss={dismissNotice} />
        </div>
      )}
    </header>
  );
}
