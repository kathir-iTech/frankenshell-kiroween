# Author a trusted local case pack

Copy `cases/vanishing-order/case.json` into your own directory. Give the copy a new `id`, set `contractId` to `vanishing-order`, and replace the three `sources` entries with your own reviewed Python functions named `transform`. Edit `input` to your own records. Run `python scripts/franken.py compare path/to/your/case.json`.

The built-in contracts support order transformations (`vanishing-order`) and request caches (`haunted-cache`). A new arbitrary behavioral contract requires an independently reviewed oracle in `runner.py`; the app does not infer requirements from candidate output. This is intentionally a small-function workbench, not a generic production repair agent.

Input constraints: 1–100 records and at most 64 KiB serialized input. Order IDs must be unique nonempty strings; quantities are blank or up to six nonnegative decimal digits; `unit_cents` is a nonnegative integer up to 1,000,000. Cache keys are 1–80 characters and multipliers are integers 0–1,000. Avoid native modules, network access, file access, or background processes in your case functions.

Local execution is trusted-code execution. To include a pack in the public app, review it, add its independent tests, and rebuild. The public interface accepts input data only, not uploaded source.
