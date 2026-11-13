# Kiro benchmark review

Kiro CLI 3.2.0 ran the `lab-review` agent against the same report that powers the public CPython workbench. The V3 CLI stream recorded the SessionStart regression hook completing and the bounded `@frankenshell/get_benchmark` tool returning the quantiles report.

```sh
kiro-cli chat --v3 --trust-workspace --agent lab-review --trust-tools=@frankenshell/get_benchmark --require-mcp-startup --no-interactive 'Call get_benchmark for quantiles, then report the upstream method count, witness, outputs, and verification per revision.'
```

The agent identified `TestQuantiles` from CPython v3.13.0 and reported the recorded witness `quantiles([7], n=2)`. It observed that the controlled alternative and official fix both passed 5/5 selected tests. The alternative returned `[7, 7, 7]` on the witness, and the fix returned `[7]`. The previous release raised `StatisticsError`. The exported regression test passed only against the official fix.

The agent read a recorded benchmark. The separate Python benchmark command executed the test classes and exported assertions. The [reviewed spec](../.kiro/specs/cpython-quantiles/bugfix.md) documents the drafting and source review that informed the comparison.
