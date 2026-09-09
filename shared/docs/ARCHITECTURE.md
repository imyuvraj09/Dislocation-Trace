# Architecture: Frontend ↔ Backend Data Flow

This mirrors the 9-stage data flow documented in
`backend/fileskh/pipeline_types.py`, just split across an HTTP boundary
instead of local Python variables inside `pipeline.py`.

```
Stage 1  TEM image        --POST /api/stage1/detect-lines-->  DetectedLine[]
         Diffraction image --POST /api/stage1/detect-gvecs-->  GVector[]
                                                                 │ (stored in session)
Stage 2  hkl per g-vector  --POST /api/stage2/miller------->   GVector.hkl set
Stage 3  line pair defs    --POST /api/stage3/pairs--------->  LinePair[]
Stage 4  3 g-IDs / line    --POST /api/stage4/angles-------->  AngleRow[]
Stage 6  zone axis (per img)--POST /api/stage6/solve-up----->  SolveResult
Stage 7  (sr1, sr2)        --POST /api/stage7/true-line----->  TrueLineResult
Stage 8  gb-observations     --POST /api/stage8/gb-observations->  candidates + (auto) ClassifyResult
                              --POST /api/stage8/select-burgers-candidate--> (auto) ClassifyResult

Stage 9  pair_id list      --POST /api/stage9/batch--------->  batch_results.csv
```

Each POST (after Stage 1) reads prior-stage results back out of the
backend's per-session in-memory store (`backend/app/session_store.py`)
rather than requiring the frontend to resend everything -- the same
role local variables play inside the original interactive
`pipeline.py` run.

See the root `README.md` for run instructions and the docblock at the
top of `frontend/lib/api.js` for how the current UI's simplified Stage
2 inputs are bridged into the pipeline's full per-image/per-g-vector
requirements.
