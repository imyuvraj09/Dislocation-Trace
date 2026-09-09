/**
 * Autosave infrastructure -- scaffold only.
 *
 * This intentionally does NOT write to disk. There is no filesystem access
 * in a Next.js/browser context, and Phase 1 explicitly excludes Electron.
 * What it does do is settle the interval/dirty-checking logic now, so that
 * once an Electron main process exists, wiring real persistence is a
 * one-line change: pass a real `onSave` that calls `fs.writeFile` (or an
 * IPC call to the main process) with the serialized project.
 *
 * Usage (not currently called anywhere in the app):
 *
 *   const autosave = createAutosaveController({
 *     getSnapshot: () => projectManager.saveProject(useProjectStore.getState().project),
 *     onSave: (json) => window.electronAPI.saveProjectFile(json), // Phase 2+
 *     intervalMs: 30_000,
 *   });
 *   autosave.start();
 */
export function createAutosaveController({ getSnapshot, onSave, intervalMs = 30000 } = {}) {
  let timer = null;
  let lastSavedSnapshot = null;

  function triggerNow() {
    const snapshot = getSnapshot?.();
    if (snapshot === undefined || snapshot === lastSavedSnapshot) return;
    lastSavedSnapshot = snapshot;
    onSave?.(snapshot);
  }

  function start() {
    stop();
    timer = setInterval(triggerNow, intervalMs);
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { start, stop, triggerNow };
}

export default createAutosaveController;
