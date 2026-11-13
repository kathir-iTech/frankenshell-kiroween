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

    def matrix(self, base, candidate, alternative, tests=None, **options):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        root = Path(directory.name)
        checkouts = {"baseline": "before", "candidate": "fix", "shortcut": "shortcut"}
        for path, source in zip(checkouts.values(), (base, candidate, alternative)):
            folder = root / path
            folder.mkdir()
            if source is not None:
                (folder / "invoice.py").write_text(source, encoding="utf-8")
        (root / "contract.py").write_text(
            "def generate(rng, index): return [None, 0][index]\n"
            "def check(value, actual):\n"
            "    expected = 10 if value is None else value\n"
            "    return {} if actual == expected else {'preserve_zero': expected}\n",
            encoding="utf-8",
        )
        config = {
            "schema_version": 1, "target": "invoice:amount", "contract": "contract.py",
            "checkouts": checkouts, "cases": 2, **options,
        }
        if tests is not None:
            (root / "suite").mkdir()
            (root / "suite" / "test_invoice.py").write_text(tests, encoding="utf-8")
            config["unittest"] = {"directory": "suite"}
        path = root / "matrix.json"
        path.write_text(json.dumps(config), encoding="utf-8")
        return path

    def run_matrix(self, path, *options):
        with contextlib.redirect_stdout(io.StringIO()) as output:
            code = main(["--config", str(path), *options])
        return code, json.loads(output.getvalue())

    def test_matrix_finds_gap_and_replays_with_no_candidate_failure(self):
        path = self.matrix(
            "def amount(value): return value\n",
            "def amount(value): return 10 if value is None else value\n",
            "def amount(value): return value or 10\n",
            "import unittest, invoice\n"
            "class InvoiceTests(unittest.TestCase):\n"
            "    def test_positive(self): self.assertEqual(invoice.amount(6), 6)\n",
            source_files=["invoice.py"],
        )
        code, report = self.run_matrix(path)
        self.assertEqual(code, 0)
        self.assertEqual(report["inputs_checked"], 2)
        self.assertEqual(report["revisions"]["candidate"]["counts"]["resolved"], 1)
        self.assertEqual(report["revisions"]["shortcut"]["counts"]["introduced"], 1)
        self.assertTrue(report["revisions"]["shortcut"]["unittest"]["passed"])
        self.assertEqual(report["revisions"]["candidate"]["module"]["path"], "invoice.py")
        self.assertEqual(report["revisions"]["candidate"]["module"]["sha256"],
                         report["revisions"]["candidate"]["source_files"]["invoice.py"])
        self.assertEqual(report["witness"]["input"], 0)
        self.assertEqual(report["witness"]["confirmation"], "reproduced")
        report_path = path.with_name("audit.json")
        report_path.write_text(json.dumps(report), encoding="utf-8-sig")
        code, replay = self.run_matrix(path, "--replay", str(report_path))
        self.assertEqual(code, 0)
        self.assertEqual(replay["inputs_checked"], 1)
        self.assertEqual(replay["witness"], report["witness"])

        path.with_name("contract.py").write_text("# different bytes", encoding="utf-8")
        code, error = self.run_matrix(path, "--replay", str(report_path))
        self.assertEqual(code, 2)
        self.assertIn("same target and contract bytes", error["error"])

    def test_matrix_distinguishes_observed_failure_and_inconclusive_runs(self):
        good = "def amount(value): return 10 if value is None else value\n"
        bad = "def amount(value): return value or 10\n"
        code, report = self.run_matrix(self.matrix(good, bad, good))
        self.assertEqual(code, 1)
        self.assertEqual(report["witness"]["results"]["candidate"]["introduced"], ["preserve_zero"])
        code, report = self.run_matrix(self.matrix(good, good, good))
        self.assertEqual(code, 0)
        self.assertIsNone(report["witness"])
        for setup, message in [
            (self.matrix(None, good, good), "ModuleNotFoundError"),
            (self.matrix(good, good, good, tests="# no tests"), "No tests collected"),
            (self.matrix(good, good, good, tests="import missing_fixture"), "Test collection failed"),
            (self.matrix(good, good, good, source_files=["../contract.py"]), "relative file paths"),
            (self.matrix(good, good, good, budget_seconds=0.001), "budget exhausted"),
        ]:
            with self.subTest(message=message):
                code, report = self.run_matrix(setup)
                self.assertEqual(code, 2)
                self.assertIn(message, report["error"])

    def test_matrix_preserves_partial_results_and_flags_inconsistent_witness(self):
        good = "def amount(value): return 10 if value is None else value\n"
        slow = (
            "import time\ndef amount(value):\n"
            "    if value == 0: time.sleep(10)\n"
            "    return 10\n"
        )
        code, partial = self.run_matrix(self.matrix(good, slow, good, timeout=2))
        self.assertEqual(code, 2)
        self.assertIn("execution exceeded", partial["error"])
        self.assertEqual(partial["inputs_checked"], 1)
        alternating = (
            "from pathlib import Path\ndef amount(value):\n"
            "    if value is None: return 10\n"
            "    marker = Path('visited')\n"
            "    if marker.exists(): return 0\n"
            "    marker.touch()\n"
            "    return 10\n"
        )
        code, report = self.run_matrix(self.matrix(good, alternating, good))
        self.assertEqual(code, 2)
        self.assertEqual(report["witness"]["confirmation"], "inconsistent")

    def test_search_discovers_and_reduces_silent_loss(self):
        root = Path(__file__).resolve().parents[2]
        pack = json.loads((root / "cases/vanishing-order/case.json").read_text(encoding="utf-8"))
        initial = [{**row, "quantity": "2"} for row in pack["input"]]
        self.assertTrue(run_pack(pack, initial)["results"]["shortcut"]["passed"])
        result = find_counterexample(pack, initial)
        self.assertEqual(len(result["input"]), 1)
        self.assertEqual(result["results"]["shortcut"]["output"], [])
        self.assertIn("corrected", result["verifiedCandidates"])
