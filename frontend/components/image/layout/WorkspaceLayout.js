import { useState } from "react";

/**
 * Generic four-region workspace shell: a left sidebar, a central viewer
 * column, a right inspector panel, and a status bar docked under the
 * central column.
 *
 * Responsive layout:
 * - On desktop (lg and up): 3-column grid [240px_1fr_260px] with fixed 640px height.
 * - On mobile & tablet (< lg): Tab switcher allowing the user to focus on
 *   the canvas without squeezing it, while keeping Images and Inspect panels
 *   easily accessible in full width.
 *
 * @param {{sidebar: React.ReactNode, viewer: React.ReactNode, inspector: React.ReactNode, statusBar: React.ReactNode}} props
 */
export default function WorkspaceLayout({ sidebar, viewer, inspector, statusBar }) {
  const [mobileTab, setMobileTab] = useState("canvas"); // "canvas" | "images" | "inspector"

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-panel lg:grid lg:h-[640px] lg:grid-cols-[240px_1fr_260px]">
      {/* Mobile / Tablet View Switcher (< lg) */}
      <div
        className="flex border-b border-line bg-surfaceAlt lg:hidden"
        role="tablist"
        aria-label="Workspace view selector"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === "canvas"}
          onClick={() => setMobileTab("canvas")}
          className={`flex-1 py-2.5 px-3 text-xs sm:text-sm font-medium text-center transition-colors min-h-[44px] flex items-center justify-center gap-1.5 ${
            mobileTab === "canvas"
              ? "border-b-2 border-beam-500 text-beam-700 bg-surface font-semibold"
              : "text-muted hover:text-ink"
          }`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          Canvas &amp; Tools
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === "images"}
          onClick={() => setMobileTab("images")}
          className={`flex-1 py-2.5 px-3 text-xs sm:text-sm font-medium text-center transition-colors min-h-[44px] flex items-center justify-center gap-1.5 ${
            mobileTab === "images"
              ? "border-b-2 border-beam-500 text-beam-700 bg-surface font-semibold"
              : "text-muted hover:text-ink"
          }`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
          Images
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === "inspector"}
          onClick={() => setMobileTab("inspector")}
          className={`flex-1 py-2.5 px-3 text-xs sm:text-sm font-medium text-center transition-colors min-h-[44px] flex items-center justify-center gap-1.5 ${
            mobileTab === "inspector"
              ? "border-b-2 border-beam-500 text-beam-700 bg-surface font-semibold"
              : "text-muted hover:text-ink"
          }`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          Inspect Panel
        </button>
      </div>

      {/* Left sidebar (Image Browser) */}
      <aside className={`border-r border-line ${mobileTab === "images" ? "block h-[500px] sm:h-[560px]" : "hidden"} lg:block lg:h-full lg:overflow-hidden`}>
        {sidebar}
      </aside>

      {/* Center viewer & status bar */}
      <section className={`flex min-w-0 flex-col ${mobileTab === "canvas" ? "flex h-[500px] sm:h-[560px]" : "hidden"} lg:flex lg:h-full`}>
        {viewer}
        {statusBar}
      </section>

      {/* Right inspector panel */}
      <aside className={`scroll-thin min-h-0 flex-col divide-y divide-line overflow-y-auto border-l border-line ${mobileTab === "inspector" ? "flex h-[500px] sm:h-[560px]" : "hidden"} lg:flex lg:h-full`}>
        {inspector}
      </aside>
    </div>
  );
}
