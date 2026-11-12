# FrankenShell — The Resurrection Lab

A personal Kiroween 2026 project exploring a simple question: did a repair preserve the program's behavior, or only remove its error?

Run actual reviewed Python in your browser, compare an original and two prepared repairs, inspect independent checks and counterexamples, and export a bundle that reruns in local Python. No account or model API is required by the public examples.

[Open the hosted workbench](https://kathir-itech.github.io/frankenshell-kiroween/)

## Run locally

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

The MCP-only profile exposes `list_cases`, `run_case`, and `get_incident`. The SessionStart hook runs `scripts/check_cases.py`, requiring corrected candidates to pass and known shortcut regressions to fail. See the integration evidence for observed Kiro invocation results. No arbitrary shell-execution tool is exposed by the lab server.

## Evidence and boundaries

Public examples execute prepared repair source now; they do not generate a new AI repair live. A recorded history entry is labeled. Passing finite checks establishes behavior for the declared input and contract, not universal correctness.

Browser execution is for reviewed bundled source. Local commands and downloaded verifiers execute trusted Python and are not OS sandboxes. Review source before running a third-party pack. Hashes check against a supplied manifest; they do not certify an author or SLSA level. This release includes the browser workbench and its local verifier.

## Deployment

`dist/` is a static build with a relative base path and a self-hosted, version-pinned runtime. It can be hosted on GitHub Pages without a backend. The included Pages workflow uses manual dispatch; review repository visibility and release content before publishing. Dependencies and case packs are MIT-licensed where applicable; retain third-party notices when redistributing the runtime.

This is an independently entered personal project. No college affiliation or endorsement is claimed. Author: kathir-iTech.

MIT license; see LICENSE.
