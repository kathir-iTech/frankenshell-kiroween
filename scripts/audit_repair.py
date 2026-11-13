import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "python"))

from frankenshell.audit import main

raise SystemExit(main())
