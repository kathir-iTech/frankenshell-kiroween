# Singleton quantiles

Kiro CLI 3.2.0 was used to draft and review the requirement in a scoped CLI session and then in V3 spec mode. The draft suggested an explicit nondefault interval count and both documented methods. The reviewed implementation and tagged tests determined the final contract.

## QNT-001

For one numeric sample and a positive integer `n`, return `n - 1` cut points equal to that sample for the documented inclusive and exclusive methods.

- Verify the default behavior with one sample and `n=4`.
- Test one sample with `n=2` to catch a constant output length.
- Test `n=1` and a larger inclusive `n` to cover the two ends of the sampled range.
- Keep one multi-sample control and execute the tagged upstream `TestQuantiles` class.

The first Kiro draft raised unknown-method validation as a decision. Tagged CPython v3.13.0 returns for a singleton before reaching the method validation branch. The benchmark tests the two documented methods and leaves other inputs outside this requirement.

## Verification

`python scripts/reproduce_benchmarks.py --case quantiles --out out` checks the pinned source files, evaluates the upstream methods and independent inputs, and verifies a conventional regression test against the previous release, controlled alternative, and official fix.
