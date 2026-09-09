"""
pipeline.py  —  TEM Dislocation Analysis Pipeline
==================================================

Stage 1   Image detection
            TEM images  → detect_all_lines()  → colored dislocation lines
                          labeled L1, L2, … per image
            Diff images → detect_g_vectors()  → g-vector arrows
                          labeled g01, g02, … per diff image
            Matplotlib windows show detections; user verifies.

Stage 2   Miller-index assignment
            User types [h k l] for each detected g-ID.
            Pre-supply via  --miller df1.png:g01=1,-1,0  to skip prompts.

Stage 3   Line pairing
            Side-by-side matplotlib view, then user types pairs:
            L1-L1, L2-L2, etc.  Pre-supply via  --pair L1-L1.

Stage 4   G-vector selection + angle computation  (per pair)
            For each (pair, image) the user selects EXACTLY THREE g-IDs.
            Acute pixel-space angles computed for those three IDs only.
            Miller indices are NOT used here.

Stage 5   Angle table display  (automatic, inside Stage 4)

Stage 6   Up-vector solving
            3 equations:  ĝᵢ · Up = ±cos(θᵢ)
            Zone-axis augmentation  Up · B = 0
            Sign-ambiguity search over all 8 sign combinations.

Stage 7   True dislocation line
            U = (Up1 × B1) × (Up2 × B2),  GCD-reduced Miller indices.

Stage 8   Classification + slip plane
            |U · b̂| → SCREW / EDGE / MIXED.
            Slip-plane normal  n = b × U.

Stage 9   Batch CSV output + console summary.

──────────────────────────────────────────────────────────────────────
QUICK-START EXAMPLES
──────────────────────────────────────────────────────────────────────

  # Fully interactive (all prompts appear at runtime):
  python pipeline.py \\
    --tem1 picture1.png  --tem2 picture2.png \\
    --df1  df1.png       --df2  df2.png      \\
    --zone-axis1 0 0 1   --zone-axis2 1 1 3  \\
    --burgers 1 1 0

  # Pre-supply Miller indices (skip Stage 2 prompts):
    --miller df1.png:g01=1,-1,0  --miller df1.png:g02=0,0,2 ...

  # Pre-supply pairs (skip Stage 3 prompt):
    --pair L1-L1  --pair L2-L2

  # Pre-supply g-vector selection for Stage 4 (skip per-pair prompts):
    --g-select P1:TEM1=g01,g02,g03  --g-select P1:TEM2=g01,g02,g03

  # Lower detection threshold for faint lines (default 20):
    --min-px 10

  # Disable matplotlib GUI (headless / batch mode):
    --no-gui

  # Force re-run and overwrite all outputs:
    --force
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

# ── make modules importable regardless of cwd ────────────────────────────────
_HERE = Path(__file__).resolve().parent
_PARENT = _HERE.parent
sys.path.insert(0, str(_HERE))
sys.path.insert(0, str(_PARENT))

from fileskh import (
    AngleRow, ClassifyResult, DetectedLine, FinalResult,
    GVector, GVecSelection, LinePair, SolveResult, TrueLineResult,
    load_image, detect_all_lines, detect_g_vectors,
    compute_angles_for_selection,
    solve_Up,
    compute_true_line,
    classify,
    write_lines_csv, write_gvec_csv, write_angles_csv,
    BatchReporter,
)
from fileskh.equation_solver  import format_solve_result
from fileskh.true_line_solver import format_true_line
from fileskh.classifier       import format_classify
from fileskh.line_detector    import (
    show_detected_lines, show_g_vectors, show_pair_guide,
)

_OUT = _HERE / "outputs"


# ─────────────────────────────────────────────────────────────────────────────
# Logging
# ─────────────────────────────────────────────────────────────────────────────

def _setup_logging(level: str = "INFO") -> logging.Logger:
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s  [%(levelname)-8s]  %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    return logging.getLogger("pipeline")


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────

def _build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="pipeline.py",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        description="TEM Dislocation Analysis Pipeline",
        epilog=__doc__,
    )

    req = p.add_argument_group("inputs")
    req.add_argument("--tem1", metavar="FILE",
                     default=str(_HERE / "input" / "images" / "picture1.png"),
                     help="TEM image, zone axis 1  (colored dislocation lines marked)")
    req.add_argument("--tem2", metavar="FILE",
                     default=str(_HERE / "input" / "images" / "picture2.png"),
                     help="TEM image, zone axis 2")
    req.add_argument("--df1",  metavar="FILE",
                     default=str(_HERE / "input" / "df" / "df1.png"),
                     help="Diffraction image, zone axis 1  (orange g-vector arrows)")
    req.add_argument("--df2",  metavar="FILE",
                     default=str(_HERE / "input" / "df" / "df2.png"),
                     help="Diffraction image, zone axis 2")

    cry = p.add_argument_group("crystallographic parameters")
    cry.add_argument("--zone-axis1", nargs=3, type=float,
                     metavar=("u","v","w"), help="Zone axis 1, e.g.  0 0 1")
    cry.add_argument("--zone-axis2", nargs=3, type=float,
                     metavar=("u","v","w"), help="Zone axis 2, e.g.  1 1 3")
    cry.add_argument("--burgers",    nargs=3, type=float,
                     metavar=("h","k","l"), help="Burgers vector, e.g.  1 1 0")

    pre = p.add_argument_group("pre-supply inputs  (skip interactive prompts)")
    pre.add_argument("--miller", action="append", default=[],
                     metavar="df:gID=h,k,l",
                     help="E.g. --miller df1.png:g01=1,-1,0  (repeat per g-vector)")
    pre.add_argument("--pair",   action="append", default=[],
                     metavar="L1-L1",
                     help="E.g. --pair L1-L1  (repeat per pair)")
    pre.add_argument("--g-select", action="append", default=[],
                     metavar="PairID:TEM1|TEM2=g01,g02,g03",
                     help="Pre-select 3 g-IDs for one (pair, image).  "
                          "E.g. --g-select P1:TEM1=g01,g02,g03")

    fc = p.add_argument_group("file control")
    fc.add_argument("--out-dir",   default=str(_OUT), help=f"Output dir (default: {_OUT})")
    fc.add_argument("--min-px",  type=int, default=20,
                    help="Min DBSCAN cluster pixels for line detection (default: 20)")
    fc.add_argument("--interactive", action="store_true",
                    help="Prompt for missing input values interactively in the terminal")
    fc.add_argument("--force",   action="store_true",
                    help="Overwrite existing output files")
    fc.add_argument("--no-gui",  action="store_true",
                    help="Disable matplotlib windows (headless/batch mode)")
    fc.add_argument("--quiet",   action="store_true",
                    help="Suppress verbose Stage 6-8 per-step output")
    fc.add_argument("--log-level", default="INFO",
                    choices=["DEBUG","INFO","WARNING","ERROR"])
    return p


def _prompt_path(prompt: str, default: Optional[str] = None) -> str:
    """Prompt for a file path in the terminal, with an optional default."""
    while True:
        default_text = f" [{default}]" if default else ""
        raw = input(f"  {prompt}{default_text} → ").strip()
        if not raw and default:
            return default
        candidate = Path(raw).expanduser()
        if candidate.exists():
            return str(candidate)
        print("  ✗  File not found. Enter a valid path.")


def _prompt_vector(prompt: str, default: Optional[List[float]] = None) -> List[float]:
    """Prompt for a 3-component vector such as a zone axis or Burgers vector."""
    while True:
        default_text = f" [{default}]" if default else ""
        raw = input(f"  {prompt}{default_text} → ").strip()
        if not raw and default is not None:
            return list(default)
        parts = raw.replace(",", " ").split()
        if len(parts) == 3:
            try:
                return [float(x) for x in parts]
            except ValueError:
                pass
        print("  ✗  Enter three numbers, for example: 0 0 1")


def _parse_miller(items: List[str]) -> Dict[str, Tuple[int,int,int]]:
    """--miller df1.png:g01=1,-1,0  →  {'df1.png:g01': (1,-1,0)}"""
    out: Dict[str, Tuple[int,int,int]] = {}
    for it in items:
        try:
            left, right = it.split("=", 1)
            h, k, l = (int(float(x)) for x in right.split(","))
            out[left.strip()] = (h, k, l)
        except Exception:
            raise ValueError(f"Bad --miller: {it!r}  Format: df1.png:g01=1,-1,0")
    return out


def _parse_g_select(items: List[str]) -> Dict[str, Dict[str, List[str]]]:
    """--g-select P1:TEM1=g01,g02,g03  →  {'P1': {'TEM1': ['g01','g02','g03']}}"""
    out: Dict[str, Dict[str, List[str]]] = {}
    for it in items:
        try:
            lhs, rhs = it.split("=", 1)
            pair_id, img_tag = lhs.split(":", 1)
            chosen = [x.strip() for x in rhs.split(",") if x.strip()]
            if len(chosen) != 3:
                raise ValueError(f"Need exactly 3 g-IDs, got {chosen}")
            out.setdefault(pair_id.strip(), {})[img_tag.strip()] = chosen
        except Exception as exc:
            raise ValueError(
                f"Bad --g-select: {it!r}\n"
                f"Expected: P1:TEM1=g01,g02,g03\nError: {exc}"
            )
    return out


# ─────────────────────────────────────────────────────────────────────────────
# Stage helpers
# ─────────────────────────────────────────────────────────────────────────────

def _banner(n: int, title: str, log: logging.Logger) -> None:
    log.info("═" * 66)
    log.info(f"  STAGE {n}: {title}")
    log.info("═" * 66)


def _wrap_lines(raw: List[dict], basename: str, img_id: str) -> List[DetectedLine]:
    """Convert raw detect_all_lines() dicts to DetectedLine dataclasses."""
    return [
        DetectedLine(
            label=f"L{i+1}",
            image=basename,
            color=r.get("color", "unknown"),
            x1=int(r["x1"]), y1=int(r["y1"]),
            x2=int(r["x2"]), y2=int(r["y2"]),
            vx=int(r["vx"]), vy=int(r["vy"]),
            length_px=float(r["length_px"]),
        )
        for i, r in enumerate(raw)
    ]


def _wrap_gvecs(raw: List[dict], basename: str) -> List[GVector]:
    """Convert raw detect_g_vectors() dicts to GVector dataclasses."""
    return [
        GVector(
            g_id=r["g_id"],
            source=basename,
            ox=int(r["ox"]), oy=int(r["oy"]),
            tx=int(r["tx"]), ty=int(r["ty"]),
            vx=int(r["vx"]), vy=int(r["vy"]),
            length_px=float(r["length_px"]),
            hkl=None,
        )
        for r in raw
    ]


# ── Stage 2: Miller-index assignment ─────────────────────────────────────────

def _assign_miller(
    gvecs:   List[GVector],
    prefill: Dict[str, Tuple[int,int,int]],
    log:     logging.Logger,
) -> None:
    """Assign [h k l] to every GVector; uses prefill or prompts user."""
    for g in gvecs:
        if g.hkl is not None:
            continue
        key = f"{g.source}:{g.g_id}"
        if key in prefill:
            g.hkl = prefill[key]
            log.info(f"  {key}: pre-filled as {g.hkl}")
            continue
        print(f"\n  ── Miller index for  {g.source} / {g.g_id}  ──")
        print(f"     pixel vector  vx={g.vx:+d}   vy={g.vy:+d}   len={g.length_px:.1f}px")
        while True:
            raw = input("     [h k l] → ").strip().replace(",", " ")
            parts = raw.split()
            if len(parts) == 3:
                try:
                    g.hkl = (int(float(parts[0])),
                             int(float(parts[1])),
                             int(float(parts[2])))
                    print(f"     ✓  {g.g_id}  {g.hkl}")
                    break
                except ValueError:
                    pass
            print("     ✗  Enter three integers, e.g.  1 -1 0")


# ── Stage 3: Line pairing ─────────────────────────────────────────────────────

def _define_pairs(
    lines1: List[DetectedLine],
    lines2: List[DetectedLine],
    auto:   Optional[List[str]],
    log:    logging.Logger,
) -> List[LinePair]:
    """Build LinePair objects from user input or --pair CLI flags."""
    idx1 = {ln.label: ln for ln in lines1}
    idx2 = {ln.label: ln for ln in lines2}

    def _norm(s: str) -> str:
        s = s.strip().upper()
        return s if s.startswith("L") else f"L{s}"

    entries = list(auto) if auto else []
    if not auto:
        print("\n── Stage 3: Line pairing ──────────────────────────────────────────")
        print(f"  TEM1 lines: {[l.label for l in lines1]}")
        print(f"  TEM2 lines: {[l.label for l in lines2]}")
        print("  Enter pairs as  L1-L1  (TEM1_id − TEM2_id).  Blank to finish.\n")
        k = 1
        while True:
            raw = input(f"  Pair {k}: ").strip()
            if not raw or raw.lower() == "done":
                break
            entries.append(raw)
            k += 1

    pairs: List[LinePair] = []
    for k, entry in enumerate(entries, start=1):
        if "-" not in entry:
            log.warning(f"  Skipping bad pair entry: {entry!r}")
            continue
        id1, id2 = _norm(entry.split("-", 1)[0]), _norm(entry.split("-", 1)[1])
        if id1 not in idx1:
            log.error(f"  '{id1}' not in TEM1 {list(idx1)} — skipped")
            continue
        if id2 not in idx2:
            log.error(f"  '{id2}' not in TEM2 {list(idx2)} — skipped")
            continue
        pairs.append(LinePair(pair_id=f"P{k}", line1=idx1[id1], line2=idx2[id2]))
        print(f"  ✓  P{k}: {id1} [{idx1[id1].color}] (TEM1) ↔ {id2} [{idx2[id2].color}] (TEM2)")
    return pairs


# ── Stage 4: G-vector selection + angle computation ──────────────────────────

def _select_three(
    pair_id:  str,
    img_tag:  str,
    gvecs:    List[GVector],
    prefill:  Optional[List[str]],
) -> List[str]:
    """Prompt for exactly 3 g-IDs, or use prefill."""
    avail = [g.g_id for g in gvecs]
    if prefill is not None:
        bad = [x for x in prefill if x not in avail]
        if bad or len(prefill) != 3:
            raise ValueError(
                f"Bad prefill for {pair_id}/{img_tag}: {prefill}. "
                f"Available: {avail}"
            )
        print(f"  {pair_id}/{img_tag}: using pre-supplied {prefill}")
        return list(prefill)

    print(f"\n  ── G-vector selection  [{pair_id} / {img_tag}] ──")
    print(f"  Available IDs : {avail}")
    for g in gvecs:
        hkl = str(g.hkl) if g.hkl else "[? ? ?]"
        print(f"    {g.g_id:<6}  vx={g.vx:>7}  vy={g.vy:>7}"
              f"  len={g.length_px:>7.1f}px  Miller={hkl}")
    while True:
        raw    = input(f"\n  Enter EXACTLY THREE g-IDs (e.g. g01,g02,g03): ").strip()
        chosen = [x.strip() for x in raw.split(",") if x.strip()]
        bad    = [x for x in chosen if x not in avail]
        if len(chosen) != 3:
            print(f"  ✗  Need exactly 3 IDs, got {len(chosen)}.")
        elif bad:
            print(f"  ✗  Unknown IDs: {bad}.  Available: {avail}")
        elif len(set(chosen)) != 3:
            print("  ✗  All three must be distinct.")
        else:
            print(f"  ✓  Selected: {chosen}")
            return chosen


def _run_stage4(
    pair:         LinePair,
    gvecs1:       List[GVector],
    gvecs2:       List[GVector],
    g_select_map: Dict[str, Dict[str, List[str]]],
    log:          logging.Logger,
) -> Tuple[List[AngleRow], GVecSelection, GVecSelection]:
    """Stage 4+5: select 3 g-IDs per image and compute angles."""
    pid          = pair.pair_id
    pair_prefill = g_select_map.get(pid, {})
    all_rows: List[AngleRow] = []
    sels: List[GVecSelection] = []

    for dl, gvecs, img_tag in [
        (pair.line1, gvecs1, "TEM1"),
        (pair.line2, gvecs2, "TEM2"),
    ]:
        prefill    = pair_prefill.get(img_tag)
        chosen_ids = _select_three(pid, img_tag, gvecs, prefill)

        sel = GVecSelection(
            pair_id=pid, image=dl.image,
            diff_image=gvecs[0].source if gvecs else "",
            g_ids=chosen_ids,
        )
        sels.append(sel)

        gvec_map   = {g.g_id: g for g in gvecs}
        ordered    = [gvec_map[gid] for gid in chosen_ids]
        rows       = compute_angles_for_selection(dl, ordered, chosen_ids, pid)
        all_rows.extend(rows)

        # Stage 5 — print angle table
        print(f"\n  Angles — {pid} / {img_tag}")
        print(f"  {'g-ID':<7} {'Miller':^12} {'raw°':>8}  {'θ acute°':>10}")
        print("  " + "─" * 44)
        for r in rows:
            g   = gvec_map.get(r.g_id)
            hkl = str(g.hkl) if g and g.hkl else "[? ? ?]"
            print(f"  {r.g_id:<7} {hkl:^12} {r.raw_deg:>8.3f}  {r.acute_deg:>10.3f}")
        print()
        log.info(f"  {pid}/{img_tag}: g={chosen_ids}  θ={[round(r.acute_deg,2) for r in rows]}")

    return all_rows, sels[0], sels[1]


# ─────────────────────────────────────────────────────────────────────────────
# Main pipeline
# ─────────────────────────────────────────────────────────────────────────────

def run(args, log: logging.Logger) -> None:
    out_dir = args.out_dir
    os.makedirs(out_dir, exist_ok=True)

    B1      = np.array(args.zone_axis1, dtype=float)
    B2      = np.array(args.zone_axis2, dtype=float)
    burgers = np.array(args.burgers,    dtype=float)
    verbose = not args.quiet
    gui     = not args.no_gui

    miller_prefill = _parse_miller(args.miller)
    g_select_map   = _parse_g_select(args.g_select)

    t1_base  = os.path.basename(args.tem1)
    t2_base  = os.path.basename(args.tem2)
    df1_base = os.path.basename(args.df1)
    df2_base = os.path.basename(args.df2)

    log.info(f"TEM1={t1_base}  TEM2={t2_base}")
    log.info(f"DF1 ={df1_base}  DF2 ={df2_base}")
    log.info(f"B1={B1.astype(int).tolist()}  B2={B2.astype(int).tolist()}  "
             f"b={burgers.astype(int).tolist()}")

    # ══════════════════════════════════════════════════════════════════════════
    # STAGE 1 — Image detection
    # ══════════════════════════════════════════════════════════════════════════
    _banner(1, "Image detection  (colored lines + g-vector arrows)", log)

    lines1, lines2    = [], []
    gvecs1, gvecs2    = [], []

    for tem_path, t_base, store, img_id in [
        (args.tem1, t1_base, lines1, "TEM1"),
        (args.tem2, t2_base, lines2, "TEM2"),
    ]:
        log.info(f"  Detecting lines in {t_base} …")
        bgr = load_image(tem_path)
        raw = detect_all_lines(bgr, min_cluster_px=args.min_px)
        lns = _wrap_lines(raw, t_base, img_id)
        store.extend(lns)

        # Print detection summary
        print(f"\n  {img_id} ({t_base}): {len(lns)} line(s) detected")
        for ln in lns:
            print(f"    {ln.label}  [{ln.color}]  "
                  f"({ln.x1},{ln.y1})→({ln.x2},{ln.y2})"
                  f"  v=({ln.vx:+d},{ln.vy:+d})  {ln.length_px:.1f}px")

        write_lines_csv(lns, os.path.join(out_dir, f"lines_{img_id}.csv"))
        labels = [ln.label for ln in lns]
        if gui:
            show_detected_lines(tem_path, raw, labels,
                title=f"[{img_id}] Detected dislocation lines — {t_base}\n"
                      "Verify labels, then close or press Enter to continue.",
                output_dir=out_dir)

    if not lines1 or not lines2:
        log.error("No dislocation lines detected in one or both TEM images. "
                  "Try --min-px with a lower value (e.g. --min-px 10). Aborting.")
        sys.exit(1)

    for df_path, df_base, store in [
        (args.df1, df1_base, gvecs1),
        (args.df2, df2_base, gvecs2),
    ]:
        log.info(f"  Detecting g-vectors in {df_base} …")
        bgr = load_image(df_path)
        raw = detect_g_vectors(bgr)
        gvs = _wrap_gvecs(raw, df_base)
        store.extend(gvs)

        print(f"\n  {df_base}: {len(gvs)} g-vector(s) detected")
        for g in gvs:
            print(f"    {g.g_id}  v=({g.vx:+d},{g.vy:+d})  {g.length_px:.1f}px")

        write_gvec_csv(gvs, os.path.join(out_dir, f"gvecs_{df_base}.csv"))
        if gui:
            show_g_vectors(df_path, raw,
                title=f"g-vectors in {df_base}\n"
                      "Note each arrow ID — you assign [h k l] per ID in Stage 2.\n"
                      "Close or press Enter to continue.",
                output_dir=out_dir)

    if len(gvecs1) < 3 or len(gvecs2) < 3:
        log.error(f"Need ≥ 3 g-vectors per diff image.  "
                  f"Found {len(gvecs1)} in {df1_base}, {len(gvecs2)} in {df2_base}.")
        sys.exit(1)

    # ══════════════════════════════════════════════════════════════════════════
    # STAGE 2 — Miller-index assignment
    # ══════════════════════════════════════════════════════════════════════════
    _banner(2, "Miller-index assignment", log)

    _assign_miller(gvecs1, miller_prefill, log)
    _assign_miller(gvecs2, miller_prefill, log)

    missing = [f"{g.source}:{g.g_id}" for g in gvecs1 + gvecs2 if g.hkl is None]
    if missing:
        log.error(f"Miller indices missing for: {missing}. Aborting.")
        sys.exit(1)

    write_gvec_csv(gvecs1, os.path.join(out_dir, f"gvecs_{df1_base}.csv"))
    write_gvec_csv(gvecs2, os.path.join(out_dir, f"gvecs_{df2_base}.csv"))

    print("\n  G-vector summary after Stage 2:")
    print(f"  {'Source':<16} {'ID':<7} {'vx':>7} {'vy':>7}  {'[h k l]'}")
    print("  " + "─" * 48)
    for g in gvecs1 + gvecs2:
        print(f"  {g.source:<16}  {g.g_id:<7}  {g.vx:>7}  {g.vy:>7}  {g.hkl}")

    # ══════════════════════════════════════════════════════════════════════════
    # STAGE 3 — Line pairing
    # ══════════════════════════════════════════════════════════════════════════
    _banner(3, "Line pairing", log)

    if not args.pair and gui:
        show_pair_guide(
            args.tem1,
            [{"color": l.color, "x1": l.x1, "y1": l.y1,
              "x2": l.x2, "y2": l.y2, "vx": l.vx, "vy": l.vy,
              "length_px": l.length_px} for l in lines1],
            [l.label for l in lines1],
            args.tem2,
            [{"color": l.color, "x1": l.x1, "y1": l.y1,
              "x2": l.x2, "y2": l.y2, "vx": l.vx, "vy": l.vy,
              "length_px": l.length_px} for l in lines2],
            [l.label for l in lines2],
            output_dir=out_dir,
        )

    pairs = _define_pairs(
        lines1, lines2,
        auto=args.pair if args.pair else None,
        log=log,
    )
    if not pairs:
        log.error("No valid line pairs defined. Aborting.")
        sys.exit(1)

    log.info(f"  {len(pairs)} pair(s): {[p.pair_id for p in pairs]}")

    # ══════════════════════════════════════════════════════════════════════════
    # STAGES 4-8 — per pair
    # ══════════════════════════════════════════════════════════════════════════
    all_angle_rows: List[AngleRow] = []
    reporter = BatchReporter(out_dir=out_dir)

    for pair in pairs:
        pid = pair.pair_id
        log.info(f"\n{'─'*66}\n  Processing {pid}\n{'─'*66}")

        # ── Stage 4 + 5 ───────────────────────────────────────────────────────
        _banner(4, f"G-vector selection + angle computation  [{pid}]", log)
        angle_rows, sel1, sel2 = _run_stage4(
            pair, gvecs1, gvecs2, g_select_map, log
        )
        all_angle_rows.extend(angle_rows)

        # Filter angle rows per image
        rows1 = [r for r in angle_rows if r.image == pair.line1.image]
        rows2 = [r for r in angle_rows if r.image == pair.line2.image]

        # ── Stage 6 — Up-vector solving ───────────────────────────────────────
        _banner(6, f"Up-vector solving  [{pid}]", log)

        def _run_solver(dl, sel, rows, gvecs, B, label):
            gmap     = {g.g_id: g for g in gvecs}
            ordered  = [gmap[gid] for gid in sel.g_ids]
            try:
                sr = solve_Up(
                    selected_gvecs=ordered,
                    angle_rows=rows,
                    B=B,
                    pair_id=pid,
                    image=dl.image,
                    line_id=dl.label,
                )
                if verbose:
                    print(format_solve_result(sr))
                return sr
            except Exception as exc:
                log.error(f"  {pid}/{label}: Stage 6 failed — {exc}")
                return None

        sr1 = _run_solver(pair.line1, sel1, rows1, gvecs1, B1, "TEM1")
        sr2 = _run_solver(pair.line2, sel2, rows2, gvecs2, B2, "TEM2")
        if sr1 is None or sr2 is None:
            continue

        # ── Stage 7 — True dislocation line ───────────────────────────────────
        _banner(7, f"True dislocation line  [{pid}]", log)
        tl = compute_true_line(sr1, sr2)
        if verbose:
            print(format_true_line(tl))

        # ── Stage 8 — Classification + slip plane ─────────────────────────────
        _banner(8, f"Classification + slip plane  [{pid}]", log)
        clf = classify(tl, burgers)
        if verbose:
            print(format_classify(clf))

        reporter.add(
            pair=pair, angle_rows=angle_rows,
            sr1=sr1, sr2=sr2,
            true_line=tl, clf=clf,
            B1=B1, B2=B2, burgers=burgers,
            gvecs1=gvecs1, gvecs2=gvecs2,
        )

    # ══════════════════════════════════════════════════════════════════════════
    # STAGE 9 — Batch output
    # ══════════════════════════════════════════════════════════════════════════
    _banner(9, "Batch CSV output + summary", log)

    write_angles_csv(all_angle_rows, os.path.join(out_dir, "angles_per_pair.csv"))
    results_path = reporter.write(force=args.force)
    reporter.print_summary()

    print(f"\n  ✓  All outputs written to: {out_dir}/")
    if results_path:
        print(f"  ✓  Main results file:       {results_path}")


# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = _build_parser()
    args   = parser.parse_args()
    log    = _setup_logging(args.log_level)

    interactive = args.interactive or not all([
        args.tem1, args.tem2, args.df1, args.df2,
        args.zone_axis1, args.zone_axis2, args.burgers,
    ])

    if interactive:
        print("\nInteractive mode enabled — enter missing values below or press Enter to accept defaults.\n")
        fileskh_root = Path(__file__).resolve().parent
        if not args.tem1:
            args.tem1 = _prompt_path(
                "TEM image 1",
                default=str(fileskh_root / "input" / "images" / "picture1.png"),
            )
        if not args.tem2:
            args.tem2 = _prompt_path(
                "TEM image 2",
                default=str(fileskh_root / "input" / "images" / "picture2.png"),
            )
        if not args.df1:
            args.df1 = _prompt_path(
                "Diffraction image 1",
                default=str(fileskh_root / "input" / "df" / "df1.png"),
            )
        if not args.df2:
            args.df2 = _prompt_path(
                "Diffraction image 2",
                default=str(fileskh_root / "input" / "df" / "df2.png"),
            )
        if not args.zone_axis1:
            args.zone_axis1 = _prompt_vector("Zone axis 1 (u v w)", default=[0.0, 0.0, 1.0])
        if not args.zone_axis2:
            args.zone_axis2 = _prompt_vector("Zone axis 2 (u v w)", default=[1.0, 1.0, 0.0])
        if not args.burgers:
            args.burgers = _prompt_vector("Burgers vector (h k l)", default=[1.0, 1.0, 0.0])

    for attr, flag in [("tem1","--tem1"),("tem2","--tem2"),
                       ("df1","--df1"),  ("df2","--df2")]:
        path = getattr(args, attr)
        if not path:
            parser.error(f"Missing required input: {flag}")
        if not os.path.isfile(path):
            log.error(f"{flag} file not found: {path!r}")
            sys.exit(1)

    try:
        run(args, log)
    except KeyboardInterrupt:
        log.warning("\nInterrupted by user.")
        sys.exit(0)
    except Exception as exc:
        log.exception(f"Pipeline error: {exc}")
        sys.exit(1)


if __name__ == "__main__":
    main()
