"""Run the same checks on a baseline, a candidate, and optional alternatives."""

import hashlib
import json
from pathlib import Path
import platform
import random
import re
import runpy
import shutil
import subprocess
import time

from .audit import WorkerTimeout, assess, execute, run_worker


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def bounded(config, key, default, maximum, kind=int):
    value = config.get(key, default)
    allowed = (int,) if kind is int else (int, float)
    if type(value) not in allowed or not 0 < value <= maximum:
        raise ValueError(f"{key} must be a positive {kind.__name__} up to {maximum}")
    return value


def git_identity(root, timeout):
    # Worktrees and repositories both have a .git marker. Source-only
    # directories have no Git metadata to collect.
    if not any((directory / ".git").exists() for directory in (root, *root.parents)):
        timeout()
        return None
    git = shutil.which("git")
    if not git:
        return None
    result = subprocess.run(
        [git, "--no-optional-locks", "rev-parse", "HEAD"],
        cwd=root, capture_output=True, text=True, check=False, timeout=timeout(),
    )
    if result.returncode or not re.fullmatch(r"[0-9a-f]{40,64}", result.stdout.strip()):
        return None
    status = subprocess.run(
        [git, "--no-optional-locks", "status", "--porcelain", "--untracked-files=normal"],
        cwd=root, capture_output=True, text=True, check=True, timeout=timeout(),
    )
    return {"commit": result.stdout.strip(), "dirty": bool(status.stdout)}


def test_digest(directory):
    files = sorted(path for path in directory.rglob("*.py") if path.is_file())
    hashes = {path.relative_to(directory).as_posix(): digest(path) for path in files}
    return hashlib.sha256(json.dumps(hashes).encode("utf-8")).hexdigest()


def source_digests(root, filenames):
    hashes = {}
    for filename in filenames:
        path = (root / filename).resolve(strict=True)
        if not path.is_relative_to(root) or not path.is_file():
            raise ValueError(f"{filename} must name a file inside {root}")
        hashes[filename] = digest(path)
    return hashes


def configure(path):
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    if type(data.get("schema_version")) is not int or data["schema_version"] != 1:
        raise ValueError("Expected config schema_version 1")
    valid_keys = {"schema_version", "target", "contract", "checkouts", "seed",
                  "cases", "timeout", "budget_seconds", "unittest", "source_files",
                  "display_target", "rule_descriptions"}
    unknown = sorted(data.keys() - valid_keys)
    if unknown:
        raise ValueError(f"Unknown config field(s): {', '.join(unknown)}")
    label = data.get("display_target")
    if "display_target" in data and (
        not isinstance(label, str) or not label.strip() or len(label) > 160
    ):
        raise ValueError("display_target must be a nonempty string up to 160 characters")
    descriptions = data.get("rule_descriptions", {})
    if not isinstance(descriptions, dict) or len(descriptions) > 64 or any(
        not rule.strip() or len(rule) > 128 or not isinstance(description, str)
        or not description.strip() or len(description) > 500
        for rule, description in descriptions.items()
    ):
        raise ValueError("rule_descriptions must map up to 64 rule IDs to nonempty descriptions")
    if "unittest" in data and (
        not isinstance(data["unittest"], dict) or data["unittest"].keys() - {"directory", "pattern"}
    ):
        raise ValueError("unittest accepts directory and pattern")
    if type(data.get("seed", 2026)) is not int:
        raise ValueError("seed must be an integer")
    files = data.get("source_files", [])
    if not isinstance(files, list) or len(files) > 64 or any(
        not isinstance(file, str) or not file or Path(file).anchor or ".." in Path(file).parts
        for file in files
    ):
        raise ValueError("source_files must be a list of up to 64 relative file paths")
    target = data["target"]
    module, separator, function = target.partition(":")
    if not separator or not function.isidentifier() or not all(p.isidentifier() for p in module.split(".")):
        raise ValueError("target must have the form package.module:function")
    checkouts = data["checkouts"]
    if not {"baseline", "candidate"} <= checkouts.keys() or len(checkouts) > 5:
        raise ValueError("Supply baseline and candidate, with up to three named alternatives")
    if any(not re.fullmatch(r"[a-z][a-z0-9_-]{0,31}", name) for name in checkouts):
        raise ValueError("Checkout names must start with a lowercase letter and use letters, digits, _ or -")
    checkouts = {name: checkouts[name] for name in
                 ["baseline", "candidate", *sorted(checkouts.keys() - {"baseline", "candidate"})]}
    roots = {name: (path.parent / value).resolve(strict=True) for name, value in checkouts.items()}
    if len(set(roots.values())) != len(roots) or any(not root.is_dir() for root in roots.values()):
        raise ValueError("Checkouts must be distinct directories")
    contract = (path.parent / data["contract"]).resolve(strict=True)
    return data, target, checkouts, roots, contract


def replay_input(path, target, contract_hash):
    previous = json.loads(path.read_text(encoding="utf-8-sig"))
    if (previous.get("schema_version") != 2 or previous.get("target") != target
            or previous.get("contract", {}).get("sha256") != contract_hash):
        raise ValueError("Replay requires a matrix report with the same target and contract bytes")
    if previous.get("witness") is None:
        raise ValueError("The supplied report has no witness")
    return previous["witness"]["input"]


def compare(roots, revisions, target, check, case, timeout):
    results = {}
    for name, root in roots.items():
        outcome = execute(root, target, case, timeout(), identify_source=True)
        source = outcome.pop("source")
        if revisions[name].setdefault("module", source) != source:
            raise ValueError(f"{name}: imported source changed during the audit")
        results[name] = {"outcome": outcome, "violations": assess(check, case, outcome)}
    before = results["baseline"]["violations"]
    for result in results.values():
        failures = result["violations"]
        result["introduced"] = sorted(failures.keys() - before.keys())
        result["resolved"] = sorted(before.keys() - failures.keys())
    return results


def witness_rank(results):
    candidate = results["candidate"]
    if candidate["violations"]:
        return 3 if candidate["introduced"] else 2
    if any(result["violations"] for name, result in results.items()
           if name not in {"baseline", "candidate"}):
        return 1
    return 0


def print_report(report, output_format):
    if output_format == "json":
        print(json.dumps(report, indent=2, allow_nan=False))
        return
    print(f"{report.get('target', 'Checkout audit')} | {report['status']} | "
          f"{report['inputs_checked']} inputs | {report['elapsed_seconds']:.2f}s")
    for name, revision in report.get("revisions", {}).items():
        counts = revision["counts"]
        summary = (f"{counts['failed']} contract failures, "
                   f"{counts['introduced']} introduced, {counts['resolved']} resolved")
        if tests := revision.get("unittest"):
            summary += f" | {tests['run']} shared tests, {'pass' if tests['passed'] else 'fail'}"
        print(f"  {name}: {summary}")
    if witness := report.get("witness"):
        print(f"Witness ({witness['confirmation']}): {json.dumps(witness['input'])}")
        for name, result in witness["results"].items():
            print(f"  {name}: {json.dumps(result['outcome'])}; "
                  f"violations: {', '.join(result['violations']) or 'none'}")
    if error := report.get("error"):
        print(f"Audit incomplete: {error}")


def run(path, replay=None):
    started = time.monotonic()
    report = {"schema_version": 2, "status": "inconclusive", "inputs_checked": 0,
              "witness": None, "python": platform.python_version()}
    stage = "configuration"
    try:
        data, target, checkouts, roots, contract_path = configure(path.resolve(strict=True))
        count = bounded(data, "cases", 32, 256)
        per_process = bounded(data, "timeout", 5, 60, float)
        budget = bounded(data, "budget_seconds", 120, 600, float)

        def timeout():
            remaining = budget - (time.monotonic() - started)
            if remaining <= 0:
                raise ValueError("Audit time budget exhausted")
            return min(per_process, remaining)

        contract_hash = digest(contract_path)
        revisions = {name: {"checkout": value, "counts": {"failed": 0, "introduced": 0, "resolved": 0}}
                     for name, value in checkouts.items()}
        report.update(target=target, contract={"sha256": contract_hash}, revisions=revisions,
                      seed=None if replay else data.get("seed", 2026), replay=bool(replay))
        for field in ("display_target", "rule_descriptions"):
            if field in data:
                report[field] = data[field]
        if replay:
            cases = [replay_input(replay, target, contract_hash)]
        contract = runpy.run_path(str(contract_path))
        check = contract["check"]
        if not replay:
            rng = random.Random(data.get("seed", 2026))
            cases = (contract["generate"](rng, index) for index in range(count))

        stage = "checkout identity"
        source_files = data.get("source_files", [])
        for name, root in roots.items():
            revisions[name]["git"] = git_identity(root, timeout)
            if source_files:
                revisions[name]["source_files"] = source_digests(root, source_files)
        if "unittest" in data:
            stage = "shared unittest collection"
            spec = data["unittest"]
            directory = (path.resolve().parent / spec["directory"]).resolve(strict=True)
            if not directory.is_dir():
                raise ValueError("unittest.directory must be a directory")
            pattern = spec.get("pattern", "test*.py")
            if not isinstance(pattern, str) or not pattern:
                raise ValueError("unittest.pattern must be a nonempty string")
            tests_hash = test_digest(directory)
            report["unittest"] = {"directory": spec["directory"], "pattern": pattern,
                                  "python_files_sha256": tests_hash}
            for name, root in roots.items():
                result = run_worker(root, ["tests", target, str(directory), pattern], None, timeout())
                revisions[name].update(module=result["source"], unittest=result["tests"])
            baseline_tests = revisions["baseline"]["unittest"]
            for name, revision in revisions.items():
                tests = revision["unittest"]
                if sorted(tests["methods"]) != sorted(baseline_tests["methods"]):
                    raise ValueError(f"{name}: collected a different set of unittest methods")
            if test_digest(directory) != tests_hash:
                raise ValueError("Shared test files changed during execution")

        stage = "behavioral checks"
        rank = 0
        for case in cases:
            # Give the worker and contract the same JSON value, including normalized object keys.
            case = json.loads(json.dumps(case, allow_nan=False))
            results = compare(roots, revisions, target, check, case, timeout)
            json.dumps(results, allow_nan=False)
            for name, result in results.items():
                counts = revisions[name]["counts"]
                counts["failed"] += bool(result["violations"])
                counts["introduced"] += bool(result["introduced"])
                counts["resolved"] += bool(result["resolved"])
            report["inputs_checked"] += 1
            if (priority := witness_rank(results)) > rank:
                rank = priority
                report["witness"] = {"input": case, "results": results, "confirmation": "pending"}

        stage = "witness confirmation"
        if witness := report["witness"]:
            witness["confirmation"] = "unconfirmed"
            repeat = compare(roots, revisions, target, check, witness["input"], timeout)
            if repeat != witness["results"]:
                witness["confirmation"] = "inconsistent"
                raise ValueError("The selected witness produced different results on rerun")
            witness["confirmation"] = "reproduced"
        stage = "source verification"
        if digest(contract_path) != contract_hash:
            raise ValueError("Contract file changed during execution")
        if "unittest" in report and test_digest(directory) != tests_hash:
            raise ValueError("Shared test files changed during the audit")
        for name, root in roots.items():
            revision = revisions[name]
            source = revision["module"]
            if digest(root / source["path"]) != source["sha256"]:
                raise ValueError(f"{name}: imported source changed during the audit")
            if source_files and source_digests(root, source_files) != revision["source_files"]:
                raise ValueError(f"{name}: a configured source file changed during the audit")
            if git_identity(root, timeout) != revision["git"]:
                raise ValueError(f"{name}: checkout Git identity changed during the audit")
        timeout()
        candidate = revisions["candidate"]
        failed = candidate["counts"]["failed"] or not candidate.get("unittest", {"passed": True})["passed"]
        report["status"] = "failed" if failed else "passed"
    except (WorkerTimeout, subprocess.TimeoutExpired) as exc:
        if time.monotonic() - started >= budget:
            report["error"] = f"{stage}: Audit time budget exhausted"
        else:
            report["error"] = f"{stage}: {exc}"
    except Exception as exc:
        report["error"] = f"{stage}: {exc}"
    report["elapsed_seconds"] = round(time.monotonic() - started, 3)
    return report


def main(path, replay, output_format):
    report = run(path, replay)
    print_report(report, output_format)
    return {"passed": 0, "failed": 1, "inconclusive": 2}[report["status"]]
