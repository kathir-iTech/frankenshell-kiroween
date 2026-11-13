# Third-party runtime and dependencies

FrankenShell application code is MIT-licensed. Dependencies retain their own licenses.

The bundled Pyodide 314.0.7 runtime is distributed under the Mozilla Public License 2.0. Its upstream source and release history are available at https://github.com/pyodide/pyodide and https://www.npmjs.com/package/pyodide/v/314.0.7 . The license is retained in `docs/licenses/PYODIDE-LICENSE` and copied into the distributed runtime directory. The upstream source is available from the corresponding version/release. Pyodide includes CPython and other components under their respective licenses; retain upstream notices when redistributing it.

React and React DOM, Vite, TypeScript, lucide-react, diff, JSZip, Playwright, and the optional MCP SDK retain the licenses shipped in their npm/Python packages. Exact installed versions are recorded in package-lock.json and requirements-mcp.lock.txt. No application license overrides third-party terms.

The benchmark runner downloads tagged CPython files from the Python Software Foundation repository under the [CPython license](https://github.com/python/cpython/blob/v3.14.0/LICENSE). The evidence identifies the source files and tags and records the original and replacement lines for each temporary experiment.
