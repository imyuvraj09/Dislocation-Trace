# modules/__init__.py
from .pipeline_types import (
    DetectedLine, GVector, LinePair,
    GVecSelection, AngleRow,
    SolveResult, TrueLineResult, ClassifyResult, FinalResult,
)
from .line_detector     import load_image, detect_all_lines, detect_g_vectors
from .angle_calculator  import compute_pixel_angle, compute_angles_for_selection
from .equation_solver   import solve_Up, build_equation_matrix, diagnose_rank
from .true_line_solver  import compute_true_line, reduce_miller
from .classifier        import classify, classify_character, compute_slip_plane
from .batch_reporter    import (
    BatchReporter,
    write_lines_csv, write_gvec_csv, write_angles_csv,
    write_batch_csv, print_summary,
)

__all__ = [
    "DetectedLine", "GVector", "LinePair", "GVecSelection", "AngleRow",
    "SolveResult", "TrueLineResult", "ClassifyResult", "FinalResult",
    "load_image", "detect_all_lines", "detect_g_vectors",
    "compute_pixel_angle", "compute_angles_for_selection",
    "solve_Up", "build_equation_matrix", "diagnose_rank",
    "compute_true_line", "reduce_miller",
    "classify", "classify_character", "compute_slip_plane",
    "BatchReporter",
    "write_lines_csv", "write_gvec_csv", "write_angles_csv",
    "write_batch_csv", "print_summary",
]
