# Verified working build

Date: 11 November 2026 (client date, Asia/Calcutta).

- Production build: TypeScript strict check and Vite build passed.
- Python: 10 tests passed, including a fixed-seed 60-input generated corpus, independent mutation detection, negative input validation, output bounds, authored-pack reuse, and repeat-run isolation.
- Chrome browser: 3 end-to-end tests passed. Actual Pyodide executes both cases; changed input changes results; exported artifacts reproduce in CPython; a changed source file fails verification; reset/cancel, input errors, runtime-load failure, source diff, and 390px layout are covered.
- MCP: official SDK stdio client initializes, discovers the three tools, executes the order case, and rejects an unknown/traversal case ID.
- Kiro: actual CLI invocation discovers and uses `list_cases`, `run_case`, and `get_incident`; the regression SessionStart hook output is observed. See kiro-integration.json.
- Visual inspection: desktop and mobile screenshots reviewed. A production static-server smoke run is also recorded in the release handoff.

Limits: automated browser testing covers installed Chrome, not all browsers or devices. No independent usability study has been performed. Prepared repairs are executed live; general live AI repair is not offered. Private GitHub repository visibility and public hosting have not been changed by this build.
