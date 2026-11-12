# Bugfix: transform fails on empty quantity

## Observed behavior
`int(row["quantity"])` is called on every row. When `quantity` is the empty string `""`, `int("")` raises `ValueError`, so the whole call fails and no records are returned.

## Expected behavior
Per the contract, an empty `quantity` means exactly one, so `total_cents` equals `unit_cents`. An explicit `"0"` still means zero, so `total_cents` is `0`.

## Unchanged behavior
- Non-empty quantity strings (including `"0"`) are parsed with `int` and multiplied by `unit_cents`, as before.
- Every record is preserved, in the original order, with the same `id`.
- Output shape is unchanged: a list of dicts with exactly the keys `id` and `total_cents`.
- Input rows are not mutated. The function reads from them and builds new dicts.

## Root cause
The function treats every quantity as a decimal integer string. It does not handle the empty-string case that the contract defines as a quantity of one. The fix must test for the empty string explicitly. A truthiness check on the parsed integer would be wrong, because it would make `"0"` behave like the empty string.

## Regression checks (to be run separately; not executed here)
1. `[{"id": "a", "quantity": "", "unit_cents": 250}]` should give `[{"id": "a", "total_cents": 250}]`.
2. `[{"id": "a", "quantity": "0", "unit_cents": 250}]` should give `total_cents` of `0`, not `250`.
3. `[{"id": "a", "quantity": "3", "unit_cents": 250}]` should give `total_cents` of `750`.
4. A mixed list with `""`, `"0"` and `"5"` quantities should keep its order and all ids.
5. `unit_cents` of `0` with an empty quantity should give `0`.
6. Deep-copy the input before the call and compare it afterwards to confirm no mutation.
7. An empty list should return `[]`.
8. Run the checks in both CPython and WebAssembly and compare the outputs.

