# Check a Python change against a contract

Use two trusted local checkouts of the same project: the baseline and the proposed change. Pick a synchronous function that accepts one JSON-compatible argument and returns a JSON-compatible result. Run FrankenShell with the Python interpreter that has the project's dependencies installed. The checkout root must be importable (for a src layout, pass the src directories).

Write a contract file with a generator and an independent check. For example, for an invoice function where a missing quantity means one and zero stays zero:

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
python scripts/audit_repair.py --baseline ../before --candidate ../after --target invoice:total --contract ../invoice_contract.py --cases 32 > audit.json
python scripts/audit_repair.py --baseline ../before --candidate ../after --target invoice:total --contract ../invoice_contract.py --replay audit.json
```

The command exits with 0 when the candidate satisfies the supplied checks, 1 when it violates a check, and 2 when execution or configuration prevents an audit. The report counts tested inputs, newly introduced failures, resolved failures, and inputs where the candidate failed. The recorded witness favors a newly introduced failure over one already present in the baseline. Pin both checkout revisions, the contract, Python environment, and seed for CI runs.

Each evaluation starts a separate Python process with a timeout. The contract and both checkouts are trusted code and run with your permissions. The browser's counterexample search covers the built-in case packs. The CLI supports your own functions and contracts without uploading source.
