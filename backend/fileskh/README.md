# TEM Dislocation Analysis Pipeline

A modular, open-source Python pipeline for crystallographic dislocation analysis from TEM images.

## What it does

| Stage | Description |
|-------|-------------|
| 1 | Detect **coloured dotted dislocation lines** (red, white, green, cyan, blue, magenta, orange, yellow) in TEM images using HSV masking + DBSCAN clustering |
| 2 | User assigns **Miller indices [h k l]** to each detected g-vector |
| 3 | User defines **cross-image line pairs** (one line from TEM1 ↔ one from TEM2) |
| 4 | For each pair, user selects **exactly 3 g-vectors**; pixel-space acute angles computed |
| 5 | Angle table displayed for confirmation |
| 6 | **Up-vector solved**: `[h k l]·Up = ±cos(θ)`, zone-axis augmented, 8-combo sign search |
| 7 | **True 3-D line**: `U = (Up1×B1) × (Up2×B2)`, GCD-reduced Miller indices |
| 8 | **Character** (SCREW/EDGE/MIXED) + slip-plane normal `n = b×U` |
| 9 | Structured **batch CSV output** + console summary |

## Installation

```bash
# Clone
git clone https://github.com/your-org/tem-dislocation-pipeline.git
cd tem-dislocation-pipeline

# Install (editable, with dev tools)
pip install -e ".[dev]"

# Or plain install
pip install -r requirements.txt
```

**Requirements:** Python ≥ 3.9, numpy, opencv-python, matplotlib, scikit-learn

## Quick start

```bash
# Fully interactive — all prompts appear at runtime
python pipeline.py \
  --tem1 data/picture1.png  --tem2 data/picture2.png \
  --df1  data/df1.png       --df2  data/df2.png      \
  --zone-axis1 0 0 1        --zone-axis2 1 1 3       \
  --burgers 1 1 0
```

## Fully scripted (no prompts)

```bash
python pipeline.py \
  --tem1 data/picture1.png  --tem2 data/picture2.png \
  --df1  data/df1.png       --df2  data/df2.png      \
  --zone-axis1 0 0 1        --zone-axis2 1 1 3       \
  --burgers 1 1 0           \
  --miller df1.png:g01=1,-1,0  --miller df1.png:g02=0,0,2  --miller df1.png:g03=1,1,0  \
  --miller df2.png:g01=1,1,-2  --miller df2.png:g02=0,2,0  --miller df2.png:g03=2,0,0  \
  --pair L1-L1  --pair L2-L2  \
  --g-select P1:TEM1=g01,g02,g03  --g-select P1:TEM2=g01,g02,g03 \
  --g-select P2:TEM1=g01,g03,g02  --g-select P2:TEM2=g02,g03,g01 \
  --no-gui
```

## CLI reference

| Flag | Default | Description |
|------|---------|-------------|
| `--tem1 FILE` | required | TEM image, zone axis 1 (colored lines marked) |
| `--tem2 FILE` | required | TEM image, zone axis 2 |
| `--df1 FILE`  | required | Diffraction image, zone axis 1 (orange g-vector arrows) |
| `--df2 FILE`  | required | Diffraction image, zone axis 2 |
| `--zone-axis1 u v w` | required | Zone axis 1, e.g. `0 0 1` |
| `--zone-axis2 u v w` | required | Zone axis 2, e.g. `1 1 3` |
| `--burgers h k l` | required | Burgers vector, e.g. `1 1 0` |
| `--miller df:gID=h,k,l` | prompt | Pre-assign Miller index (repeat per g-vector) |
| `--pair L1-L1` | prompt | Pre-define line pair (repeat per pair) |
| `--g-select P1:TEM1=g01,g02,g03` | prompt | Pre-select 3 g-IDs (repeat per pair/image) |
| `--min-px N` | 20 | Min DBSCAN cluster size for line detection |
| `--out-dir DIR` | `outputs/` | Output directory |
| `--no-gui` | off | Disable matplotlib windows (headless mode) |
| `--quiet` | off | Suppress solver verbose output |
| `--force` | off | Overwrite existing output files |
| `--log-level` | INFO | DEBUG / INFO / WARNING / ERROR |

## Output files

All written to `outputs/` (or `--out-dir`):

| File | Contents |
|------|----------|
| `lines_TEM1.csv` | Detected dislocation lines in TEM1 with color labels |
| `lines_TEM2.csv` | Detected dislocation lines in TEM2 |
| `gvecs_df1.png.csv` | G-vectors for diffraction image 1 with Miller indices |
| `gvecs_df2.png.csv` | G-vectors for diffraction image 2 |
| `angles_per_pair.csv` | Pixel-space angles for all selected g-vectors |
| `batch_results.csv` | **Main output**: Up vectors, true line, character, slip plane |

## Verify math (no images needed)

```bash
python tests/test_math.py
# or
pytest tests/ -v
```

## Project layout

```
tem-dislocation-pipeline/
├── pipeline.py              ← main entry point
├── requirements.txt
├── pyproject.toml
├── README.md
├── tests/
│   └── test_math.py         ← headless math verification (30 assertions)
└── modules/
    ├── __init__.py
    ├── types.py             ← shared dataclasses (DetectedLine, GVector, …)
    ├── line_detector.py     ← Stage 1: HSV + DBSCAN multi-colour detection
    ├── angle_calculator.py  ← Stage 4: pixel-space angle computation
    ├── equation_solver.py   ← Stage 6: [h k l]·Up = ±cos(θ), sign search
    ├── true_line_solver.py  ← Stage 7: U = (Up1×B1)×(Up2×B2)
    ├── classifier.py        ← Stage 8: SCREW/EDGE/MIXED + slip plane
    └── batch_reporter.py    ← Stage 9: CSV output + summary
```

## Detected line colours

The detector recognises these colours in the TEM images:

| Colour | HSV range | Typical use |
|--------|-----------|-------------|
| Red | H=0-8° or H=172-180°, S>150 | Dislocation type A |
| Orange | H=9-22°, S>100 | Dislocation type B |
| Yellow | H=22-35°, S>100 | Dislocation type C |
| Green | H=35-88°, S>90 | Dislocation type D |
| Cyan | H=82-102°, S>75 | Dislocation type E |
| Blue | H=100-130°, S>75 | Dislocation type F |
| Magenta | H=140-172°, S>75 | Dislocation type G |
| White | V>180, local contrast >40, S<35 | Reference / scale marker |

## License

MIT — see [LICENSE](LICENSE).



Run the pipeline (interactive mode)
This will prompt you for Miller indices, line pairs, and g‑vector selections at runtime:
``` python fileskh/pipeline.py --tem1 fileskh/input/images/picture1.png --tem2 fileskh/input/images/picture2.png --df1 fileskh/input/df/df1.png --df2 fileskh/input/df/df2.png --zone-axis1 1 1 3 --zone-axis2 0 0 1 --burgers 0 1 0 --out-dir fileskh/outputs --interactive ```

3. Stage‑by‑Stage Workflow
Stage 1: Detect dislocation lines and g‑vectors. Annotated images saved in fileskh/outputs/images/ and fileskh/outputs/df/.

Stage 2: Prompt appears → enter Miller indices [h k l] for each g‑vector.

Stage 3: Prompt appears → enter line pairs (L1-L1, L2-L2, etc.), one per line, then press Enter on a blank line.

Stage 4: Prompt appears → select exactly 3 g‑vectors per pair (g01,g02,g03). Angles are computed automatically.

Stage 5: Angle tables are displayed in the terminal.

Stage 6: Up‑vector solving runs automatically.

Stage 7: True dislocation line is computed.

Stage 8: Classification (Screw/Edge/Mixed) and slip plane are determined.

Stage 9: Batch CSV results written to fileskh/outputs/.

4. Scripted run (skip prompts)
If you want to pre‑supply everything and skip interactive entry:
``` python fileskh/pipeline.py --tem1 fileskh/input/images/picture1.png --tem2 fileskh/inp ```
