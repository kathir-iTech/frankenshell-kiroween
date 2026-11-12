# Requirements: personal repair-verification lab

- WHEN a bundled original violates its contract, the app SHALL show actual exception or failed assertions.
- WHEN a prepared candidate stops an exception but changes required behavior, verification SHALL fail with expected and observed values.
- WHEN all required checks pass AND the original failure reproduces, the app SHALL label the candidate verified for this test set.
- WHEN a run is cancelled, the app SHALL terminate its worker and ignore late messages.
- WHEN exporting evidence, the app SHALL include exact source, input, tests, report, and byte hashes.
- The public app SHALL execute without a paid service or model endpoint.
- The project SHALL be attributed to its independent author without college affiliation.

These feature requirements were authored in Codex. The first candidate and bugfix specification were generated through Kiro CLI; see evidence/kiro-candidate-response.json.
