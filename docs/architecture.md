# Architecture and assurance

React triggers a fresh module worker. The worker loads pinned Pyodide 314.0.7 and the same Python runner used by the CLI. Each candidate receives a deep-copied input and its own namespace; the order/cache oracles are separate from candidate source. The worker returns structured outputs, exceptions, checks, and counterexamples. A verified label also requires the original failure to reproduce.

Main-thread run IDs reject stale events. Cancellation and timeouts terminate the worker, giving the next run a fresh interpreter. Loading has a 60-second deadline and execution a 3-second deadline. Input changes invalidate displayed results. History entries preserve the exact input and are explicitly recorded results.

An export contains artifacts and hashes of their UTF-8 bytes. The local verifier checks file hashes, reruns exact sources with the shared independent oracle, and compares deterministic result fields. Traceback paths and timing metadata are not compared across runtimes. The manifest is a reference supplied with the bundle, not an external trust anchor.

No API keys, authentication, remote database, or inference endpoint is used by the public examples. Optional MCP uses the official Python SDK and accepts only two known case identifiers. It cannot execute submitted source, shell commands, or filesystem paths.

Known release limitations: finite supported contracts, prepared repairs, one browser engine tested automatically, no external user study yet, no native process isolation, no claim of universal security/correctness, no guarantee of an award. The independent author must review the final release and submission materials.
