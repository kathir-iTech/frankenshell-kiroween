# Design

React interface → fresh Pyodide module worker → shared Python runner → independent contract checks → structured report. A new interpreter prevents cross-run cache contamination. Main-thread timeouts terminate the worker. Two reviewed case packs exercise record preservation and configuration-sensitive caching. An official-SDK stdio MCP server exposes only known case IDs.

Input is editable data, never Python interpolated from data. Prepared source is visible. Hashes detect differences against a supplied manifest, not authorship. A downloaded verifier runs trusted source in CPython; this is not an OS sandbox.
