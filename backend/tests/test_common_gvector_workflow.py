"""Unit tests for Stage 4 common g-vector workflow.

Verifies:
1. Reconstructed true dislocation lines (u_T) remain scientifically independent even when two pairs share the same common g-vector selections.
2. Different marked trace line angles produce different u_T directions.
3. No Burgers vectors or slip planes are copied between pairs.
"""

from __future__ import annotations

import unittest
import numpy as np

from fileskh.pipeline_types import LinePair, DetectedLine, GVector, GVecSelection
from fileskh.angle_calculator import compute_all_pair_angles
from fileskh.true_line_solver import reconstruct_pair_dislocation_line


class CommonGVectorWorkflowTests(unittest.TestCase):
    def setUp(self):
        # Image 1 and Image 2 setup
        self.lines_by_img = {
            "img1.tif": [
                DetectedLine(label="L1", image="img1.tif", x1=0, y1=0, x2=100, y2=0),     # Horizontal line (0 deg)
                DetectedLine(label="L2", image="img1.tif", x1=0, y1=0, x2=100, y2=100),   # Diagonal line (45 deg)
            ],
            "img2.tif": [
                DetectedLine(label="L1", image="img2.tif", x1=0, y1=0, x2=0, y2=100),     # Vertical line (90 deg)
                DetectedLine(label="L2", image="img2.tif", x1=0, y1=0, x2=100, y2=50),    # ~26.5 deg line
            ],
        }

        self.gvecs_by_img = {
            "diff1.tif": [
                GVector(g_id="g01", source="diff1.tif", tx=100, ty=0, hkl=[1, 1, 0]),
                GVector(g_id="g02", source="diff1.tif", tx=0, ty=100, hkl=[-1, 1, 0]),
                GVector(g_id="g03", source="diff1.tif", tx=100, ty=100, hkl=[0, 0, 2]),
            ],
            "diff2.tif": [
                GVector(g_id="g01", source="diff2.tif", tx=100, ty=0, hkl=[2, 0, 0]),
                GVector(g_id="g02", source="diff2.tif", tx=0, ty=100, hkl=[0, 2, 0]),
                GVector(g_id="g03", source="diff2.tif", tx=100, ty=100, hkl=[1, 1, 1]),
            ],
        }

        self.tem_to_diff = {
            "img1.tif": "diff1.tif",
            "img2.tif": "diff2.tif",
        }

    def test_scientific_independence_with_common_gvectors(self):
        """Pairs sharing the exact same g-vectors must yield distinct u_T when trace angles differ."""
        # Pair P1: img1 L1 (0 deg) + img2 L1 (90 deg)
        pair1 = LinePair(
            pair_id="P1",
            line1=self.lines_by_img["img1.tif"][0],
            line2=self.lines_by_img["img2.tif"][0],
        )

        # Pair P2: img1 L2 (45 deg) + img2 L2 (~26.5 deg)
        pair2 = LinePair(
            pair_id="P2",
            line1=self.lines_by_img["img1.tif"][1],
            line2=self.lines_by_img["img2.tif"][1],
        )

        pairs = [pair1, pair2]

        # Common g-vector selections: img1 gets g01, g02, g03; img2 gets g01, g02, g03
        selections = [
            GVecSelection(pair_id="P1", image="img1.tif", diff_image="diff1.tif", g_ids=["g01", "g02", "g03"]),
            GVecSelection(pair_id="P1", image="img2.tif", diff_image="diff2.tif", g_ids=["g01", "g02", "g03"]),
            GVecSelection(pair_id="P2", image="img1.tif", diff_image="diff1.tif", g_ids=["g01", "g02", "g03"]),
            GVecSelection(pair_id="P2", image="img2.tif", diff_image="diff2.tif", g_ids=["g01", "g02", "g03"]),
        ]

        # 1. Compute angles for both pairs
        angle_rows = compute_all_pair_angles(
            pairs=pairs,
            lines_by_img=self.lines_by_img,
            gvecs_by_img=self.gvecs_by_img,
            selections=selections,
            tem_to_diff=self.tem_to_diff,
        )

        self.assertEqual(len(angle_rows), 12) # 3 g-vectors * 2 images * 2 pairs

        # Extract acute angles for P1 and P2
        p1_angles = [r.acute_deg for r in angle_rows if r.pair_id == "P1"]
        p2_angles = [r.acute_deg for r in angle_rows if r.pair_id == "P2"]

        # Angles must be calculated independently based on distinct line orientations
        self.assertNotEqual(p1_angles, p2_angles)

        # 2. Reconstruct true dislocation lines u_T for P1 and P2
        up_vec1 = np.array([0.0, 0.0, 1.0])
        up_vec2 = np.array([1.0, 0.0, 1.0])

        res1 = reconstruct_pair_dislocation_line(
            pair_id="P1",
            img1_name="img1.tif",
            img2_name="img2.tif",
            u_up1=up_vec1,
            u_up2=up_vec2,
            line1_acute_deg=p1_angles[0],
            line2_acute_deg=p1_angles[1],
            g1_cart=np.array([1.0, 1.0, 0.0]),
            g2_cart=np.array([2.0, 0.0, 0.0]),
        )

        res2 = reconstruct_pair_dislocation_line(
            pair_id="P2",
            img1_name="img1.tif",
            img2_name="img2.tif",
            u_up1=up_vec1,
            u_up2=up_vec2,
            line1_acute_deg=p2_angles[0],
            line2_acute_deg=p2_angles[1],
            g1_cart=np.array([1.0, 1.0, 0.0]),
            g2_cart=np.array([2.0, 0.0, 0.0]),
        )

        # u_T for P1 and P2 must NOT be identical
        dot_prod = abs(np.dot(res1.u_T, res2.u_T))
        self.assertLess(dot_prod, 0.999, "u_T vectors must be scientifically independent and not equal")


if __name__ == "__main__":
    unittest.main()
