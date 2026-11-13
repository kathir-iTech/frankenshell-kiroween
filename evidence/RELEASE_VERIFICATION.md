# Kiroween release verification

A fresh public clone on Windows ran the checkout verifier with Python 3.14.6 in a new virtual environment without installed packages. This was a clean-environment test by Codex.

- The CLI guide's invoice example produced a report and replayed the input `{"quantity": 0, "unit_cents": 328}`. The shortcut returned 328 and the candidate returned 0. The guide now uses eight inputs and a 15-second subprocess timeout after the original walkthrough timed out at five seconds on Windows.
- A separate audit of the released CPython `pathlib.PurePosixPath.suffix` change reproduced the input `"report."` using hash-checked release sources. Three shared checks written for the experiment passed on the older implementation, official fix, and a controlled shortcut. The regression assertion for a trailing dot passed only on the official fix. This test used four declared inputs. See [CPython's suffix documentation](https://docs.python.org/3.14/library/pathlib.html#pathlib.PurePath.suffix).
- The public workspace can open an audit report without an account. The [CPython cases](https://kathir-itech.github.io/frankenshell-kiroween/?view=benchmarks&case=quantiles) execute their supplied implementations in the browser and provide the verified regression test for download.
- [Kiro benchmark review](KIRO_BENCHMARK_REVIEW.md) describes the observed CLI, hook, and MCP run.
