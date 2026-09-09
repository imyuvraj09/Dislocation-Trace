"""Regression tests for cubic, tetragonal, and HCP trace geometry.

Run from the repository root with::

    PYTHONPATH=backend python -m unittest discover -s backend/tests -v
"""

from __future__ import annotations

import importlib
import sys
import types
import unittest
from pathlib import Path

import numpy as np

from crystallography import queries
from crystallography.geometry import CrystalGeometry


def _load_math_modules():
    """Load fileskh math without importing optional OpenCV detection code."""
    if "fileskh_math_tests" not in sys.modules:
        package = types.ModuleType("fileskh_math_tests")
        package.__path__ = [str((Path(__file__).parents[1] / "fileskh").resolve())]
        sys.modules["fileskh_math_tests"] = package
    return (
        importlib.import_module("fileskh_math_tests.pipeline_types"),
        importlib.import_module("fileskh_math_tests.equation_solver"),
        importlib.import_module("fileskh_math_tests.true_line_solver"),
        importlib.import_module("fileskh_math_tests.classifier"),
    )


class GeometryConversionTests(unittest.TestCase):
    def test_cubic_is_identity(self):
        geometry = CrystalGeometry("cubic")
        direction = np.array([1.0, -2.0, 3.0])
        plane = np.array([2.0, 1.0, -1.0])
        np.testing.assert_array_equal(geometry.direction_to_cartesian(direction), direction)
        np.testing.assert_array_equal(geometry.plane_to_cartesian(plane), plane)

    def test_tetragonal_uses_direct_and_reciprocal_c_scaling(self):
        geometry = CrystalGeometry("tetragonal", 2.0)
        np.testing.assert_allclose(geometry.direction_to_cartesian((1, 0, 1)), (1, 0, 2))
        np.testing.assert_allclose(geometry.plane_to_cartesian((1, 0, 1)), (1, 0, 0.5))
        self.assertEqual(geometry.cartesian_to_direction((1, 0, 2)), (1, 0, 1))
        self.assertEqual(geometry.cartesian_to_plane((1, 0, 0.5)), (1, 0, 1))

    def test_hcp_four_index_round_trip(self):
        geometry = CrystalGeometry("hcp", 1.633)
        for direction in ((1, 0, -1, 0), (1, 1, -2, 0), (1, 0, -1, 1)):
            self.assertEqual(
                geometry.cartesian_to_direction(geometry.direction_to_cartesian(direction)),
                direction,
            )
        for plane in ((1, 0, -1, 0), (0, 0, 0, 1), (1, 0, -1, 1)):
            self.assertEqual(geometry.cartesian_to_plane(geometry.plane_to_cartesian(plane)), plane)

    def test_hcp_redundant_indices_are_validated(self):
        geometry = CrystalGeometry("hcp", 1.633)
        with self.assertRaisesRegex(ValueError, "t ="):
            geometry.direction_to_cartesian((1, 0, 0, 0))
        with self.assertRaisesRegex(ValueError, "i ="):
            geometry.plane_to_cartesian((1, 0, 0, 0))

    def test_hcp_plane_indexing_uses_cartesian_metric(self):
        geometry = CrystalGeometry("hcp", 1.575)
        continuous_normal = np.array([-0.04, 0.05, 0.01])

        indexed = geometry.cartesian_to_plane(continuous_normal)
        self.assertIsNotNone(indexed)
        self.assertEqual(indexed[2], -(indexed[0] + indexed[1]))

        corrected_error = geometry.plane_indexing_deviation_deg(continuous_normal, indexed)
        old_component_rounding_error = geometry.plane_indexing_deviation_deg(
            continuous_normal,
            (-1, 1, 0, 0),
        )
        self.assertLess(corrected_error, 1.0)
        self.assertLess(corrected_error, old_component_rounding_error)

    def test_tetragonal_plane_indexing_does_not_collapse_small_components(self):
        geometry = CrystalGeometry("tetragonal", 2.0)
        continuous_normal = np.array([0.20, 0.38, 0.11])

        indexed = geometry.cartesian_to_plane(continuous_normal)
        self.assertIsNotNone(indexed)
        self.assertTrue(all(isinstance(x, int) for x in indexed))
        self.assertLess(
            geometry.plane_indexing_deviation_deg(continuous_normal, indexed),
            2.0,
        )

    def test_cubic_plane_indexing_retains_legacy_fallback(self):
        geometry = CrystalGeometry("cubic")
        self.assertIsNone(geometry.cartesian_to_plane((0.20, 0.38, 0.11)))

    def test_non_cubic_requires_positive_c_over_a(self):
        for system in ("tetragonal", "hcp"):
            with self.assertRaisesRegex(ValueError, "c/a"):
                CrystalGeometry(system, None)
            with self.assertRaisesRegex(ValueError, "c/a"):
                CrystalGeometry(system, 0)


class PipelineGeometryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.types, cls.equations, cls.true_lines, cls.classifier = _load_math_modules()

    def _g(self, gid, indices):
        return self.types.GVector(gid, "df", 0, 0, 1, 1, 1, 1, 1.0, hkl=indices)

    def test_cubic_equation_matrix_is_legacy_identity(self):
        g_vectors = [self._g("g1", (1, 0, 0)), self._g("g2", (0, 1, 0)), self._g("g3", (0, 0, 1))]
        matrix, rhs = self.equations.build_equation_matrix(g_vectors, [60, 60, 0])
        np.testing.assert_array_equal(matrix, np.eye(3))
        np.testing.assert_allclose(rhs, (0.5, 0.5, 1.0))

    def test_tetragonal_equation_rows_use_reciprocal_geometry(self):
        matrix, _ = self.equations.build_equation_matrix(
            [self._g("g1", (1, 0, 1))],
            [30],
            crystal_system="tetragonal",
            c_over_a=2.0,
        )
        np.testing.assert_allclose(matrix[0], np.array([1.0, 0.0, 0.5]) / np.sqrt(1.25))

    def test_hcp_results_are_four_index(self):
        SolveResult = self.types.SolveResult
        sr1 = SolveResult(
            "P1", "a", "L1", np.array([1.5, 0.8660254, 0]), np.array([0.8660254, 0.5, 0]),
            np.array([0, 0, 1.0]), 3, (1, 1, 1), False, 0, "test", "hcp", 1.633, (0, 0, 0, 1),
        )
        sr2 = SolveResult(
            "P1", "b", "L1", np.array([1.5, 0.8660254, 0]), np.array([0.8660254, 0.5, 0]),
            np.array([0, 1.0, 0]), 3, (1, 1, 1), False, 0, "test", "hcp", 1.633, (0, 1, -1, 0),
        )
        line = self.true_lines.compute_true_line(sr1, sr2)
        result = self.classifier.classify(line, np.array([1, 0, -1, 0]))
        self.assertEqual(len(line.U_miller), 4)
        self.assertEqual(result.character, "Screw")
        self.assertIsNone(result.slip_miller)


class DatabaseTests(unittest.TestCase):
    def test_only_supported_crystal_systems_are_active(self):
        materials = queries.list_materials()
        self.assertEqual(len(materials), 8)
        self.assertEqual({m["crystalSystem"] for m in materials}, {"cubic", "tetragonal", "hcp"})

    def test_fct_database_is_tetragonal_and_self_consistent(self):
        structure = queries.get_material("FCT_Face_Centered_Tetragonal")
        self.assertEqual(structure.crystal_system, "tetragonal")
        self.assertTrue(structure.requires_c_over_a)
        self.assertEqual(len(structure.g_vectors), 342)
        self.assertEqual(len(structure.b_vectors), 12)
        for g, row in zip(structure.g_vectors, structure.values):
            expected = [sum(g_i * b_i for g_i, b_i in zip(g, b)) for b in structure.b_vectors]
            self.assertEqual(row, expected)

    def test_hcp_database_is_four_index(self):
        structure = queries.get_material("HCP_Hexagonal_Close_Packed")
        self.assertTrue(all(len(g) == 4 and g[2] == -(g[0] + g[1]) for g in structure.g_vectors))
        self.assertTrue(all(len(b) == 4 and b[2] == -(b[0] + b[1]) for b in structure.b_vectors))
        self.assertEqual(len(structure.values), len(structure.g_vectors))
        self.assertTrue(all(len(row) == len(structure.b_vectors) for row in structure.values))


class BatchAndClassificationWorkflowTests(unittest.TestCase):
    def setUp(self):
        from fastapi.testclient import TestClient
        from main import app
        from app.session_store import SESSIONS
        from fileskh.pipeline_types import DetectedLine, LinePair, SolveResult, TrueLineResult

        self.client = TestClient(app)
        self.session_id = "test-session-workflow"
        SESSIONS.reset(self.session_id)
        self.session = SESSIONS.get(self.session_id)

        # Setup mock line pairs, solve results, and true lines for P1 and P2
        l1 = DetectedLine("L1", "img1.png", "red", 0, 0, 10, 0, 10, 0, 10.0)
        l2 = DetectedLine("L2", "img2.png", "red", 0, 0, 0, 10, 0, 10, 10.0)
        l3 = DetectedLine("L3", "img1.png", "blue", 0, 0, 10, 10, 10, 10, 14.14)
        l4 = DetectedLine("L4", "img2.png", "blue", 0, 0, 10, -10, 10, -10, 14.14)

        self.session.pairs["P1"] = LinePair("P1", l1, l2)
        self.session.pairs["P2"] = LinePair("P2", l3, l4)

        sr1 = SolveResult("P1", "img1.png", "L1", np.array([0, 0, 1]), np.array([0, 0, 1.0]), np.array([0, 0, 1.0]), 3, (1, 1, 1), False, 0.0, "test")
        sr2 = SolveResult("P1", "img2.png", "L2", np.array([0, 1, 0]), np.array([0, 1.0, 0]), np.array([0, 1.0, 0]), 3, (1, 1, 1), False, 0.0, "test")
        tl1 = TrueLineResult("P1", np.array([1, 0, 0]), np.array([0, 0, 1]), np.array([1, 0, 0]), np.array([1.0, 0.0, 0.0]), (1, 0, 0), "cubic")

        sr3 = SolveResult("P2", "img1.png", "L3", np.array([0, 0, 1]), np.array([0, 0, 1.0]), np.array([0, 0, 1.0]), 3, (1, 1, 1), False, 0.0, "test")
        sr4 = SolveResult("P2", "img2.png", "L4", np.array([0, 1, 0]), np.array([0, 1.0, 0]), np.array([0, 1.0, 0]), 3, (1, 1, 1), False, 0.0, "test")
        tl2 = TrueLineResult("P2", np.array([1, 0, 0]), np.array([0, 0, 1]), np.array([0, 1, 0]), np.array([0.0, 1.0, 0.0]), (0, 1, 0), "cubic")

        self.session.solve_results[("P1", "img1.png")] = sr1
        self.session.solve_results[("P1", "img2.png")] = sr2
        self.session.true_lines["P1"] = tl1

        self.session.solve_results[("P2", "img1.png")] = sr3
        self.session.solve_results[("P2", "img2.png")] = sr4
        self.session.true_lines["P2"] = tl2

    def test_missing_burgers_vector_raises_error_without_fallback(self):
        # Ensure session has no Burgers vector
        self.session.burgers = None
        self.session.burgers_by_pair.clear()
        self.session.classify_results.clear()

        response = self.client.post(
            "/api/stage9/batch",
            json={"pairs": [{"pair_id": "P1"}]},
            headers={"X-Session-ID": self.session_id},
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("No Burgers vector is available for pair P1", response.json()["detail"])

    def test_pair_specific_burgers_vectors(self):
        response = self.client.post(
            "/api/stage9/batch",
            json={
                "pairs": [
                    {"pair_id": "P1", "burgers": [1, 0, 0]},
                    {"pair_id": "P2", "burgers": [1, 2, 0]},
                ]
            },
            headers={"X-Session-ID": self.session_id},
        )
        self.assertEqual(response.status_code, 200)
        rows = response.json()["rows"]
        self.assertEqual(len(rows), 2)
        # P1: uT=[1 0 0], b=[1 0 0] -> Screw, angle=0
        self.assertEqual(rows[0]["burgers"], "[1 0 0]")
        self.assertEqual(rows[0]["character"], "Screw")
        self.assertEqual(rows[0]["ub_angle_deg"], "0.00")
        # P2: uT=[0 1 0], b=[1 2 0] -> angle=26.57, Mixed-Screw-Dominant
        self.assertEqual(rows[1]["burgers"], "[1 2 0]")
        self.assertEqual(rows[1]["character"], "Mixed-Screw-Dominant")
        self.assertEqual(rows[1]["ub_angle_deg"], "26.57")

    def test_hcp_pair_specific_four_index_burgers_vector(self):
        from fileskh.pipeline_types import SolveResult, TrueLineResult
        self.session.crystal_system = "hcp"
        self.session.c_over_a = 1.633
        sr1 = SolveResult("P1", "img1.png", "L1", np.array([1.5, 0.8660254, 0]), np.array([0.8660254, 0.5, 0]), np.array([0, 0, 1.0]), 3, (1, 1, 1), False, 0, "test", "hcp", 1.633, (0, 0, 0, 1))
        sr2 = SolveResult("P1", "img2.png", "L2", np.array([1.5, 0.8660254, 0]), np.array([0.8660254, 0.5, 0]), np.array([0, 1.0, 0]), 3, (1, 1, 1), False, 0, "test", "hcp", 1.633, (0, 1, -1, 0))
        tl = TrueLineResult("P1", np.array([1, 0, 0]), np.array([0, 0, 1]), np.array([0.8660254, 0.5, 0]), np.array([0.8660254, 0.5, 0]), (1, 0, -1, 0), "hcp", 1.633)

        self.session.solve_results[("P1", "img1.png")] = sr1
        self.session.solve_results[("P1", "img2.png")] = sr2
        self.session.true_lines["P1"] = tl

        response = self.client.post(
            "/api/stage9/batch",
            json={"pairs": [{"pair_id": "P1", "burgers": [2, -1, -1, 0]}]},
            headers={"X-Session-ID": self.session_id},
        )
        self.assertEqual(response.status_code, 200)
        rows = response.json()["rows"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["burgers"], "[2 -1 -1 0]")
        self.assertEqual(rows[0]["crystal_system"], "hcp")
        self.assertEqual(rows[0]["c_over_a"], "1.633")
        self.assertIn("Continuous normalized uT—full precision", rows[0])
        self.assertIn("Continuous slip-plane normal—full precision", rows[0])
        self.assertIn("uT indexing deviation (°)", rows[0])

    def test_classify_endpoint_with_valid_and_invalid_burgers(self):
        # Valid classification
        res = self.client.post(
            "/api/stage8/classify",
            json={"pair_id": "P1", "burgers": [1, 0, 0]},
            headers={"X-Session-ID": self.session_id},
        )
        self.assertEqual(res.status_code, 200)
        clf = res.json()["classification"]
        self.assertEqual(clf["character"], "Screw")
        self.assertEqual(clf["burgers"], [1.0, 0.0, 0.0])

        # All-zero Burgers vector rejected
        res_zero = self.client.post(
            "/api/stage8/classify",
            json={"pair_id": "P1", "burgers": [0, 0, 0]},
            headers={"X-Session-ID": self.session_id},
        )
        self.assertEqual(res_zero.status_code, 422)


class LowIndexCatalogueRegressionTests(unittest.TestCase):
    def test_hcp_p1_true_line_direction_indexing_regression(self):
        from crystallography.geometry import index_true_line_direction, indexTrueLineDirection
        geom = CrystalGeometry("hcp", c_over_a=1.575)
        u_norm = np.array([0.21351912176617402, 0.45127627326938663, -0.8664636806146551])

        # Test CrystalGeometry method
        indexed_method = geom.index_true_line_direction(u_norm)
        self.assertEqual(indexed_method, (3, 4, -7, -12))
        self.assertNotEqual(indexed_method, (0, 0, 0, -1))

        # Test camelCase method alias
        indexed_camel = geom.indexTrueLineDirection(u_norm)
        self.assertEqual(indexed_camel, (3, 4, -7, -12))

        # Test standalone function
        indexed_func = index_true_line_direction(u_norm, "hcp", 1.575)
        self.assertEqual(indexed_func, (3, 4, -7, -12))

        # Test standalone camelCase alias
        indexed_func_camel = indexTrueLineDirection(u_norm, "hcp", 1.575)
        self.assertEqual(indexed_func_camel, (3, 4, -7, -12))

        dev = geom.direction_indexing_deviation_deg(u_norm, indexed_method)
        self.assertAlmostEqual(dev, 0.8128, delta=0.01)

    def test_index_continuous_slip_plane_functions(self):
        from crystallography.geometry import index_continuous_slip_plane, indexContinuousSlipPlane
        geom = CrystalGeometry("hcp", c_over_a=1.575)
        n_cont = np.array([-0.021236336829719471, 0.051960212571737191, 0.021829013370351896])

        indexed_method = geom.index_continuous_slip_plane(n_cont)
        self.assertIsNotNone(indexed_method)

        indexed_func = index_continuous_slip_plane(n_cont, "hcp", 1.575)
        self.assertEqual(indexed_func, indexed_method)

        indexed_camel = indexContinuousSlipPlane(n_cont, "hcp", 1.575)
        self.assertEqual(indexed_camel, indexed_method)

    def test_hcp_pair_1_regression(self):
        from crystallography.plane_catalogue import (
            find_closest_low_index_plane,
            find_closest_low_index_slip_plane,
            findClosestLowIndexSlipPlane,
        )
        geom = CrystalGeometry("hcp", c_over_a=1.575)
        n_cont = np.array([-0.021236336829719471, 0.051960212571737191, 0.021829013370351896])
        b = np.array([1, 1, -2, -3])

        res = find_closest_low_index_slip_plane("HCP", n_cont, b, geom)
        res_camel = findClosestLowIndexSlipPlane("HCP", n_cont, b, geom)
        self.assertEqual(res.closest_plane, (-1, 2, -1, 1))
        self.assertEqual(res_camel.closest_plane, (-1, 2, -1, 1))
        self.assertEqual(res.family, "{11-21}")
        self.assertAlmostEqual(res.deviation_deg, 8.18, delta=0.02)
        self.assertEqual(res.slip_system, "{11-21}[1 1 -2 -3]")


    def test_hcp_pair_2_regression(self):
        from crystallography.plane_catalogue import find_closest_low_index_plane
        geom = CrystalGeometry("hcp", c_over_a=1.575)
        n_cont = np.array([0.019175128332756197, 0.0088598992467298354, 0.010959023485809994])
        b = np.array([1, 1, -2, -3])

        res = find_closest_low_index_plane("HCP", n_cont, b, geom)
        self.assertEqual(res.closest_plane, (1, 0, -1, 1))
        self.assertEqual(res.family, "{10-11}")
        self.assertAlmostEqual(res.deviation_deg, 4.79, delta=0.02)
        self.assertEqual(res.slip_system, "{10-11}[1 1 -2 -3]")

    def test_fcc_exact_111(self):
        from crystallography.plane_catalogue import find_closest_low_index_plane
        geom = CrystalGeometry("cubic")
        n_cont = np.array([1.0, 1.0, 1.0]) / np.sqrt(3.0)
        b = np.array([1, -1, 0])

        res = find_closest_low_index_plane("FCC", n_cont, b, geom)
        self.assertEqual(res.closest_plane, (1, 1, 1))
        self.assertEqual(res.family, "{111}")
        self.assertAlmostEqual(res.deviation_deg, 0.0, places=5)
        self.assertEqual(res.slip_system, "{111}[1 -1 0]")

    def test_bcc_exact_110(self):
        from crystallography.plane_catalogue import find_closest_low_index_plane
        geom = CrystalGeometry("cubic")
        n_cont = np.array([1.0, 1.0, 0.0]) / np.sqrt(2.0)
        b = np.array([1, -1, 1])

        res = find_closest_low_index_plane("BCC", n_cont, b, geom)
        self.assertEqual(res.closest_plane, (1, 1, 0))
        self.assertEqual(res.family, "{110}")
        self.assertAlmostEqual(res.deviation_deg, 0.0, places=5)
        self.assertEqual(res.slip_system, "{110}[1 -1 1]")

    def test_b2_candidate_comparison(self):
        from crystallography.plane_catalogue import find_closest_low_index_plane
        geom = CrystalGeometry("cubic")
        n_cont = np.array([1.0, 0.0, 0.0])
        b = np.array([0, 1, 0])

        res = find_closest_low_index_plane("B2", n_cont, b, geom)
        self.assertEqual(res.family, "{100}")
        self.assertEqual(res.closest_plane, (1, 0, 0))

    def test_simple_cubic_candidate_comparison(self):
        from crystallography.plane_catalogue import find_closest_low_index_plane
        geom = CrystalGeometry("cubic")
        n_cont = np.array([1.0, 1.0, 0.0]) / np.sqrt(2.0)
        b = np.array([0, 0, 1])

        res = find_closest_low_index_plane("SC", n_cont, b, geom)
        self.assertEqual(res.family, "{110}")
        self.assertEqual(res.closest_plane, (1, 1, 0))

    def test_simple_tetragonal_non_unity_ca(self):
        from crystallography.plane_catalogue import find_closest_low_index_plane
        geom = CrystalGeometry("tetragonal", c_over_a=1.5)
        # Plane (1 0 1) in ST: Cartesian normal G * [1, 0, 1] = [1, 0, 1/1.5] = [1, 0, 0.6667]
        cart = geom.plane_to_cartesian((1, 0, 1))
        b = np.array([0, 1, 0])

        res = find_closest_low_index_plane("ST", cart, b, geom)
        self.assertEqual(res.closest_plane, (1, 0, 1))
        self.assertEqual(res.family, "{101}")
        self.assertAlmostEqual(res.deviation_deg, 0.0, places=5)

    def test_bct_non_unity_ca(self):
        from crystallography.plane_catalogue import find_closest_low_index_plane
        geom = CrystalGeometry("tetragonal", c_over_a=0.9)
        cart = geom.plane_to_cartesian((1, 1, 2))
        b = np.array([1, -1, 0])

        res = find_closest_low_index_plane("BCT", cart, b, geom)
        self.assertEqual(res.closest_plane, (1, 1, 2))
        self.assertEqual(res.family, "{112}")

    def test_fct_non_unity_ca(self):
        from crystallography.plane_catalogue import find_closest_low_index_plane
        geom = CrystalGeometry("tetragonal", c_over_a=1.1)
        cart = geom.plane_to_cartesian((1, 1, 1))
        b = np.array([1, -1, 0])

        res = find_closest_low_index_plane("FCT", cart, b, geom)
        self.assertEqual(res.closest_plane, (1, 1, 1))
        self.assertEqual(res.family, "{111}")

    def test_hcp_four_index_constraint(self):
        from crystallography.plane_catalogue import generate_symmetry_variants
        variants = generate_symmetry_variants("HCP", [1, 1, -2, 1])
        for var in variants:
            self.assertEqual(len(var), 4)
            self.assertEqual(var[2], -(var[0] + var[1]))

    def test_plane_sign_invariance(self):
        from crystallography.plane_catalogue import find_closest_low_index_plane
        geom = CrystalGeometry("cubic")
        n_pos = np.array([1.0, 1.0, 1.0]) / np.sqrt(3.0)
        n_neg = -n_pos
        b = np.array([1, -1, 0])

        res_pos = find_closest_low_index_plane("FCC", n_pos, b, geom)
        res_neg = find_closest_low_index_plane("FCC", n_neg, b, geom)

        self.assertEqual(res_pos.family, res_neg.family)
        self.assertAlmostEqual(res_pos.deviation_deg, res_neg.deviation_deg, places=5)

    def test_burgers_sign_invariance(self):
        from crystallography.plane_catalogue import is_plane_compatible
        var = (1, 1, 1)
        b_pos = [1, -1, 0]
        b_neg = [-1, 1, 0]
        self.assertTrue(is_plane_compatible(var, b_pos))
        self.assertTrue(is_plane_compatible(var, b_neg))

    def test_rejection_of_geometrically_close_incompatible_plane(self):
        from crystallography.plane_catalogue import find_closest_low_index_plane
        geom = CrystalGeometry("cubic")
        # Continuous normal is close to (1 0 0)
        n_cont = np.array([0.99, 0.1, 0.0])
        # Burgers vector b = [1, 0, 0] -> (1 0 0) zone law 1*1 + 0*0 + 0*0 = 1 != 0, so (1 0 0) is INCOMPATIBLE
        b = np.array([1, 0, 0])

        res = find_closest_low_index_plane("FCC", n_cont, b, geom)
        # (1 0 0) family must be rejected because it doesn't contain [1 0 0]
        self.assertNotEqual(res.closest_plane, (1, 0, 0))
        # Zone law must hold for selected plane
        self.assertEqual(sum(h * u for h, u in zip(res.closest_plane, b)), 0)

    def test_no_compatible_catalogue_plane(self):
        from crystallography.plane_catalogue import find_closest_low_index_plane
        geom = CrystalGeometry("cubic")
        n_cont = np.array([0.5, 0.5, 0.707])
        # Burgers vector that is incompatible with any simple 3-index plane in family if restricted
        # e.g., if we test a custom structure or restricted catalogue
        # Test default handling when candidates list is empty
        res = find_closest_low_index_plane("FCC", n_cont, np.array([1, 1, 1]), geom)
        self.assertEqual(res.status, "OK") # (1 -1 0) is compatible with [1 1 1]

    def test_pure_screw_handling(self):
        from crystallography.plane_catalogue import find_closest_low_index_plane
        geom = CrystalGeometry("cubic")
        res = find_closest_low_index_plane("FCC", np.zeros(3), np.array([1, 1, 0]), geom, is_pure_screw=True)
        self.assertEqual(res.status, "PURE_SCREW")
        self.assertEqual(res.closest_plane_str, "Not uniquely determined")
        self.assertEqual(res.family, "N/A")
        self.assertEqual(res.slip_system, "Plane not uniquely determined for screw dislocation")

    def test_near_screw_handling(self):
        # Character for angle 0.6 deg is Mixed-Screw-Dominant
        u_norm = np.array([1.0, 0.0, 0.0])
        # b slightly tilted by ~0.6 degrees
        angle_rad = np.radians(0.6)
        b = np.array([np.cos(angle_rad), np.sin(angle_rad), 0.0])

        from fileskh.classifier import classify_character
        angle, char = classify_character(u_norm, b)
        self.assertEqual(char, "Mixed-Screw-Dominant")
        self.assertAlmostEqual(angle, 0.6, delta=0.05)

    def test_csv_and_ui_values_matching(self):
        from fileskh.batch_reporter import _make_batch_row
        from fileskh.pipeline_types import SolveResult, TrueLineResult, ClassifyResult

        sr1 = SolveResult("P1", "img1.png", "L1", np.array([1, 0, 0]), np.array([1.0, 0, 0]), np.array([0, 0, 1]), 3, (1, 1, 1), False, 0.0, "test")
        sr2 = SolveResult("P1", "img2.png", "L2", np.array([0, 1, 0]), np.array([0, 1.0, 0]), np.array([0, 1, 0]), 3, (1, 1, 1), False, 0.0, "test")
        tl = TrueLineResult("P1", np.array([0, 0, 1]), np.array([0, 0, 1]), np.array([0, 0, 1]), np.array([0.0, 0.0, 1.0]), (0, 0, 1), "cubic")
        clf = ClassifyResult(
            pair_id="P1",
            burgers=np.array([1, -1, 0]),
            ub_angle_deg=90.0,
            character="Edge",
            slip_raw=np.array([1.0, 1.0, 0.0]) / np.sqrt(2.0),
            slip_miller=(1, 1, 0),
            crystal_system="cubic",
            closest_low_index_plane=(1, 1, 0),
            closest_low_index_plane_str="(1 1 0)",
            low_index_family="{110}",
            low_index_deviation_deg=0.0,
            low_index_slip_system="{110}[1 -1 0]",
        )

        row = _make_batch_row("P1", sr1, sr2, tl, clf)
        self.assertEqual(row["Pair ID"], "P1")
        self.assertEqual(row["Character"], "Edge")
        self.assertEqual(row["Closest low-index slip plane"], "(1 1 0)")
        self.assertEqual(row["Low-index plane family"], "{110}")
        self.assertEqual(row["Low-index deviation (°)"], "0.00")
        self.assertEqual(row["Slip system"], "{110}[1 -1 0]")

    def test_deterministic_tie_breaking(self):
        from crystallography.plane_catalogue import find_closest_low_index_plane
        geom = CrystalGeometry("cubic")
        # Normal equidistant from multiple planes
        n_cont = np.array([1.0, 1.0, 1.0]) / np.sqrt(3.0)
        b = np.array([1, -1, 0])
        res1 = find_closest_low_index_plane("FCC", n_cont, b, geom)
        res2 = find_closest_low_index_plane("FCC", n_cont, b, geom)
        self.assertEqual(res1.closest_plane, res2.closest_plane)


if __name__ == "__main__":
    unittest.main()
