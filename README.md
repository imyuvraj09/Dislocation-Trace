# DislocationTrace

### Crystallographic dislocation analysis from TEM images

**From image detection to 3D line reconstruction, Burgers vectors, and structured reports.**

![Next.js](https://img.shields.io/badge/Next.js-14.2.5-000000?logo=nextdotjs)
![React](https://img.shields.io/badge/React-18.3.1-149ECA?logo=react)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4.4-06B6D4?logo=tailwindcss&logoColor=white)
![FastAPI](https://img.shields.io/badge/API-FastAPI-009688?logo=fastapi&logoColor=white)
![Python](https://img.shields.io/badge/Analysis-Python-3776AB?logo=python&logoColor=white)

[Getting Started](#getting-started) · [Analysis Workflow](#analysis-workflow) · [API Reference](#api-reference) · [Contributing](#contributing) · [Contributors](#contributors)

---

## Overview

DislocationTrace is a full-stack research application for analysing dislocations in **Transmission Electron Microscopy (TEM)** images. It combines a Next.js interface with a FastAPI backend, computer-vision routines, and crystallographic solvers to support a guided, reproducible analysis workflow.

The project was developed through an internship at the **Extreme Environments Materials Group (EEMG), Indian Institute of Science (IISc), Bengaluru**, under the supervision of **Dr. Ankur Chauhan**.

The application assists with detection and calculation; users supply and verify the experimental interpretation, including diffraction indexing, zone axes, line correspondences, and Burgers-vector evidence.

> **Stage numbering:** The current browser interface has **7 stages**. Backend routes retain numbering from the original **9-stage scientific pipeline**. For example, browser Stage 5 calls `/api/stage6/solve-up`. See the mapping below.

## Features

- **Image analysis:** detect dislocation lines in TEM images and candidate g-vectors in diffraction images; review and adjust annotations.
- **Explicit indexing:** enter zone axes and Miller or Miller–Bravais indices, and associate TEM images with their diffraction patterns.
- **Paired-image reconstruction:** match corresponding dislocations, compute trace angles, solve intermediate vectors, and reconstruct 3D line directions.
- **Crystal-aware geometry:** support cubic, tetragonal, and HCP systems with appropriate direct and reciprocal coordinate transforms.
- **Burgers-vector analysis:** explore reference g·b tables, record observations, and review consistent candidates or supply a known vector in the final workflow.
- **Classification and reporting:** inspect dislocation character, slip-plane information, continuous vectors, indexing deviations, residuals, and CSV results.
- **Session-based API:** keep multi-stage requests associated with the same browser-tab session.

## Supported crystal systems

| System | Active material entries | Direction notation | Plane notation | Lattice input |
| --- | --- | --- | --- | --- |
| Cubic | FCC, BCC, B2, simple cubic | `[u v w]` | `(h k l)` | No `c/a` required |
| Tetragonal | Simple tetragonal, BCT, FCT | `[u v w]` | `(h k l)` | Finite, positive `c/a` |
| HCP | Hexagonal close-packed | `[u v t w]` | `(h k i l)` | Finite, positive `c/a` |

**HCP constraints:** directions must satisfy `t = -(u + v)`; planes must satisfy `i = -(h + k)`. Use four indices for HCP Burgers vectors, zone axes, and plane inputs. Use three indices for cubic and tetragonal inputs.

Trace reconstruction, cross products, angle calculations, and plane-normal operations use **three-component Cartesian vectors internally**. Indices are converted at input and output boundaries; non-cubic indices are not treated as Cartesian components. Continuous results and integer-indexed approximations are reported separately so rounding is not mistaken for an exact solution.

The cubic numerical path retains its legacy behaviour. FCT uses tetragonal geometry and its own reference table based on the face-centred `1/2<110>` Burgers-vector family. Additional database files may exist in the source tree, but only implemented entries are exposed by the material selector and finder.

## Getting started

### 1. Prepare your computer

You need:

- **Git** to clone the repository and contribute changes.
- **Python** with `pip` and `venv`. Python 3.10+ is a practical starting point; this repository does not declare a complete tested Python-version matrix.
- **Node.js and npm** compatible with the pinned Next.js 14.2.5 dependency. Its minimum Node requirement is 18.17; use a maintained compatible Node release for your environment.
- A browser and two terminal windows.

Check your tools:

```bash
git --version
python --version
node --version
npm --version
```

On macOS/Linux, use `python3` if `python` is unavailable. On Windows, `py` can be used to create the virtual environment.

### 2. Get the source

```bash
git clone https://github.com/imyuvraj09/Dislocation-Trace.git
cd Dislocation-Trace
```

Alternatively, choose **Code → Download ZIP** on GitHub and extract it. Locate the directory containing both `frontend/` and `backend/`: this is the **project root** used throughout this guide. Some downloaded archives contain an extra enclosing folder.

> A ZIP download is sufficient to run the application. To commit changes and open a pull request, use a Git clone as described under [Contributing](#contributing).

### 3. Start the backend — Terminal 1

Run these commands from the project root.

**Windows PowerShell**

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --reload
```

If PowerShell blocks activation, use the environment's Python directly; activation is not required:

```powershell
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload
```

**macOS / Linux**

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --reload
```

Leave this terminal running. Confirm the backend responds at:

- [Health check](http://localhost:8000/health) — expected response: `{"status":"ok"}`.
- [Interactive API documentation](http://localhost:8000/docs).

### 4. Start the frontend — Terminal 2

Open another terminal at the project root:

```bash
cd frontend
npm install
```

Create the local configuration file:

**Windows PowerShell**

```powershell
Copy-Item .env.local.example .env.local
```

**macOS / Linux**

```bash
cp .env.local.example .env.local
```

The default value is:

```dotenv
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

Then start the interface:

```bash
npm run dev
```

Open **[http://localhost:3000/pipeline](http://localhost:3000/pipeline)**. Both servers must remain running for the full analysis workflow. The environment file is optional when using the default backend address, but makes the configuration explicit.

### 5. Stop or restart

Press **Ctrl+C** in each server terminal to stop it. To restart, activate the existing Python environment and repeat the backend launch command; run `npm run dev` from `frontend/` in the other terminal. Dependencies do not need reinstalling unless they change.

**Export important results before restarting the backend:** analysis state is held in memory and is lost when the process exits or reloads.

## Analysis workflow

### Prepare the experimental inputs

For a paired reconstruction, prepare two TEM views of the same dislocation, their associated diffraction information, and the corresponding zone axes. You must know which traces correspond across images; matching labels alone do not establish correspondence.

Sample images are included in:

- `backend/fileskh/input/images/` — TEM images.
- `backend/fileskh/input/df/` — diffraction images.

Use sample images to explore the interface, but do not invent indexing or zone-axis values to obtain a result. Choose the material and, where required, its measured or otherwise justified `c/a` ratio.

### Complete the seven browser stages

| Browser stage | What to do | Backend stage |
| --- | --- | --- |
| **1 · Image Detection** | Upload TEM and diffraction images; run detection; review the detected lines and g-vectors and correct annotations where needed. | 1 |
| **2 · Zone Axis & Miller Indexing** | Enter each TEM image's zone axis; associate it with the correct diffraction image; assign indices to the detected g-vectors. | 2; zone-axis data also feeds later requests |
| **3 · Line Pairing** | Pair the same physical dislocation across two TEM images and submit the pairs. Line IDs are local to each image. | 3 |
| **4 · G-vector Assignment & Angle Computation** | Select exactly three indexed g-vectors per pair/image and compute the trace angles. Common selections can be reused, with pair-specific overrides. | 4/5 |
| **5 · Up-vector Solving** | Solve the intermediate vector for each image of every pair using the selected g-vectors, angles, and zone axis; review residuals. | 6 |
| **6 · True Dislocation Line** | Reconstruct the 3D direction from both solved views; compare continuous and indexed results. | 7 |
| **7 · Burgers Vector, Classification and Output** | Enter or review the appropriate Burgers vector, use g·b evidence where available, classify the dislocation, and generate/export the batch report. | 8/9 |

When g·b observations leave several candidates, review the ambiguity and confirm a physically justified candidate. A database consistency score is not an experimental probability. After changing a material, lattice ratio, indexing, annotations, or pairing, rerun affected downstream stages.

### Understand the output

The batch report includes pair and image identifiers, indexed and continuous true-line directions, indexing deviation, the selected Burgers vector, character, the line–Burgers-vector angle, slip-plane normals and indices, closest low-index candidates, deviations, slip systems, residuals, and status.

- Preserve the continuous vectors and deviations when interpreting approximate integer indices.
- Inspect failed or ambiguous results before treating them as valid measurements.
- For a pure screw dislocation, parallel line and Burgers vectors do not uniquely determine a slip plane through their cross product.
- Save the exported CSV together with the experimental inputs and acquisition metadata needed to reproduce the analysis.

The backend writes `backend/outputs/<session-id>/batch_results.csv`. The download endpoint serves it as `dislocation_batch_output.csv`.

## Project structure

```text
project-root/
├── README.md
├── frontend/
│   ├── pages/                       Next.js pages, including /pipeline
│   ├── components/pipeline/stages/  Workflow panels
│   ├── constants/pipeline.js        Current seven-stage UI definition
│   ├── lib/api.js                   Backend requests and session header
│   ├── models/                     Frontend data structures
│   ├── store/                      Client-side project state
│   ├── tests/                      Common g-vector logic checks
│   ├── public/data/                Static reference-table fallback
│   ├── package.json
│   └── .env.local.example
├── backend/
│   ├── main.py                     FastAPI app, CORS, routers, health check
│   ├── requirements.txt
│   ├── app/
│   │   ├── routers/                Stage, material, and session endpoints
│   │   ├── session_store.py         In-memory session state
│   │   ├── crystal_context.py       Material/lattice context
│   │   ├── serializers.py           NumPy/dataclass-to-JSON conversion
│   │   └── wrappers.py              Input conversion helpers
│   ├── fileskh/                    Scientific solvers and original CLI
│   │   ├── pipeline.py
│   │   ├── line_detector.py
│   │   ├── angle_calculator.py
│   │   ├── equation_solver.py
│   │   ├── true_line_solver.py
│   │   ├── classifier.py
│   │   ├── batch_reporter.py
│   │   └── input/                  Example TEM/diffraction images
│   ├── crystallography/
│   │   ├── geometry.py             Index-to-Cartesian transforms
│   │   └── data/                   Crystal reference tables
│   ├── tests/                      Scientific regression suite
│   ├── uploads/                    Temporary upload processing
│   └── outputs/                    Per-session CSV output
└── shared/docs/                    Architecture notes
```

## API reference

With the backend running, visit **[Swagger UI](http://localhost:8000/docs)** for the actual request models, required fields, and responses. Stage numbers in URLs are the original backend numbers.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/health` | Backend health |
| GET | `/api/materials` | Supported materials |
| GET | `/api/materials/{material_id}` | Material details |
| GET | `/api/materials/{material_id}/gb-table` | Reference g·b table |
| POST | `/api/stage1/detect-lines` | TEM line detection; multipart upload |
| POST | `/api/stage1/detect-gvecs` | Diffraction g-vector detection; multipart upload |
| POST | `/api/stage1/sync-annotations` | Synchronize reviewed annotations |
| POST | `/api/stage2/miller` | Assign diffraction indices |
| POST / GET | `/api/stage3/pairs` | Submit / retrieve line pairs |
| POST / GET | `/api/stage4/angles` | Compute / retrieve angles |
| POST / GET | `/api/stage6/solve-up` | Solve / retrieve intermediate vectors |
| POST / GET | `/api/stage7/true-line` | Reconstruct / retrieve true lines |
| POST / GET | `/api/stage8/gb-observations` | Submit / retrieve observations and candidates |
| POST | `/api/stage8/select-burgers-candidate` | Confirm a returned candidate |
| POST / GET | `/api/stage8/classify` | Compute / retrieve classification |
| POST | `/api/stage9/batch` | Generate the report |
| GET | `/api/stage9/batch/download?session_id=YOUR_SESSION_ID` | Download that session's CSV |
| GET / DELETE | `/api/session` | Inspect / clear session results |

### Sessions and request formats

Use the same **`X-Session-Id`** header throughout an analysis, including uploads and state-reading requests. The frontend handles this automatically using a tab session ID. Custom clients should supply their own distinct ID rather than relying on the shared default.

The two detection endpoints accept multipart form data; other POST endpoints accept JSON. **CSV download is the exception to header-based session selection:** it uses the `session_id` query parameter. Use the returned `downloadUrl` with the backend base URL.

### Example: detect lines in a TEM image

This browser-side example assumes `file` is a `File` from an upload input and `sessionId` is reused for subsequent requests:

```javascript
const API_BASE_URL = "http://localhost:8000";
const form = new FormData();
form.append("file", file);
form.append("min_px", "20");

const response = await fetch(`${API_BASE_URL}/api/stage1/detect-lines`, {
  method: "POST",
  headers: { "X-Session-Id": sessionId },
  body: form,
});

if (!response.ok) {
  throw new Error(`Detection failed: ${await response.text()}`);
}

const { image, detectedLines, lines } = await response.json();
console.log({ image, detectedLines, lines });
```

Do not manually set `Content-Type` for `FormData`; the browser supplies the multipart boundary. Use the server-returned image and line IDs in later stages.

## Tests and development checks

From the project root, with the Python environment activated:

**macOS / Linux**

```bash
PYTHONPATH=backend python -m unittest discover -s backend/tests -v
```

**Windows PowerShell**

```powershell
$env:PYTHONPATH = "backend"
python -m unittest discover -s backend/tests -v
```

The suite covers cubic preservation, tetragonal direct/reciprocal scaling, HCP four-index conversion and validation, non-cubic indexing and roundoff regressions, active databases, pair-specific Burgers vectors, slip-plane candidate handling, and common g-vector workflows.

Run the standalone frontend logic check from the project root:

```bash
node frontend/tests/test_common_gvector_logic.js
```

Check the frontend build:

```bash
cd frontend
npm run build
```

The package also defines `npm run lint`; initial ESLint configuration may be required. These commands describe available checks, not a guarantee that every platform/dependency combination has been tested.

## Original command-line pipeline

The interactive scientific CLI remains available:

```bash
python backend/fileskh/pipeline.py --help
```

See [`backend/fileskh/README.md`](backend/fileskh/README.md) for its input flags and usage. It remains a **three-index, cubic-compatible interface**. Use the browser/API workflow for tetragonal `c/a` handling and HCP four-index analysis. Interactive plotting requires a graphical environment; the CLI exposes a `--no-gui` option.

## Configuration and deployment notes

| Setting | Location | Behaviour |
| --- | --- | --- |
| Backend URL | `frontend/.env.local` | `NEXT_PUBLIC_API_BASE_URL`; defaults to `http://localhost:8000` |
| Frontend scripts | `frontend/package.json` | `dev`, `build`, `start`, and `lint` |
| CORS | `backend/main.py` | Development configuration currently permits all origins |
| Session storage | `backend/app/session_store.py` | In-memory, process-local state |
| Runtime paths | `backend/app/paths.py` | Temporary uploads and per-session outputs |

Restart the development frontend after editing `.env.local`. `NEXT_PUBLIC_` values are public browser configuration, not secrets; rebuild the frontend when changing them for a production build.

To run a local production frontend build from `frontend/`:

```bash
npm run build
npm run start
```

The API must still run separately. For a backend without development reload, run from the project root:

```bash
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Before a public deployment, configure explicit CORS origins, HTTPS, access controls, upload/resource limits, and appropriate data retention. The session ID is a state-routing key, **not authentication**. For multiple API workers or replicas, replace in-memory storage with a shared store such as Redis or a database before scaling.

A remote browser's `localhost` refers to that browser's computer. For hosted or LAN access, set the frontend API URL to the backend address reachable by the intended users and configure server binding/network access accordingly. Static reference-table fallbacks do not replace the analysis backend.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| `python`, `node`, `npm`, or `git` not found | Install the missing tool, check PATH, and reopen the terminal. Use `python3` or `py` where appropriate. |
| PowerShell blocks activation | Use `.venv\Scripts\python.exe` directly as shown above. |
| `ModuleNotFoundError` or backend import error | Use the virtual environment, install `backend/requirements.txt`, and launch `backend.main:app` from the project root. |
| Frontend reports `Failed to fetch` | Check `/health`, the backend terminal, `NEXT_PUBLIC_API_BASE_URL`, and CORS. Restart the frontend after an environment change. |
| Port 8000 is occupied | Launch the backend with `--port 8001`, update the frontend API URL, and restart the frontend. |
| Port 3000 is occupied | Run `npm run dev -- --port 3001` and use the new browser address. |
| HCP indices are rejected | Supply four indices and satisfy the direction/plane redundancy constraint. |
| Tetragonal/HCP geometry is rejected | Supply a finite, positive material-appropriate `c/a` value. |
| Missing angles, pairs, or solved vectors | Complete upstream stages in the same session; solve both images before true-line reconstruction. |
| Results disappear after backend restart | In-memory state was cleared. Rerun the workflow; export reports before restarting. |
| No lines or poor detections | Check image readability and contrast, review annotations, and inspect the detection threshold. |
| CSV download returns 404 | Generate the batch report first and use its returned URL with the correct session query parameter. |
| OpenCV reports a missing native library | Install the system runtime library named in the error for your OS; Python packages alone may not supply it. |

## Contributing

Contributions to documentation, interface behaviour, scientific validation, and supported workflows are welcome. For changes to crystallographic mathematics, explain the convention and assumptions, provide reproducible inputs, and add a regression test.

### 1. Fork and clone

Click **Fork** on the [GitHub repository](https://github.com/imyuvraj09/Dislocation-Trace). Replace `YOUR_GITHUB_USERNAME` below with your account name:

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/Dislocation-Trace.git
cd Dislocation-Trace
git remote add upstream https://github.com/imyuvraj09/Dislocation-Trace.git
git remote -v
```

`origin` points to your fork; `upstream` points to the original project. Set up and run the application using the instructions above.

### 2. Create a branch

Check the upstream default branch rather than assuming it is named `main`:

```bash
git remote show upstream
```

Replace `DEFAULT_BRANCH` below with the reported **HEAD branch**:

```bash
git fetch upstream
git switch -c docs/improve-readme upstream/DEFAULT_BRANCH
```

Use a descriptive branch name such as `fix/hcp-index-validation` for a different change. Start with a clean working tree; commit or stash unfinished work before switching branches.

### 3. Make and check your changes

Keep the change focused. Run the relevant tests above, build the frontend if you changed it, and manually check the affected workflow. For scientific changes, preserve the cubic path and verify the affected crystal systems, index notation, lattice scaling, and continuous-versus-indexed outputs.

Do not commit virtual environments, `node_modules`, `.next`, local environment files, generated CSVs, or private experimental data. The repository's `.gitignore` excludes common runtime files; still review your diff before committing.

### 4. Commit locally and push to your fork

If needed, configure the identity attached to your commits. Replace these example values; a GitHub-provided no-reply address can be used:

```bash
git config user.name "Your Name"
git config user.email "YOUR_COMMIT_EMAIL"
```

For a README-only change:

```bash
git status
git diff -- README.md
git add README.md
git diff --cached
git commit -m "docs: clarify setup and contribution workflow"
git push -u origin docs/improve-readme
```

For other changes, stage the specific files you edited and use the branch name you created. A **commit** records changes locally; **push** uploads them to your fork. Authenticate using your configured GitHub HTTPS credential flow or SSH setup.

### 5. Open a pull request

On GitHub, open **Compare & pull request** from your fork to the upstream default branch. Explain:

- The problem and why the change is needed.
- What changed and the expected behaviour.
- Tests run and their results.
- Screenshots for interface changes, or reproducible examples for numerical changes.

Respond to review feedback with further commits on the same branch. An upstream maintainer reviews and merges the pull request; pushing to your fork does not modify the original repository.

### Report an issue

Use the [issue tracker](https://github.com/imyuvraj09/Dislocation-Trace/issues). Include your OS, Python/Node versions, the failing stage, crystal system, `c/a` if applicable, exact error, and steps to reproduce. Share only experimental data you have permission to disclose.

## Contributors

The following credits and links are recorded in the application's About page. Roles describe the project's existing acknowledgements, not a ranking of contribution.

| Contributor | Institution | Contribution | Contact |
| --- | --- | --- | --- |
| **Dr. Ankur Chauhan** | Indian Institute of Science, Bengaluru | Academic supervision and expertise in electron microscopy and crystallography | [LinkedIn](https://www.linkedin.com/in/ankur-chauhan-012b13257/) · [Email](mailto:ankurchauhan@iisc.ac.in) |
| **Mohan Kumar M** | Indian Institute of Science, Bengaluru | Project mentorship and methodological guidance | [LinkedIn](https://www.linkedin.com/in/mohankumarmurugan/) · [Email](mailto:mohan@iisc.ac.in) |
| **Harshavardhan Kakarla** | National Institute of Technology Patna | TEM trace-analysis automation combining Python/OpenCV and crystallographic geometry | [LinkedIn](https://www.linkedin.com/in/harsha1906) · [Email](mailto:kakarlaharshavardhan@gmail.com) |
| **Yuvraj Singh** | MCKV Institute of Engineering, West Bengal | TEM trace-analysis automation combining Python/OpenCV and crystallographic geometry | [GitHub](https://github.com/imyuvraj09) · [LinkedIn](https://www.linkedin.com/in/imyuvraj-singh/) · [Email](mailto:yuvraj@mckvie.edu.in) |

See [GitHub's contributor history](https://github.com/imyuvraj09/Dislocation-Trace/graphs/contributors) for recorded code contributions. Update this section as further contributors are credited.

## Citation and acknowledgements

The application provides the following suggested software citation:

> *DislocationTrace: A User-Guided Framework for Dislocation Burgers Vector Identification and Trace Analysis*. Mohan Kumar M, Yuvraj Singh, Kakarla Harshavardhan, Ankur Chauhan (2026). EEMG Lab, Indian Institute of Science (IISc). https://github.com/imyuvraj09/Dislocation-Trace

For reproducibility, also record the commit SHA or release used in your analysis:

```bash
git rev-parse HEAD
```

Acknowledgements go to the **Extreme Environments Materials Group (EEMG), IISc**, for the project's research setting, supervision, and methodological support.

## License

The interface describes the project as “IISc licensed”, but the supplied source distribution does **not** include a standalone license file defining those terms. Confirm applicable permissions with the maintainers before redistribution or reuse beyond the permissions already granted. Maintainers should add the authoritative `LICENSE` file so users and contributors can identify the terms unambiguously.
