/**
 * Generic four-region workspace shell: a left sidebar, a central viewer
 * column, a right inspector panel, and a status bar docked under the
 * central column.
 *
 * This is exactly the Image Workspace's layout -- the grid/columns/
 * borders/sizing are unchanged from before this refactor, just moved here
 * verbatim so the shell itself is a reusable, image-agnostic component
 * (props in, no image-specific logic) rather than markup inlined in
 * `ImageViewer`. Any future non-image workspace (or a Phase 3 annotation
 * mode that wants the same sidebar/viewer/inspector/status-bar shape) can
 * reuse this without copying markup.
 *
 * @param {{sidebar: React.ReactNode, viewer: React.ReactNode, inspector: React.ReactNode, statusBar: React.ReactNode}} props
 */
export default function WorkspaceLayout({ sidebar, viewer, inspector, statusBar }) {
  return (
    <div className="grid h-[640px] grid-cols-[240px_1fr_260px] overflow-hidden rounded-xl border border-line bg-surface shadow-panel">
      <aside className="border-r border-line">{sidebar}</aside>

      <section className="flex min-w-0 flex-col">
        {viewer}
        {statusBar}
      </section>

      <aside className="scroll-thin flex min-h-0 flex-col divide-y divide-line overflow-y-auto border-l border-line">
        {inspector}
      </aside>
    </div>
  );
}
