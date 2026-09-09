# DislocationTrace — frontend

Frontend scaffold for an open-source TEM dislocation trace analysis tool.
Standalone, mock-data UI for reviewing the interface before the backend
pipeline is connected.

## Run locally

```bash
npm install
npm run dev
```

Then open http://localhost:3000. `/pipeline` is the main interface.

## Project structure

```
pages/
  index.js         Home page: hero + stage overview
  pipeline.js       The 9-stage pipeline (vertical timeline)
  about.js          Project description

components/
  layout/           Navbar, Footer
  pipeline/
    PipelineTimeline.js   Beam-line rail + accordion of stage panels
    StageNode.js          Diffraction-spot node marker
    StagePanel.js         Expandable panel shell (title, status, content)
    stages/               One component per pipeline stage (upload/form/table)
  ui/               Generic primitives: Button, Badge, FileDropzone, DataTable

lib/
  pipelineConfig.js  Stage metadata (single source of truth, id/title/summary)
  mockData.js        Mock payloads shaped like the real backend responses
  api.js             Placeholder API functions (fetchAngles, solveUpVector, …)
                     — swap function bodies for real fetch() calls when the
                     backend is ready; signatures are the intended contract.
```

## Design decisions

- **Layout — vertical timeline over wizard or dashboard.** The backend is a
  strict, ordered pipeline where each stage consumes the previous stage's
  output, so a numbered sequence is real information, not decoration. A
  wizard would hide the other stages entirely (bad for reviewing/re-running
  an earlier stage mid-analysis); a dashboard of independent collapsibles
  would imply the stages are unordered. The timeline shows the full pipeline
  at a glance, keeps one stage expanded at a time (accordion) to avoid
  clutter, and marks progress along a connecting rail.
- **Signature element — the "beam line."** The vertical rail connecting
  stage nodes is styled after the electron beam column the tool analyzes,
  and each node is a diffraction-spot glyph (ring + solid center) rather
  than a generic numbered dot — tying the chrome back to the subject matter
  instead of decorating it arbitrarily.
- **Type** — Space Grotesk (display) + Inter (body) + IBM Plex Mono for all
  crystallographic notation (Miller indices, vectors, angles), since that
  data is genuinely mathematical notation and reads better fixed-width.
- **Color** — neutral cool-gray canvas so long tables of data stay legible;
  a teal→blue gradient accent (the "beam" and "zone" scales in
  `tailwind.config.js`) reserved for progress, active state, and primary
  actions, per the brief's palette requirement.

## Connecting the real backend

Every pipeline stage calls one function from `lib/api.js`
(`uploadImages`, `submitMillerIndices`, `pairLines`, `fetchAngles`,
`confirmGVectors`, `solveUpVector`, `computeTrueDislocationLines`,
`classifyLines`, `fetchBatchResults`). Replace each function body with a
real `fetch()` call to the corresponding endpoint — the stage components
do not need to change as long as the resolved shape matches what's
documented in `lib/mockData.js`.
