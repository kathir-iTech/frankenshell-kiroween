import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "python"))

from frankenshell.audit import main
from frankenshell.runner import find_counterexample, run_pack


class CheckoutAuditTests(unittest.TestCase):
    def test_new_regression_is_detected_and_replayed(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            before, after = root / "before", root / "after"
            before.mkdir()
            after.mkdir()
            (before / "invoice.py").write_text(
                "def amount(value):\n    return value if value is not None else 10\n",
                encoding="utf-8",
            )
            (after / "invoice.py").write_text(
                "def amount(value):\n    return value or 10\n", encoding="utf-8"
            )
            contract = root / "contract.py"
            contract.write_text(
                "def generate(rng, index):\n"
                "    return [None, 0, rng.randint(1, 100)][index]\n"
                "def check(value, actual):\n"
                "    expected = 10 if value is None else value\n"
                "    return {} if actual == expected else {'amount_changed':"
                " {'expected': expected, 'actual': actual}}\n",
                encoding="utf-8",
            )
            args = ["--baseline", str(before), "--candidate", str(after),
                    "--target", "invoice:amount", "--contract", str(contract), "--cases", "3"]
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(main(args), 1)
            report = json.loads(output.getvalue())
            self.assertEqual(report["summary"]["regressions"], 1)
            self.assertEqual(report["witness"]["input"], 0)
            self.assertEqual(report["witness"]["after"]["output"], 10)
            path = root / "report.json"
            path.write_text(output.getvalue(), encoding="utf-8")
            with contextlib.redirect_stdout(io.StringIO()) as replay:
                self.assertEqual(main(args + ["--replay", str(path)]), 1)
            self.assertEqual(json.loads(replay.getvalue())["witness"], report["witness"])

    def test_search_discovers_and_reduces_silent_loss(self):
        root = Path(__file__).resolve().parents[2]
        pack = json.loads((root / "cases/vanishing-order/case.json").read_text(encoding="utf-8"))
        initial = [{**row, "quantity": "2"} for row in pack["input"]]
        self.assertTrue(run_pack(pack, initial)["results"]["shortcut"]["passed"])
        result = find_counterexample(pack, initial)
        self.assertEqual(len(result["input"]), 1)
        self.assertEqual(result["results"]["shortcut"]["output"], [])
        self.assertIn("corrected", result["verifiedCandidates"])
