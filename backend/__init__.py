"""
backend package init.

Adds this directory to sys.path so the untouched `fileskh` pipeline
package (backend/fileskh/) can be imported as a top-level package
(`import fileskh`) from anywhere in the API layer, the same way
pipeline.py itself would when run directly from this folder. This is
the only "modification" made to enable integration -- no file inside
fileskh/ is changed.
"""

import sys
from pathlib import Path

_backend_dir = Path(__file__).resolve().parent
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))
