# FrankenShell

A Python patch verifier for maintainers who need to check what a change does on inputs their tests missed. Built for Kiroween 2026 in the Frankenstein category.

The hosted workbench opens with two recorded CPython experiments. Each compares a previous release, an official fix, and a controlled one-line alternative. The alternatives pass the selected upstream test classes. FrankenShell records an input that exposes each difference and produces a plain Python regression test verified against all three versions.

[Open the hosted workbench](https://kathir-itech.github.io/frankenshell-kiroween/)

## Reproduce the CPython experiments

From this checkout with Python 3.14:

```sh
python scripts/reproduce_benchmarks.py --out out
```

The script fetches six tagged CPython files from GitHub, verifies their SHA-256 hashes, runs the selected upstream test classes, and verifies the generated regression tests in separate processes. `--case quantiles` or `--case dedent` runs one experiment. `--cache PATH` reuses verified downloads.

To run the same two cases through the [maintainer's checkout verifier](docs/audit-a-change.md):

```sh
python scripts/reproduce_benchmarks.py --out out --checkout-audit out/checkout-audits
```

This reconstructs each revision in a temporary source directory, checks the shared test results and the counterexample against the benchmark, and replays the counterexample from the report. It also promotes each shortcut to candidate and verifies that the contract rejects it while its shared tests pass. The official fixes pass a separate control without a flagged input. CI uploads both audit reports with the regression tests as `cpython-regression-evidence`.

| Case | Selected upstream tests on alternative | Counterexample |
| --- | --- | --- |
| [`statistics.quantiles`](https://docs.python.org/3.13/library/statistics.html#statistics.quantiles) | 5/5 from `TestQuantiles`, CPython v3.13.0 | `quantiles([7], n=2)` returned `[7, 7, 7]` with the alternative. The official fix returned `[7]`. |
| [`textwrap.dedent`](https://docs.python.org/3.14/library/textwrap.html#textwrap.dedent) | 6/6 from `DedentTestCase`, CPython v3.13.0 | A line with a non-breaking space kept the surrounding text indented with the alternative. The official fix normalized the blank line and removed the shared indent. |

Both are historical releases. The experiment supplies the alternatives and executes the named upstream classes. The repository includes the report and exported regression tests in [evidence](evidence/). CPython source is fetched at reproduction time. See the [third-party notices](docs/third-party-notices.md).

## Run locally

**Checking your own Python change?** Use the [local checkout verifier](docs/audit-a-change.md)
to compare a baseline, proposed fix, and alternatives using the same contract and optional
shared tests. It reports introduced and resolved violations and saves an input you can replay in CI.
In the browser's **Interactive lab**, **Find counterexample** searches variations of the selected
case and removes rows while the quick fix still fails.

Requirements: Node.js 24+, Python 3.12+ (tested on Python 3.14), and a current browser with WebAssembly/module workers.

```powershell
npm ci
npm run build
npm run dev
```

Open http://127.0.0.1:5173 . The build copies the pinned Pyodide runtime into the public assets. After installing dependencies and building, examples execute locally; there is no paid inference service. Font loading is optional and falls back to system fonts.

## What works

- **The Vanishing Order:** the original raises `ValueError`; the quick fix silently loses a record; the contract repair preserves rows, quantities, and totals.
- **The Haunted Cache:** the original returns stale values; the quick fix disables required reuse; the contract repair keys the cache correctly.
- Editable bounded input, actual source differences, expected/observed assertions, fresh interpreter per run, cancellation, and in-session history.
- Evidence ZIP with exact source/input/report bytes, SHA-256 manifest, shared independent oracle, and a local `verify.py` command.
- CLI for trusted authored packs; optional official-SDK MCP connection for Kiro.

## Verify

```powershell
npm test
npm run test:browser
python scripts/franken.py compare cases/vanishing-order
```

Browser tests use installed Chrome on Windows. On other platforms install Playwright Chromium with `npx playwright install chromium` once. They execute real WebAssembly, reproduce an export in CPython, reject a changed artifact, check cancellation and invalid data, test runtime failure, and inspect a mobile viewport.

## Kiro integration

Kiro CLI generated the order case's corrected candidate and bugfix document. The raw response is in `evidence/kiro-candidate-response.json`. The CLI request was a focused generation request, not a claim that the native Kiro bugfix workflow was run. Codex authored the surrounding application, requirements, and test harness. Tests were executed separately.

Optional MCP dependencies are isolated from the web app:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements-mcp.txt
.\.venv\Scripts\Activate.ps1
python scripts/test_mcp.py
kiro-cli chat --v3 --trust-workspace --agent lab-review
```

The MCP-only profile exposes `list_cases`, `run_case`, `get_incident`, and `get_benchmark`. The SessionStart hook runs `scripts/check_cases.py`, requiring corrected candidates to pass and known shortcut regressions to fail. The [CPython bugfix spec](.kiro/specs/cpython-quantiles/bugfix.md) records how Kiro's requirement draft was checked against the tagged source. The benchmark tool reads the recorded CI-reproducible evidence.

The [recorded Kiro benchmark review](evidence/KIRO_BENCHMARK_REVIEW.md) documents the CLI invocation and observed results.

## Evidence and boundaries

The CPython page displays recorded benchmark runs. The interactive lab executes its prepared repair source in browser Python. Passing finite checks establishes behavior for the declared input and contract.

Browser execution is for reviewed bundled source. Local commands and downloaded verifiers execute trusted Python and are not OS sandboxes. Review source before running a third-party pack. Hashes check against a supplied manifest; they do not certify an author or SLSA level. This release includes the browser workbench and its local verifier.

## Deployment

`dist/` is a static build with a relative base path and a self-hosted, version-pinned runtime. It can be hosted on GitHub Pages without a backend. The included Pages workflow uses manual dispatch; review repository visibility and release content before publishing. Dependencies and case packs are MIT-licensed where applicable; retain third-party notices when redistributing the runtime.

This is an independently entered personal project. No college affiliation or endorsement is claimed. Author: kathir-iTech.

MIT license; see LICENSE.
