# CrystalTrace -- Local Run Instructions

Two servers, run in separate terminals from this folder.

## 1. Backend (FastAPI)

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate      # optional but recommended
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Verify it's up: `curl http://localhost:8000/health` -> `{"status":"ok"}`
API docs: http://localhost:8000/docs

Notes:
- If your machine has trouble building `opencv-python` (GUI deps), use
  `pip install opencv-python-headless` instead -- the pipeline code only
  needs the array/processing APIs, not any GUI window.
- Uploaded images are written to `backend/uploads/` only transiently and
  deleted immediately after detection; `backend/outputs/` holds each
  session's exported batch CSV until you clear results or the session
  expires (2h idle).

## 2. Frontend (Next.js)

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000 -> the pipeline lives at `/pipeline`.

By default the frontend calls the backend at `http://localhost:8000`. To
point it elsewhere, set `NEXT_PUBLIC_API_BASE_URL` (see `lib/api.js`), e.g.:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000 npm run dev
```

## Trying the full workflow

1. **Stage 1**: upload at least one TEM image and one diffraction image, run detection.
2. **Stage 2**: enter a zone axis + pick each TEM image's diffraction image; type Miller indices for at least a few detected spots; save.
3. **Stage 3**: build at least one line pair from the detected labels (click on the overlay, or use the dropdowns); submit.
4. **Stage 4**: pick exactly 3 g-vectors per line per pair; compute angles.
5. **Stage 5**: solve Up-vectors.
6. **Stage 6**: reconstruct true dislocation lines.
7. **Stage 7**: select a material (crystal structure) once for the project,
   then record the experimental g.b observation (+1, 0, or -1) for each
   auto-generated (pair, image, g-vector) row -- no Burgers vector is typed
   in. CrystalTrace resolves candidate Burgers vectors against that
   material's crystallographically-allowed family; confirm one if more
   than one remains consistent. Classification (character, slip system)
   then runs automatically. A "g\u00b7b Explorer" tab sits alongside
   "Classification" at the top of this stage -- a read-only reference
   panel (dataset table, search & filter, visualize, truth table, common b
   finder) ported from the standalone g.b Explorer app, reading the same
   crystallography database as the solver above. It's for lookup only;
   nothing done there feeds back into the observation rows.
8. **Stage 8**: generate + download the batch CSV.

Sample images to use for a quick smoke test are already in the repo under
`backend/fileskh/input/images/` (TEM) and `backend/fileskh/input/df/`
(diffraction).

## What's new since the last handoff -- please review these specifically

**1. Image Workspace -- Draw Line tool** (`/workspace`)
After Stage 1, open an image in the Image Workspace and try the new "Draw
Line" tool in the toolbar: click two points to add a manually-drawn line.
It gets its own label (`M1`, `M2`, ...), shows up in the Layers panel's
Annotation layer, is deletable from the "Manual lines" list in the
Inspector Panel, and -- this is the part most worth checking -- becomes a
real, pairable line in Stage 3 alongside the auto-detected `L1`, `L2`, ...
labels, with no special-casing needed there. Also worth checking: pan/zoom/
rotate/brightness/contrast all still line up correctly with the drawn
lines (the image box's sizing changed under the hood to make this
possible -- flag it if anything looks misaligned, especially on very wide
or very tall images).

**2. Stale-results / recompute system**
Try editing something in an earlier stage (e.g. a Miller index in Stage 2,
or drawing/removing a manual line in the Workspace) *after* you've already
computed downstream results. The affected stages should:
- show a "Needs recompute" badge in the pipeline timeline,
- display an inline warning banner, while still showing the *previous*
  results underneath (nothing is deleted),
- block recomputing a stage whose own upstream dependency is itself still
  stale, until you resolve that one first.
Check whether this feels obvious/well-communicated in practice, or whether
the warning gets missed.

**3. General**
- Navbar's "Clear results" should wipe both the backend session and local
  project state.
- Refreshing the browser mid-pipeline still loses progress -- known,
  documented gap (no save/reload wired up yet), not something to report as
  new.

## What to send back

For anything you find while running through this -- broken, confusing,
scientifically off, or just "this would be nicer if..." -- note which
stage/screen it's on and what you did right before it happened. That's
enough for me to dig in on the next pass.

## What's new in this pass -- please review these specifically

**1. Detected lines/g-vectors are now editable, non-destructively**
In the Image Workspace, switch to the Pointer tool and click any line
(TEM image) or g-vector (diffraction image) to select it -- orange
highlight. From there: **Delete** (toolbar button in the Inspector Panel,
or the Delete/Backspace key) or **Hide** (declutter only, doesn't affect
the pipeline). Deletion is soft: the item moves to a "Deleted" list in the
Inspector Panel with a **Restore** button -- nothing is ever permanently
erased. Deleting something that was already used in a Stage 3 pair (or a
Stage 2 Miller assignment, or a Stage 4 g-vector selection) automatically
removes just that specific dependent data and flags only the actually-
affected downstream stages "Needs recompute" -- unrelated stages and pairs
are left alone.

**2. Manual drawing, improved**
Draw Line (TEM) and the new **Mark G-vector** (diffraction) tools now show
a live dashed preview from your first click to the cursor, with endpoint
markers, before you commit the second click. **Esc cancels** a draw in
progress. Both produce first-class annotations (`M1`, `M2`... for lines;
`gm1`, `gm2`... for g-vectors) usable immediately in Stage 2/3/4 alongside
detected ones.

**3. G-vectors are now visible in the Workspace**
Previously the Image Workspace only ever showed TEM lines -- opening a
diffraction image showed nothing. It now renders every detected/manual
g-vector as a labeled arrow, including its Miller index once Stage 2 has
assigned one (updates live -- no need to reopen the image). All the same
tools (pan/zoom/rotate/brightness/contrast) already worked on diffraction
images before this pass; only the annotation/marking side was TEM-only.

**4. Detected lines use their actual backend-assigned color**
Each detected line has always carried its own `color` field from the
backend (e.g. "orange", "white") meant to tell overlapping traces apart --
the Workspace and Stage 3 now use it instead of a single flat color.
Manual lines/g-vectors stay a fixed dashed blue regardless, so origin is
always visually obvious (color + stroke style, never color alone).

**5. What this does NOT include**
There's no general multi-action undo/redo stack (one didn't exist in the
codebase before this pass either) -- the soft-delete/restore pattern above
is the practical equivalent specifically for annotation deletion, not a
generic history system. Worth flagging if you need undo for something
beyond that.

## What's new in this pass

**Stage 2 now shows the annotated diffraction image, not just a bare table**
Each diffraction image renders above its Miller-index table with every
detected/manual g-vector drawn as a labeled arrow (origin -> tip) --
detected = solid violet, manually marked = dashed blue -- exactly the same
visual pattern Stage 3 already used for TEM lines. The label on each arrow
updates live as you type its [h k l], showing e.g. "g01 [1 0 0]" once all
three fields are filled, so you can see at a glance which spots are done.
These are the same annotations editable in the Image Workspace (Mark
G-vector / delete / restore) -- nothing new to keep in sync, just a new
place that reads the same data.
