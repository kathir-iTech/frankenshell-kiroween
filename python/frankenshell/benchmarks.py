"""Reproduce two released Python behavior changes and verify exported tests."""

import argparse
import ast
import bisect
from dataclasses import dataclass
from decimal import Decimal
from fractions import Fraction
import hashlib
import io
import json
import math
from pathlib import Path
import random
import subprocess
import sys
import tempfile
from types import ModuleType
import unittest
from urllib.request import urlopen

from . import audit_matrix


@dataclass(frozen=True)
class Case:
    id: str
    title: str
    module: str
    function: str
    versions: tuple[str, str]
    hashes: tuple[str, str, str]
    test_version: str
    test_class: str
    edit: tuple[str, str]
    requirement: str
    description: str
    inputs: tuple[tuple[tuple, dict, object], ...]

    def upstream_url(self, version, path):
        return f"https://raw.githubusercontent.com/python/cpython/{version}/Lib/{path}"


CASES = (
    Case(
        id="quantiles",
        title="A fix that only works for quartiles",
        module="statistics",
        function="quantiles",
        versions=("v3.12.0", "v3.13.0"),
        hashes=(
            "b9ef01a757de37e9fbf13d32beeb9530c8271582cabec4998226dcb7e0613cd0",
            "0f618d7c13e99f5289d5e2a20ba8b7340be27ab424f2bffb739ab3be291fe261",
            "539398683494ee4ec09d4f7844c395ef4371ce7b9da2f62068082876e4a2cc8e",
        ),
        test_version="v3.13.0",
        test_class="TestQuantiles",
        edit=("return data * (n - 1)", "return data * 3"),
        requirement="QNT-001",
        description="A singleton must produce n − 1 cut points, each equal to the sample.",
        inputs=(
            (([7],), {"n": 4}, [7, 7, 7]),
            (([7],), {"n": 2}, [7]),
            (([7],), {"n": 1}, []),
            (([7],), {"n": 5, "method": "inclusive"}, [7, 7, 7, 7]),
            (([1, 3],), {"n": 2}, [2.0]),
        ),
    ),
    Case(
        id="dedent",
        title="A blank line that stops dedenting",
        module="textwrap",
        function="dedent",
        versions=("v3.13.0", "v3.14.0"),
        hashes=(
            "26836f5c17cdb4ffdeaff1a5146ed61a262aa410bdf3ad204e2bd0792f010d5e",
            "4da82de99528dd2877948632988fc85094b488540baed6e731367e570a6d9fc4",
            "72e5da91dbb14d19811eb3daf529abe62e7ccbab3bc3bb313fbe3cd08f4e9a0f",
        ),
        test_version="v3.13.0",
        test_class="DedentTestCase",
        edit=(
            "non_blank_lines = [l for l in lines if l and not l.isspace()]",
            "non_blank_lines = [l for l in lines if l.strip(' \\t')]",
        ),
        requirement="DDT-001",
        description="A whitespace-only line must become empty and must not constrain the shared indentation.",
        inputs=(
            (("  a\n \t\n  b",), {}, "a\n\nb"),
            (("  a\n\u00a0\n  b",), {}, "a\n\nb"),
            (("  a\n\v\n  b",), {}, "a\n\nb"),
            (("  a\n    b\n",), {}, "a\n  b\n"),
        ),
    ),
)


def pinned_source(cache, url, digest):
    path = cache / (digest + ".py")
    if path.is_file():
        data = path.read_bytes()
    else:
        with urlopen(url, timeout=20) as response:
            data = response.read(512_001)
    if len(data) > 512_000 or hashlib.sha256(data).hexdigest() != digest:
        raise ValueError(f"SHA-256 mismatch or oversized file: {url}")
    if not path.is_file():
        # Concurrent runs write identical, already verified bytes.
        with tempfile.NamedTemporaryFile(dir=cache, delete=False) as stream:
            stream.write(data)
            pending = Path(stream.name)
        pending.replace(path)
    return data.decode("utf-8")


def load_module(name, source):
    module = ModuleType(name)
    exec(compile(source, f"<reviewed {name}>", "exec"), vars(module))
    return module


def suite_result(tree, case, module):
    test_class = next(node for node in tree.body if isinstance(node, ast.ClassDef)
                      and node.name == case.test_class)
    scope = {
        "unittest": unittest, "random": random, "math": math, "bisect": bisect,
        "Decimal": Decimal, "Fraction": Fraction, case.module: module,
        case.function: getattr(module, case.function),
    }
    code = compile(ast.Module(body=[test_class], type_ignores=[]), "upstream-tests.py", "exec")
    exec(code, scope)
    suite = unittest.defaultTestLoader.loadTestsFromTestCase(scope[case.test_class])
    methods = [test._testMethodName for test in suite]
    state = random.getstate()
    random.seed(2026)
    try:
        result = unittest.TextTestRunner(stream=io.StringIO()).run(suite)
    finally:
        random.setstate(state)
    # The old release can still raise its own StatisticsError on singleton input.
    known = getattr(module, "StatisticsError", None)
    unexpected = [trace for _, trace in result.errors
                  if not known or f"{known.__module__}.{known.__name__}:" not in trace]
    if unexpected or not result.testsRun or result.skipped:
        raise ValueError(f"Could not execute {case.test_class}: {unexpected or result.skipped}")
    failed = [test._testMethodName for test, _ in [*result.failures, *result.errors]]
    return {
        "passed": result.testsRun - len(failed),
        "total": result.testsRun,
        "methods": methods,
        "failed_methods": failed,
    }


def call(function, args, kwargs):
    try:
        return {"value": function(*args, **kwargs)}
    except Exception as exc:
        return {"error": type(exc).__name__, "message": str(exc)}


def regression_test(case, args, kwargs, expected):
    arguments = [repr(value) for value in args]
    arguments.extend(f"{key}={value!r}" for key, value in kwargs.items())
    expression = f"{case.module}.{case.function}({', '.join(arguments)})"
    return f'''"""Regression for {case.requirement}: {case.description}"""
import {case.module}
import unittest


class {case.test_class}Regression(unittest.TestCase):
    def test_{case.requirement.lower().replace("-", "_")}(self):
        self.assertEqual({expression}, {expected!r})


if __name__ == "__main__":
    unittest.main()
'''


def verify_export(case, test, sources):
    statuses = {}
    with tempfile.TemporaryDirectory(prefix="frankenshell-regression-") as directory:
        root = Path(directory)
        path = root / "test_regression.py"
        path.write_text(test, encoding="utf-8")
        for role, source in sources.items():
            folder = root / role
            folder.mkdir()
            (folder / f"{case.module}.py").write_text(source, encoding="utf-8")
            child = subprocess.run(
                [sys.executable, "-I", "-B", "-X", "utf8", "-c",
                 "import runpy,sys;sys.path.insert(0,sys.argv.pop(1));"
                 "runpy.run_path(sys.argv.pop(1),run_name='__main__')", str(folder), str(path)],
                capture_output=True, text=True, encoding="utf-8", timeout=10, check=False,
            )
            if "Ran 1 test" not in child.stderr or (
                child.returncode and "AssertionError:" not in child.stderr
                and "StatisticsError:" not in child.stderr
            ):
                raise ValueError(f"Exported test did not run on {role}: {child.stderr.strip()}")
            statuses[role] = child.returncode == 0
    return statuses


def read_case(case, cache):
    filename = case.module + ".py"
    paths = [case.upstream_url(version, filename) for version in case.versions]
    paths.append(case.upstream_url(case.test_version, f"test/test_{case.module}.py"))
    before, reference, tests = [
        pinned_source(cache, url, digest) for url, digest in zip(paths, case.hashes)
    ]
    old, new = case.edit
    if reference.count(old) != 1:
        raise ValueError(f"{case.id}: expected exactly one edit location")
    sources = {"before": before, "alternative": reference.replace(old, new, 1), "reference": reference}
    return paths, sources, tests


def reproduce(case, cache, checkout_dir=None):
    paths, sources, tests = read_case(case, cache)
    modules = {role: load_module(case.module, source) for role, source in sources.items()}
    tree = ast.parse(tests)
    ordinary = {role: suite_result(tree, case, module) for role, module in modules.items()}
    probes = []
    witness = None
    for args, kwargs, expected in case.inputs:
        outcomes = {
            role: call(getattr(module, case.function), args, kwargs)
            for role, module in modules.items()
        }
        probe = {
            "args": args, "kwargs": kwargs, "expected": expected, "outcomes": outcomes,
        }
        probes.append(probe)
        if outcomes["reference"] != {"value": expected}:
            raise ValueError(f"{case.id}: released code disagrees with the reviewed contract")
        if witness is None and outcomes["alternative"] != {"value": expected}:
            witness = probe
    if witness is None or any(ordinary[role]["failed_methods"] for role in ("reference", "alternative")):
        raise ValueError(f"{case.id}: expected a witness missed by the selected upstream tests")
    test = regression_test(case, witness["args"], witness["kwargs"], witness["expected"])
    verification = verify_export(case, test, sources)
    if verification != {"before": False, "alternative": False, "reference": True}:
        raise ValueError(f"{case.id}: regression export did not distinguish the three revisions")
    if checkout_dir is not None:
        audit_checkouts(case, checkout_dir, sources, tests, ordinary, probes, witness)
    old, new = case.edit
    return {
        "id": case.id, "title": case.title, "target": f"{case.module}.{case.function}",
        "requirement": case.requirement, "description": case.description,
        "releases": case.versions, "test_release": case.test_version, "test_class": case.test_class,
        "upstream": [{"url": url, "sha256": digest} for url, digest in zip(paths, case.hashes)],
        "alternative_edit": {"released": old, "replacement": new},
        "ordinary": ordinary, "probes": probes, "witness": witness,
        "regression": {"source": test, "verification": verification},
    }


def audit_checkouts(case, output, sources, tests, ordinary, probes, witness):
    with tempfile.TemporaryDirectory(prefix=f"frankenshell-{case.id}-") as directory:
        root = Path(directory)
        adapter = (
            f"from reviewed_source import {case.function}\n\n"
            f"def evaluate(case):\n    return {case.function}(*case['args'], **case['kwargs'])\n"
        )
        for role, source in sources.items():
            folder = root / role
            folder.mkdir()
            (folder / "reviewed_source.py").write_text(source, encoding="utf-8", newline="\n")
            (folder / "adapter.py").write_text(adapter, encoding="utf-8", newline="\n")

        suite = root / "suite"
        suite.mkdir()
        test_class = next(node for node in ast.parse(tests).body
                          if isinstance(node, ast.ClassDef) and node.name == case.test_class)
        imports = (
            "import bisect, math, random, unittest\n"
            "from decimal import Decimal\nfrom fractions import Fraction\n"
            f"import reviewed_source as {case.module}\n"
            f"from reviewed_source import {case.function}\n"
            "random.seed(2026)\n\n"
        )
        (suite / "test_upstream.py").write_text(
            imports + ast.get_source_segment(tests, test_class) + "\n",
            encoding="utf-8", newline="\n",
        )
        inputs = [{"args": list(probe["args"]), "kwargs": probe["kwargs"]} for probe in probes]
        expectations = [probe["expected"] for probe in probes]
        contract = (
            f"INPUTS = {inputs!r}\n"
            f"EXPECTED = {expectations!r}\n\n"
            "def generate(rng, index):\n    return INPUTS[index]\n\n"
            "def check(case, actual):\n"
            "    expected = EXPECTED[INPUTS.index(case)]\n"
            f"    return {{}} if actual == expected else {{{case.requirement!r}:"
            " {'expected': expected, 'actual': actual}}\n"
        )
        (root / "contract.py").write_text(contract, encoding="utf-8", newline="\n")
        config = {
            "schema_version": 1, "target": "adapter:evaluate", "contract": "contract.py",
            "source_files": ["reviewed_source.py"], "cases": len(inputs), "timeout": 15,
            "unittest": {"directory": "suite", "pattern": "test_upstream.py"},
            "checkouts": {"baseline": "before", "candidate": "reference", "shortcut": "alternative"},
        }
        path = root / "audit.json"
        path.write_text(json.dumps(config), encoding="utf-8")
        report = audit_matrix.run(path)
        if report["status"] != "passed":
            raise ValueError(f"{case.id}: checkout audit {report['status']}: {report.get('error', report['witness'])}")
        if not report["witness"] or report["witness"]["confirmation"] != "reproduced":
            raise ValueError(f"{case.id}: checkout audit did not reproduce a witness")
        found = report["witness"]
        if found["input"] != {"args": list(witness["args"]), "kwargs": witness["kwargs"]}:
            raise ValueError(f"{case.id}: checkout audit found a different witness")

        for name, role in config["checkouts"].items():
            revision = report["revisions"][name]
            tests_run = revision["unittest"]
            methods = [method.rsplit(".", 1)[-1] for method in tests_run["methods"]]
            failed = [method.rsplit(".", 1)[-1] for method in
                      [*tests_run["failed"], *tests_run["errors"]]]
            actual = found["results"][name]["outcome"]
            expected = witness["outcomes"][role]
            normalized = {"value": actual["output"]} if "output" in actual else {
                "error": actual["error"]["type"], "message": actual["error"]["message"],
            }
            if (sorted(methods) != sorted(ordinary[role]["methods"])
                    or sorted(failed) != sorted(ordinary[role]["failed_methods"])
                    or tests_run["skipped"]
                    or normalized != expected):
                raise ValueError(f"{case.id}: checkout audit disagrees with benchmark for {name}")

        replay_path = root / "report.json"
        replay_path.write_text(json.dumps(report), encoding="utf-8")
        replay = audit_matrix.run(path, replay_path)
        if replay["status"] != "passed" or replay["witness"] != found or replay["inputs_checked"] != 1:
            raise ValueError(f"{case.id}: checkout witness could not be replayed")

        config["checkouts"] = {"baseline": "before", "candidate": "alternative"}
        path.write_text(json.dumps(config), encoding="utf-8")
        rejected = audit_matrix.run(path, replay_path)
        if (rejected["status"] != "failed" or not rejected["revisions"]["candidate"]["unittest"]["passed"]
                or case.requirement not in rejected["witness"]["results"]["candidate"]["violations"]):
            raise ValueError(f"{case.id}: expected the contract to reject the shortcut as candidate")

        config["checkouts"] = {"baseline": "before", "candidate": "reference"}
        path.write_text(json.dumps(config), encoding="utf-8")
        control = audit_matrix.run(path)
        if control["status"] != "passed" or control["witness"] is not None:
            raise ValueError(f"{case.id}: the official fix failed the control")

    output.mkdir(parents=True, exist_ok=True)
    (output / f"{case.id}.json").write_text(
        json.dumps({"audit": report, "replay": replay, "shortcut_as_candidate": rejected,
                    "official_fix_control": control}, indent=2, allow_nan=False) + "\n",
        encoding="utf-8", newline="\n",
    )


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--case", choices=[case.id for case in CASES])
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--cache", type=Path)
    parser.add_argument("--checkout-audit", type=Path, help="Also run and save the checkout verifier reports")
    parser.add_argument("--browser-sources", type=Path, help="Package source for live browser replay")
    args = parser.parse_args(argv)
    try:
        with tempfile.TemporaryDirectory(prefix="frankenshell-upstream-") as directory:
            cache = args.cache or Path(directory)
            cache.mkdir(parents=True, exist_ok=True)
            reports = [
                reproduce(case, cache, args.checkout_audit)
                for case in CASES if not args.case or case.id == args.case
            ]
            if args.browser_sources:
                args.browser_sources.mkdir(parents=True, exist_ok=True)
                for case in CASES:
                    if args.case and case.id != args.case:
                        continue
                    _, sources, _ = read_case(case, cache)
                    pack = {"function": case.function, "sources": sources}
                    (args.browser_sources / f"{case.id}.json").write_text(
                        json.dumps(pack) + "\n", encoding="utf-8", newline="\n",
                    )
        args.out.mkdir(parents=True, exist_ok=True)
        (args.out / "benchmarks.json").write_text(
            json.dumps({"schema_version": 1, "cases": reports}, indent=2) + "\n",
            encoding="utf-8", newline="\n",
        )
        for report in reports:
            (args.out / f"test_{report['id']}_regression.py").write_text(
                report["regression"]["source"], encoding="utf-8", newline="\n",
            )
            print(f"{report['target']}: {report['ordinary']['alternative']['passed']} upstream "
                  f"methods passed on the alternative; exported test rejects it.")
        if args.checkout_audit:
            print("Checkout audits, witness replays, and candidate controls verified.")
    except Exception as exc:
        print(f"Benchmark could not complete: {exc}", file=sys.stderr)
        return 2
    return 0
