"""
tests/test_math.py
==================
Headless math smoke-test — no images, no GUI required.

  python tests/test_math.py
  pytest  tests/test_math.py -v
"""

from __future__ import annotations
import math, os, sys
import numpy as np

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from .angle_calculator import compute_pixel_angle
from .equation_solver  import build_equation_matrix, solve_Up, diagnose_rank
from .true_line_solver import compute_true_line, reduce_miller
from .classifier       import classify, classify_character, compute_slip_plane
from .pipeline_types import AngleRow, GVector, SolveResult, TrueLineResult

PASS = True

def check(name, got, expected, tol=1e-4):
    global PASS
    if got is None or expected is None:
        ok = got is expected
    else:
        g = np.asarray(got,      dtype=float)
        e = np.asarray(expected, dtype=float)
        ok = bool(np.allclose(g, e, atol=tol))
    print(f"  {'PASS' if ok else 'FAIL'}  {name}")
    if not ok:
        PASS = False
        print(f"       got={got}  expected={expected}")
    return ok

# ── angle_calculator ──────────────────────────────────────────────────────────
print("\n── compute_pixel_angle ─────────────────────────────────────────────")
r,a = compute_pixel_angle(1,0, 1,0);  check("parallel  raw=0",  r, 0.0); check("parallel  acute=0",  a, 0.0)
r,a = compute_pixel_angle(1,0, 0,1);  check("perp      raw=90", r,90.0); check("perp      acute=90", a,90.0)
r,a = compute_pixel_angle(1,0, 1,1);  check("45°  raw=45",      r,45.0); check("45°  acute=45",     a,45.0)
r,a = compute_pixel_angle(1,0,-1,1);  check("135° raw=135",     r,135.0); check("135° folds→45",    a,45.0)
r,a = compute_pixel_angle(1,0,-1,0);  check("180° raw=180",     r,180.0); check("180° folds→0",     a, 0.0)

# ── reduce_miller ─────────────────────────────────────────────────────────────
print("\n── reduce_miller ───────────────────────────────────────────────────")
check("[2 2 0]→[1 1 0]", reduce_miller(np.array([2.,2.,0.])),  (1,1,0))
check("[3 0 3]→[1 0 1]", reduce_miller(np.array([3.,0.,3.])),  (1,0,1))
check("[0 0 0]→None",       reduce_miller(np.array([0,0,0],dtype=float)), None)
check("[6 3 0]→[2 1 0]", reduce_miller(np.array([6.,3.,0.])),  (2,1,0))

# ── build_equation_matrix ─────────────────────────────────────────────────────
print("\n── build_equation_matrix ───────────────────────────────────────────")
g1 = GVector("g01","df",0,0,100,  0, 100,  0,100.,hkl=(1,0,0))
g2 = GVector("g02","df",0,0,  0,100,   0,100,100.,hkl=(0,1,0))
g3 = GVector("g03","df",0,0,  0,  0,-100,  0,100.,hkl=(0,0,1))
A,b = build_equation_matrix([g1,g2,g3],[0.,90.,45.])
check("A row0=[1,0,0]", A[0],[1,0,0]); check("A row1=[0,1,0]", A[1],[0,1,0])
check("b[0]=cos(0)=1",  b[0], 1.0)
check("b[1]=cos(90)=0", b[1], 0.0, tol=1e-9)
check("b[2]=cos(45)",   b[2], math.cos(math.radians(45)), tol=1e-6)

# ── solve_Up ──────────────────────────────────────────────────────────────────
print("\n── solve_Up  (B=[0,0,1], target Up=[1,1,0]/√2) ────────────────────")
B1 = np.array([0,0,1],dtype=float)
Up_true = np.array([1,1,0],dtype=float)/math.sqrt(2)

sg1 = GVector("g01","df",0,0,100,  0,100,  0,100.,hkl=(1,0,0))
sg2 = GVector("g02","df",0,0,  0,100,  0,100,100.,hkl=(0,1,0))
sg3 = GVector("g03","df",0,0,100,100,100,100,141.,hkl=(1,1,0))

thetas = [math.degrees(math.acos(abs(float(
    np.dot(np.array(g.hkl,float)/np.linalg.norm(g.hkl), Up_true)
)))) for g in [sg1,sg2,sg3]]

a_rows = [AngleRow("P1","t.png","L1",g.g_id,100,100,g.vx,g.vy,0.,round(t,6))
          for g,t in zip([sg1,sg2,sg3],thetas)]

sr = solve_Up([sg1,sg2,sg3], a_rows, B1, "P1","t.png","L1")
dot = abs(float(np.dot(sr.Up_norm, Up_true)))
check("Up·target ≈ 1.0", dot, 1.0, tol=1e-3)
check("Up·B ≈ 0.0",      float(np.dot(sr.Up_norm,B1)), 0.0, tol=1e-6)
check("rank ≤ 2",        sr.rank <= 2, True)

# ── compute_true_line ─────────────────────────────────────────────────────────
print("\n── compute_true_line ───────────────────────────────────────────────")
u_tgt = np.array([1,1,1],dtype=float)/math.sqrt(3)

def _proj(u,B):
    Bh=B/np.linalg.norm(B); p=u-np.dot(u,Bh)*Bh; return p/np.linalg.norm(p)

def _sr(pid,img,Up,B):
    return SolveResult(pid,img,"L1",Up,Up,B,2,(1,1,1),True,0.,"test")

B1t=np.array([1,0,0],dtype=float); B2t=np.array([0,1,0],dtype=float)
sr1t=_sr("P1","t1.png",_proj(u_tgt,B1t),B1t)
sr2t=_sr("P1","t2.png",_proj(u_tgt,B2t),B2t)
tl=compute_true_line(sr1t,sr2t)
check("true_line ≈ [1,1,1]/√3",
      abs(float(np.dot(tl.U_norm,u_tgt))), 1.0, tol=1e-4)

# ── classify ──────────────────────────────────────────────────────────────────
print("\n── classify_character ──────────────────────────────────────────────")
ang,ch = classify_character(np.array([1,1,0],dtype=float)/math.sqrt(2),
                             np.array([1,1,0],dtype=float))
check("screw angle≈0",   ang, 0.0, tol=0.1); check("screw char", ch=="Screw", True)

ang,ch = classify_character(np.array([0,1,0],dtype=float),
                             np.array([1,0,0],dtype=float))
check("edge angle≈90",   ang,90.0,tol=0.1); check("edge char",  ch=="Edge", True)

ang,ch = classify_character(np.array([1,1,0],dtype=float)/math.sqrt(2),
                             np.array([1,0,0],dtype=float))
check("mixed-screw angle≈45", ang,45.0,tol=0.2); check("mixed-screw char", ch=="Mixed-Screw-Dominant", True)

ang,ch = classify_character(np.array([1,2,0],dtype=float)/math.sqrt(5),
                             np.array([1,0,0],dtype=float))
check("mixed-edge angle≈63.4", ang, 63.4, tol=0.5); check("mixed-edge char", ch=="Mixed-Edge-Dominant", True)

# ── slip plane ────────────────────────────────────────────────────────────────
print("\n── compute_slip_plane ──────────────────────────────────────────────")
raw_n,mill = compute_slip_plane(np.array([0,1,0],dtype=float),
                                np.array([1,0,0],dtype=float))
check("slip direction ≈ [0,0,1]", raw_n, [0,0,1], tol=0.01)
check("slip Miller=(0,0,1)",      mill,  (0,0,1))

# ── end-to-end ────────────────────────────────────────────────────────────────
print("\n── end-to-end  [u=[1,1,1], b=[1,1,0] → Mixed-Screw-Dominant ≈35.26°] ────────────")
b_int = np.array([1,1,0],dtype=float)
tl_e2e = TrueLineResult("E2E",
    np.cross(_proj(u_tgt,B1t),B1t), np.cross(_proj(u_tgt,B2t),B2t),
    u_tgt, u_tgt, reduce_miller(u_tgt))
clf = classify(tl_e2e, b_int)
exp_ang = math.degrees(math.acos(abs(float(np.dot(u_tgt,b_int/np.linalg.norm(b_int))))))
check("e2e angle≈35.26", clf.ub_angle_deg, exp_ang, tol=0.5)
check("e2e Mixed-Screw-Dominant", clf.character=="Mixed-Screw-Dominant", True)

print("\n" + "═"*52)
print("  ALL TESTS PASSED ✓" if PASS else "  SOME TESTS FAILED ✗")
print("═"*52+"\n")
sys.exit(0 if PASS else 1)
