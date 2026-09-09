# TEM Dislocation Analysis -- Full-Stack Project

A Next.js/Tailwind frontend and FastAPI/Python analysis pipeline for
crystallographic dislocation analysis from TEM images. The current web
workflow supports cubic, tetragonal, and HCP crystal systems.

```
project-root/
├── frontend/                        Next.js + TailwindCSS UI
│   ├── lib/api.js                   ← calls the backend (see below)
│   ├── components/pipeline/stages/  the 9 pipeline stage panels
│   └── .env.local.example           NEXT_PUBLIC_API_BASE_URL
│
├── backend/
│   ├── main.py                      FastAPI app (CORS + routers)
│   ├── requirements.txt
│   ├── app/
│   │   ├── routers/                 one router per stage (lightweight wrappers)
│   │   ├── session_store.py         in-memory per-session pipeline state
│   │   ├── serializers.py           dataclass/numpy → JSON
│   │   └── wrappers.py              raw-dict → dataclass helpers
│   ├── fileskh/                     TEM analysis stages and scientific solvers
│   │   ├── pipeline_types.py        dataclasses (DetectedLine, GVector, ...)
│   │   ├── line_detector.py         Stage 1
│   │   ├── angle_calculator.py      Stage 4
│   │   ├── equation_solver.py       Stage 6
│   │   ├── true_line_solver.py      Stage 7
│   │   ├── classifier.py            Stage 8
│   │   ├── batch_reporter.py        Stage 9
│   │   └── pipeline.py              original interactive CLI (still works standalone)
│   ├── crystallography/
│   │   ├── geometry.py              Miller/Miller--Bravais ↔ Cartesian conversion
│   │   └── data/                    active crystal-structure reference tables
│   ├── uploads/                     runtime: uploaded images
│   └── outputs/                     runtime: batch_results.csv per session
│
└── shared/
    └── docs/                        architecture notes
```

## Crystal-system workflows

All trace reconstruction, angle, cross-product, and plane-normal operations
are performed on three-component Cartesian vectors. Crystallographic indices
are converted at the input boundary and converted back only for display and
reporting. This avoids treating non-cubic Miller indices as Cartesian
components.

| Selected system | Direction input/output | Plane input/output | Required lattice input |
|---|---|---|---|
| Cubic | `[u v w]` | `(h k l)` | None; the legacy cubic numerical path is preserved |
| Tetragonal | `[u v w]` | `(h k l)` | Positive `c/a` entered by the user |
| HCP | `[u v t w]` | `(h k i l)` | Positive `c/a` entered by the user |

For HCP, the UI and API validate the Miller--Bravais redundancy conditions
`t = -(u + v)` and `i = -(h + k)`. The Burgers-vector finder is four-index
only when HCP is selected; cubic and tetragonal selections remain
three-index. HCP trace directions and slip planes are also returned in
four-index notation.

The active material selector contains only the implemented database entries:
FCC, BCC, B2, simple cubic, simple tetragonal, BCT, FCT, and HCP. Other database
files are retained in the source tree for possible future work but are not
exposed in the material selector or Burgers-vector finder.

## Run it

**Backend** (from `project-root/`):

```bash
cd backend
pip install -r requirements.txt
cd ..
uvicorn backend.main:app --reload
```

API docs: http://localhost:8000/docs

**Frontend** (from `project-root/`, in a second terminal):

```bash
cd frontend
npm install
cp .env.local.example .env.local   # only needed if the backend isn't on :8000
npm run dev
```

App: http://localhost:3000 → open `/pipeline`.

Sample TEM/diffraction images to try Stage 1 with are in
`backend/fileskh/input/images/` and `backend/fileskh/input/df/`.

## API endpoints

| Stage | Endpoint | Wraps |
|---|---|---|
| 1 | `POST /api/stage1/detect-lines` (multipart file) | `line_detector.detect_all_lines` |
| 1 | `POST /api/stage1/detect-gvecs` (multipart file) | `line_detector.detect_g_vectors` |
| 2 | `POST /api/stage2/miller` | assigns `GVector.hkl` |
| 3 | `POST /api/stage3/pairs` | builds `LinePair`s |
| 4/5 | `POST /api/stage4/angles` | `angle_calculator.compute_all_pair_angles` |
| 6 | `POST /api/stage6/solve-up` | `equation_solver.solve_Up` |
| 7 | `POST /api/stage7/true-line` | `true_line_solver.compute_true_line` |
| 8 | `POST /api/stage8/classify` | `classifier.classify` |
| 9 | `POST /api/stage9/batch`, `GET /api/stage9/batch/download` | `batch_reporter.BatchReporter` |

All POST endpoints (except the two multipart uploads) take/return JSON and
read an `X-Session-Id` header to key the backend's in-memory session store
(the frontend generates one per browser tab automatically). Full request/
response schemas are in the interactive docs at `/docs`.

### Example: upload a TEM image → backend detects lines → frontend displays them

```js
// frontend/lib/api.js
const form = new FormData();
form.append("file", file);       // a File from an <input type="file">
form.append("min_px", "20");

const res = await fetch(`${API_BASE_URL}/api/stage1/detect-lines`, {
  method: "POST",
  headers: { "X-Session-Id": sessionId },
  body: form,
});
const { image, detectedLines, lines } = await res.json();
// lines: [{ label: "L1", image, color, x1, y1, x2, y2, vx, vy, length_px }, ...]
```

`components/pipeline/stages/Stage1ImageDetection.js` calls this (via
`uploadImages()`) when you click "Run image detection" and renders the
detected-line count in the UI.

## Notes / known simplifications

- The in-memory session store is single-process. For a multi-worker
  deployment, swap `backend/app/session_store.py` for Redis or a database
  keyed the same way.
- The original CLI (`python backend/fileskh/pipeline.py ...`) remains a
  three-index cubic-compatible interface. Use the browser/API workflow for
  tetragonal `c/a` handling and HCP four-index analysis.
- FCT uses the tetragonal coordinate transform and its own JSON g.b reference
  table based on the face-centred `1/2<110>` Burgers-vector family. A finite
  positive user-entered `c/a` ratio is required for its trace calculation.

## Tests

Run the crystallographic regression suite from the repository root:

```bash
PYTHONPATH=backend python -m unittest discover -s backend/tests -v
```

The tests cover exact preservation of the cubic calculation, tetragonal
direct/reciprocal `c/a` scaling, HCP four-index conversion and validation,
HCP pipeline output notation, and active database filtering.
