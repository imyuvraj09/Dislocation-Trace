# CrystalTrace — Phase 1 Architecture

This document explains the internal architecture introduced in Phase 1. It
does not cover UI/visual decisions (unchanged) — only how data flows and is
owned.

## Why this shape

CrystalTrace is headed toward: an Electron desktop shell, a Python backend
(OpenCV/NumPy/SciPy/PyTorch), large image datasets, long-running jobs,
project save/load, an image annotation engine, and a plugin system. None of
those are built in Phase 1, but the architecture is chosen so each one is an
additive change later, not a rewrite:

- A **single global Project object** (not nine independent component
  states) is what gets serialized to a `.crystaltrace` project file, sent to
  a Python backend, or diffed for undo/redo — all Phase 2+ concerns that
  need one canonical snapshot of "the work," not nine.
- **Images live outside any one stage's data** because the future Image
  Viewer / annotation engine needs to reference the same image whether the
  user is on Stage 1, 3, or 7.
- **Services are separated from the store** (`services/` vs `store/`) so
  the Electron `fs` / Python API integration in later phases only touches
  `services/`, never component code or the store's shape.

## Layers

```
constants/   Static config: pipeline stage list, schema version.
models/      Plain data shapes + factory functions (Project, Stage). No React, no I/O.
store/       Zustand store: the ONE source of truth for the live Project.
services/    Stateless operations on a Project: create/open/save, (de)serialize, validate, autosave scaffold.
hooks/       React bindings on top of the store, scoped to what a component needs (useProject / usePipeline / useStage).
components/  Unchanged UI, now reading/writing through hooks instead of useState.
```

Data flows one way: `constants` inform `models`, `models` define what
`store` holds, `services` operate on what the store holds, `hooks` expose
store + services to `components`.

## The Project Store is the only source of truth

Before: each `Stage*.js` component had its own `useState` for its results,
and `PipelineTimeline.js` had its own `useState` for which stage was
expanded and which stages were complete. None of that survived a remount,
and nothing outside the component tree could see it.

After: all of it lives on one object, `project`, held by
`store/projectStore.js` (Zustand). Stage components and the timeline read
and write through hooks; they hold no permanent state themselves.

**What stays as local `useState`:** anything with no reason to survive a
re-render — a spinner while a mock API call is in flight, essentially. Every
stage component still has a `loading` (or `submitting`/`confirming`)
`useState` for exactly this. Nothing else does.

## The Project model

`models/project.js` defines the shape (see the file's JSDoc for full field
docs). At a glance:

| Field         | Holds |
|---|---|
| `metadata`    | id, name, description, timestamps, schema version |
| `pipeline`    | current/expanded stage, completed/started stage ids, progress |
| `images`      | uploaded + detected images — shared across stages, not owned by Stage 1 |
| `annotations` | empty for now; reserved for the future annotation engine |
| `stages`      | per-stage **outputs only**, keyed by stage id (1–9) |
| `settings`    | app-level preferences (units, theme) |
| `exports`     | history of CSV exports from Stage 9 |
| `history`     | undo/redo scaffold — present in the shape, not wired up |

Each stage's entry in `stages` holds only what that stage produces (angles,
confirmed g-vectors, classifications, etc.) — never images, never another
stage's data. This is what "no stage should permanently own scientific
data" means in practice: the store owns it, a stage just reads/writes its
own slice.

## Services

- **`projectManager.js`** — `createProject` / `openProject` / `saveProject`
  / `closeProject` / `duplicateProject`. Filesystem-agnostic on purpose:
  `saveProject` returns a JSON string rather than writing a file, since
  there's no `fs` access outside Electron yet. A later Electron adapter
  wraps these same calls with real save/open dialogs.
- **`serializer.js`** — JSON export/import, plus a `migrateProject` stub for
  future schema-version bumps. Strips raw `File` objects down to
  `{name, size, type}` on serialize, since `File` isn't JSON-safe.
- **`validation.js`** — per-stage validators (`validateStage`,
  `validateProject`) and a structural check (`validateProjectShape`) used
  when opening a file, to reject anything that isn't a Project at all
  before attempting to load it.
- **`autosave.js`** — a debounced interval controller
  (`createAutosaveController`) that is *not* called anywhere yet. It exists
  so the timing/dirty-checking logic is settled before Phase 2 gives it a
  real `onSave`.

## Hooks

- **`useProject()`** — project lifecycle: create/open/save/duplicate/close,
  metadata, dirty flag.
- **`usePipeline()`** — everything `PipelineTimeline` needs: stage list,
  current/expanded stage, per-stage status, progress, navigation actions.
- **`useStage(stageId)`** — everything a single `Stage*.js` component
  needs: its data slice, an `update()` merge function, `complete()` /
  `reopen()`, and its status. This is the hook every stage component now
  uses instead of `useState` for permanent data.

## Migration notes

- `lib/pipelineConfig.js` still exists and still exports `STAGES` /
  `STATUS` — it now just re-exports from `constants/pipeline.js`, so nothing
  importing the old path breaks. New code should import from
  `@/constants/pipeline` directly.
- `lib/api.js` and `lib/mockData.js` are untouched. The mock API contract
  (function names, param shapes, return shapes) is exactly what a real
  Python backend integration should match — that was already true before
  Phase 1 and remains the plan.
- Every `Stage*.js` component keeps its exact previous JSX/markup/Tailwind
  classes. Only the state source changed (`useState` → `useStage`).
  `PipelineTimeline.js` similarly keeps its markup and only swaps its state
  source (`useState` → `usePipeline`).
- **Known limitation, by design:** raw uploaded `File` objects in
  `project.images` are held in memory only. `duplicateProject` (JSON-based
  deep clone) and `serializeProject` both reduce them to metadata rather
  than cloning/persisting the actual bytes. Real file persistence needs a
  place to put the bytes — that's the Electron + Python backend's job in a
  later phase, not the browser's.
- Zustand was added as a dependency (`zustand@^4.5.4`). Run `npm install`
  before running the app, since the sandbox this migration was written in
  had no network access to actually install it — the code was instead
  verified by parsing/bundling every changed file with esbuild
  (see "Verification" below).

## Verification

There is no Python backend or Electron shell yet, so "keep it compiling"
was verified two ways given the offline sandbox this work was done in:

1. Every new/changed `.js` file was parsed standalone with esbuild
   (`--loader=jsx`) — zero syntax errors.
2. The full import graph from `pages/_app.js`, `pages/pipeline.js`, and
   `components/pipeline/PipelineTimeline.js` was bundle-resolved with
   esbuild (aliasing `@/*` the same way `jsconfig.json` does) — every
   `@/...` import resolves to a real file, with no missing modules or typos.

Once `npm install` has real network access to fetch `zustand` and the
Next.js SWC binary, `npm run dev` / `npm run build` should be the final
confirmation, but nothing in this migration is expected to surprise that
step given (1) and (2) above.

## Future roadmap (status as of the Image Workspace stabilization pass)

- ~~**Phase 2 — Image Workspace**~~ — **done.** See
  `docs/PHASE2_IMAGE_WORKSPACE.md`: a reusable image viewer (zoom/pan/
  rotate/brightness/contrast), a 5-layer stack (Base/Detection/Annotation/
  Measurement/Label — the last three are placeholders), and an image
  browser, all backed by an extended Image model with per-image viewport
  persistence in the Project Store.
- ~~**Stabilization pass**~~ — **done.** See
  `docs/PHASE2_5_STABILIZATION.md`: expanded the Image model
  (calibration/statistics/cache/path), formalized a Layer model, replaced
  the hardcoded toolbar with an extensible Tool Registry, split rendering
  into Viewport/CanvasRenderer/LayerRenderer/OverlayRenderer, added a
  coordinate-conversion utility, generalized the workspace layout into
  named regions, and fixed real re-render overhead in the image
  browser/rendering pipeline. No annotation drawing, Electron, or Python
  work included -- purely preparing the seams Phase 3 needs.
- **Phase 3 — Annotation & measurement tools:** draw into the now-existing
  Annotation/Measurement layers via `LayerRenderer`; wire up interaction
  modes (Pointer/Pan already exist in the Tool Registry but don't yet gate
  `ImageViewport`'s behavior); use `lib/coordinates.js` to map clicks to
  image-space points; populate the now-existing (still empty)
  `project.annotations` bucket. See "Phase 3 readiness checklist" at the
  end of `docs/PHASE2_5_STABILIZATION.md` for the full rundown.
- **Phase 4 — Electron shell & real persistence:** wire
  `services/autosave.js` and `projectManager` to real `fs` calls via
  Electron IPC; native save/open dialogs; recent-projects list; populate
  `ImageEntity.path`.
- **Phase 5 — Python backend integration:** replace `lib/api.js`'s mock
  bodies with real calls to a local Python process (OpenCV/NumPy/SciPy/
  PyTorch); this is also what finally supplies real image bytes/URLs,
  real histograms (`statistics.histogram`), and real scale-bar calibration
  (`calibration.nmPerPixel`) for the current placeholders to be replaced.
- **Phase 6 — Undo/redo:** `project.history` already exists in the model;
  wire it up as a command stack around store mutations.
- **Phase 7 — Plugin system:** the hook-mediated store access pattern
  established across these phases (plus the Tool Registry's
  register-yourself model) means a plugin registering a 10th "stage," a
  new tool, or a custom image-workspace overlay becomes plausible without
  touching the pipeline's or workspace's core.
