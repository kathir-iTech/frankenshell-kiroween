# FrankenShell

Review Python patches for behavior your existing tests missed. FrankenShell runs the same inputs against a baseline, a candidate, and optional alternatives. When a contract fails, it records the input, expected value, and actual result so the reviewer can replay it.

[Open the live workspace](https://kathir-itech.github.io/frankenshell-kiroween/) · [Run the CPython quantiles case](https://kathir-itech.github.io/frankenshell-kiroween/?view=benchmarks&case=quantiles) · [Audit your own patch](docs/audit-a-change.md)

## Try it in the browser

In **CPython cases**, open **statistics.quantiles** and click **Run in Python**. The controlled alternative passes all five selected upstream test methods. On the input `quantiles([7], n=2)` it returns `[7, 7, 7]`, while the official fix returns `[7]`. Download the regression test to see the check that distinguishes them.

The test counts come from the recorded benchmark. Live replay runs the selected input against the three bundled implementations. The public workspace also opens saved audit JSON locally in the browser.

## Run against your own code

Use Node.js 24+ and Python 3.14, the version used in CI. From the repo root:

```sh
npm ci
npm run build
python scripts/serve_workspace.py
```

1. Choose **Load invoice example** for a working first audit.
2. For your patch, enter the trusted checkout directories, a synchronous `module:function` target that takes one JSON-compatible argument, and a Python contract. A shared unittest directory and an alternative checkout are optional.
3. Click **Run audit**. Inspect the counterexample and use **Save report** to keep it. The local workspace restores the last completed audit's settings per project directory.

The local runner uses your Python interpreter and permissions. Keep the workspace on loopback and use checkouts, tests, and contracts you trust. See the [CLI guide](docs/audit-a-change.md) for configuration, CI exit codes, and replay.

## Reproduce the evidence

```sh
npm test
npm run build
npm run test:browser
python scripts/reproduce_benchmarks.py --out out --checkout-audit out/checkout-audits
```

The benchmark command checks hashes of tagged CPython source files, runs the selected test classes, and verifies the exported regression tests. CI publishes the reports and tests in the `cpython-regression-evidence` artifact. Scope and upstream attribution are in [the evidence](evidence/) and [third-party notices](docs/third-party-notices.md).

Browser tests use installed Chrome on Windows. On other platforms, run `npx playwright install chromium` before running the browser suite.

## How Kiro was used

Kiro CLI contributed the order repair and helped draft and review the quantiles requirement. The [reviewed spec](.kiro/specs/cpython-quantiles/bugfix.md) records how it was checked against upstream behavior. A Kiro custom agent read the recorded benchmark through MCP and the SessionStart hook ran the lab regression checks. See the [observed Kiro run](evidence/KIRO_BENCHMARK_REVIEW.md) and [release verification](evidence/RELEASE_VERIFICATION.md).

Built independently for Kiroween 2026, Frankenstein category. [MIT license](LICENSE).
