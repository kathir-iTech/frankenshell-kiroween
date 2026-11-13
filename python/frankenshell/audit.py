"""Compare a trusted Python change against independent behavioral checks."""

import argparse
import json
import random
import runpy
import subprocess
import sys
import tempfile
from collections import Counter
from pathlib import Path

from . import audit_child


def run_worker(root, arguments, payload, timeout):
    with tempfile.TemporaryDirectory(prefix="frankenshell-") as directory:
        response_path = Path(directory) / "response.json"
        try:
            process = subprocess.run(
                [sys.executable, "-I", "-X", "utf8", str(Path(audit_child.__file__).resolve()),
                 str(response_path), *arguments],
                input=payload,
                encoding="utf-8",
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                cwd=root,
                timeout=timeout,
                check=False,
            )
        except subprocess.TimeoutExpired as exc:
            raise ValueError(f"{root}: execution exceeded {timeout}s") from exc
        if process.returncode or not response_path.is_file():
            raise ValueError(f"{root}: worker exited with status {process.returncode}")
        response = json.loads(response_path.read_text(encoding="utf-8"))
        if "setup_error" in response:
            raise ValueError(f"{root}: {response['setup_error']}")
        return response


def execute(root, target, case, timeout, *, identify_source=False):
    mode = "identified" if identify_source else "call"
    return run_worker(root, [mode, target], json.dumps(case, allow_nan=False), timeout)


def assess(check, case, outcome):
    if "error" in outcome:
        return {"exception": outcome["error"]}
    # Give the contract a copy so it cannot change the recorded input/output.
    case_copy, output_copy = json.loads(json.dumps([case, outcome["output"]]))
    violations = check(case_copy, output_copy)
    if not isinstance(violations, dict) or any(not isinstance(k, str) for k in violations):
        raise ValueError("Contract check() must return a dict of failure names to details")
    return violations


def compare_case(baseline, candidate, target, check, case, timeout):
    before = execute(baseline, target, case, timeout)
    after = execute(candidate, target, case, timeout)
    before_failures = assess(check, case, before)
    after_failures = assess(check, case, after)
    introduced = sorted(after_failures.keys() - before_failures.keys())
    resolved = sorted(before_failures.keys() - after_failures.keys())
    return {
        "input": case,
        "before": before,
        "after": after,
        "before_failures": before_failures,
        "after_failures": after_failures,
        "introduced": introduced,
        "resolved": resolved,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Audit a JSON-in/JSON-out function across trusted Python checkouts."
    )
    parser.add_argument("--config", type=Path, help="Run a versioned checkout matrix")
    parser.add_argument("--baseline", type=Path)
    parser.add_argument("--candidate", type=Path)
    parser.add_argument("--target", help="Import path, e.g. orders:transform")
    parser.add_argument("--contract", type=Path)
    parser.add_argument("--seed", type=int)
    parser.add_argument("--cases", type=int)
    parser.add_argument("--timeout", type=float)
    parser.add_argument("--replay", type=Path, help="Replay the witness from a prior report")
    parser.add_argument("--format", choices=["json", "text"], help="Output format for --config")
    args = parser.parse_args(argv)
    direct = (args.baseline, args.candidate, args.target, args.contract)
    if args.config:
        if any(value is not None for value in (*direct, args.seed, args.cases, args.timeout)):
            parser.error("--config can be combined with --replay and --format")
        from .audit_matrix import main as matrix_main
        return matrix_main(args.config, args.replay, args.format or "json")
    if args.format:
        parser.error("--format requires --config")
    if not all(direct):
        parser.error("Supply --config or all of --baseline, --candidate, --target and --contract")
    args.seed = 2026 if args.seed is None else args.seed
    args.cases = 32 if args.cases is None else args.cases
    args.timeout = 5 if args.timeout is None else args.timeout
    if not 1 <= args.cases <= 256 or not 0 < args.timeout <= 60:
        parser.error("--cases must be 1–256 and --timeout must be positive and at most 60")
    try:
        contract = runpy.run_path(str(args.contract))
        check = contract["check"]
        baseline = args.baseline.resolve(strict=True)
        candidate = args.candidate.resolve(strict=True)
        if not baseline.is_dir() or not candidate.is_dir() or baseline == candidate:
            raise ValueError("Supply two distinct checkout directories")
        if args.replay:
            prior = json.loads(args.replay.read_text(encoding="utf-8"))
            cases = [prior["witness"]["input"]]
        else:
            rng = random.Random(args.seed)
            cases = (contract["generate"](rng, index) for index in range(args.cases))
        counts = Counter()
        witness = None
        for case in cases:
            result = compare_case(baseline, candidate, args.target, check, case, args.timeout)
            counts["checked"] += 1
            counts["regressions"] += bool(result["introduced"])
            counts["repairs"] += bool(result["resolved"])
            counts["candidate_failures"] += bool(result["after_failures"])
            if result["after_failures"] and (
                witness is None or (result["introduced"] and not witness["introduced"])
            ):
                witness = result
        print(json.dumps({
            "schema_version": 1,
            "target": args.target,
            "seed": args.seed,
            "summary": dict(counts),
            "witness": witness,
        }, indent=2, allow_nan=False))
        return int(counts["candidate_failures"] > 0)
    except Exception as exc:
        print(f"Audit could not complete: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
