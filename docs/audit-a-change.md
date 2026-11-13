# Check a Python change against a contract

Use trusted local checkouts of the same project. Pick a synchronous function that accepts one JSON-compatible argument and returns a JSON-compatible result. Run FrankenShell with the Python interpreter that has the project's dependencies installed. Supply directories that make the module importable, such as each checkout's `src/` directory for a src layout.

From a terminal, clone FrankenShell and open its repository directory:

```sh
git clone https://github.com/kathir-iTech/frankenshell-kiroween.git
cd frankenshell-kiroween
```

The invoice example below uses only Python's standard library.

## Compare a baseline, a proposed fix, and alternatives

Save this as `audit-config.json` in a directory of your choice. Paths are relative to the config file. The shared `unittest` suite is optional. When present, FrankenShell executes it against each implementation before running the contract.

```json
{
  "schema_version": 1,
  "target": "invoice:total",
  "display_target": "Invoice total",
  "rule_descriptions": {"incorrect_total": "A blank quantity means one. An explicit zero stays zero."},
  "contract": "invoice_contract.py",
  "checkouts": {
    "baseline": "before",
    "candidate": "fix",
    "shortcut": "quick-fix"
  },
  "unittest": {"directory": "shared-tests", "pattern": "test_invoice.py"},
  "source_files": ["invoice.py"],
  "cases": 8,
  "seed": 2026,
  "timeout": 15,
  "budget_seconds": 120
}
```

In this example, `before`, `fix`, and `quick-fix` each contain their own `invoice.py`. Up to three named alternatives can be included.

`display_target` and `rule_descriptions` are optional. They give reviewers the public function name or a descriptive label and the meaning of each contract rule in the web report. Use the same rule IDs returned by `check()`.

To try it with a small fixture, put one of these functions in each directory:

| Directory | Contents of `invoice.py` |
| --- | --- |
| `before` | `def total(order): return order["quantity"] * order["unit_cents"]` |
| `fix` | `def total(order): return (1 if order["quantity"] is None else order["quantity"]) * order["unit_cents"]` |
| `quick-fix` | `def total(order): return (order["quantity"] or 1) * order["unit_cents"]` |

Save this as `shared-tests/test_invoice.py` beside the config:

```python
import unittest
from invoice import total


class InvoiceTests(unittest.TestCase):
    def test_positive_quantity(self):
        self.assertEqual(total({"quantity": 2, "unit_cents": 50}), 100)
```

Save the following as `invoice_contract.py`. A missing quantity means one, and zero stays zero.

```python
def generate(rng, index):
    edge_cases = [None, 0, 1]
    quantity = edge_cases[index] if index < len(edge_cases) else rng.randint(0, 50)
    return {"quantity": quantity, "unit_cents": rng.randint(1, 1000)}


def check(order, actual):
    quantity = order["quantity"]
    expected = (1 if quantity is None else quantity) * order["unit_cents"]
    return {} if actual == expected else {
        "incorrect_total": {"expected": expected, "actual": actual}
    }
```

```bash
python -X utf8 scripts/audit_repair.py --config path/to/audit-config.json > audit.json
python scripts/audit_repair.py --config path/to/audit-config.json --replay audit.json --format text
```

If you use Windows PowerShell 5.1, save the report as UTF-8 with this command:

```powershell
$env:PYTHONIOENCODING = "utf-8"
[Console]::OutputEncoding = [Text.UTF8Encoding]::new()
python scripts/audit_repair.py --config path/to/audit-config.json | Set-Content -Encoding utf8 audit.json
```

Open `audit.json` in the [web workspace](https://kathir-itech.github.io/frankenshell-kiroween/) to inspect the comparison. The browser reads the report locally.

The JSON report includes the named check failures, actual outcomes for the witness, the imported module's path and SHA-256, and Git HEAD and dirty status when available. Use optional `source_files` to fingerprint implementation files behind an adapter. The optional shared suite records the selected test pattern, test file fingerprint, and methods run. Pin the checkout revisions and Python dependencies for CI.

An exit code of **0** means the candidate passed the checks that ran. **1** means the candidate failed the contract or shared suite. **2** means the audit is inconclusive, for example because an import failed, no tests ran, a process timed out, or the witness changed on rerun. Failures in the baseline and alternatives are reported as comparison evidence. A report with a passing candidate can still contain a witness against an alternative.

Replay uses the recorded input with the same target and contract bytes. The checkouts can be updated to see whether a follow-up patch resolves the failure. The report contains counts for fully evaluated inputs if execution stops partway. A fresh subprocess handles each checkout invocation. The total budget bounds subprocess work, and the trusted contract runs directly in the CLI process.

## Two-checkout quick start

The direct flags run the original two-checkout verifier and produce the original report format.

```bash
python scripts/audit_repair.py --baseline ../before --candidate ../after --target invoice:total --contract ../invoice_contract.py --cases 32 > audit.json
python scripts/audit_repair.py --baseline ../before --candidate ../after --target invoice:total --contract ../invoice_contract.py --replay audit.json
```

The report counts tested inputs, newly introduced failures, resolved failures, and inputs where the candidate failed. The recorded witness favors a newly introduced failure over one already present in the baseline.

The checkouts, shared tests, and contract run with your local permissions. The browser's counterexample search covers the built-in case packs. The CLI supports your own functions and contracts without uploading source.
