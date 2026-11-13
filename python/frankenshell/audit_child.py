"""Subprocess entry point for one trusted checkout and one JSON input."""

import contextlib
import hashlib
import importlib
import io
import json
import os
import sys
from pathlib import Path


def file_source(path):
    source = Path(path).resolve(strict=True)
    return {"path": str(source), "sha256": hashlib.sha256(source.read_bytes()).hexdigest()}


def load_target(target, identify_source):
    module_name, _, function_name = target.partition(":")
    module = importlib.import_module(module_name)
    function = getattr(module, function_name)
    if not callable(function):
        raise TypeError("Target must be callable")
    if not identify_source:
        return function, None
    source = file_source(module.__file__)
    root = Path.cwd().resolve()
    if not Path(source["path"]).is_relative_to(root):
        raise ValueError(f"{module_name} resolved outside the checkout: {source['path']}")
    source["path"] = Path(source["path"]).relative_to(root).as_posix()
    return function, source


def run_tests(directory, pattern):
    import unittest

    # Discovery needs the shared test directory on sys.path for sibling imports.
    # Keep the checkout ahead of it so test imports resolve to the revision under audit.
    root = os.getcwd()
    sys.path.insert(1, directory)
    loader = unittest.TestLoader()
    suite = loader.discover(directory, pattern=pattern)
    if loader.errors:
        raise ValueError("Test collection failed: " + loader.errors[0].strip())
    sys.path.remove(root)
    sys.path.insert(0, root)
    if not suite.countTestCases():
        raise ValueError("No tests collected")

    class RecordingResult(unittest.TextTestResult):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self.methods = []

        def startTest(self, test):
            self.methods.append(test.id())
            super().startTest(test)

    result = unittest.TextTestRunner(stream=io.StringIO(), resultclass=RecordingResult).run(suite)
    if result.testsRun == 0:
        raise ValueError("No tests ran: " + ", ".join(test.id() for test, _ in result.errors))
    if result.testsRun == len(result.skipped):
        raise ValueError("All collected tests were skipped")
    return {
        "run": result.testsRun,
        "methods": result.methods,
        "failed": [test.id() for test, _ in result.failures],
        "errors": [test.id() for test, _ in result.errors],
        "skipped": [test.id() for test, _ in result.skipped],
        "expected_failures": [test.id() for test, _ in result.expectedFailures],
        "unexpected_successes": [test.id() for test in result.unexpectedSuccesses],
        "passed": result.wasSuccessful(),
    }


def main():
    output_path, mode, target, *options = sys.argv[1:]
    if mode != "call":
        # Read source fresh in matrix workers, including on filesystems with coarse mtimes.
        sys.pycache_prefix = str(Path(output_path).parent / "pycache")
        sys.dont_write_bytecode = True
    sys.path.insert(0, os.getcwd())
    with open(os.devnull, "w", encoding="utf-8") as sink:
        with contextlib.redirect_stdout(sink), contextlib.redirect_stderr(sink):
            try:
                function, source = load_target(target, mode != "call")
                if mode == "tests":
                    response = {"source": source, "tests": run_tests(*options)}
                else:
                    case = json.load(sys.stdin)
                    try:
                        response = {"output": function(case)}
                    except Exception as exc:
                        response = {"error": {"type": type(exc).__name__, "message": str(exc)}}
                    if source is not None:
                        response["source"] = source
            except Exception as exc:
                response = {"setup_error": f"{type(exc).__name__}: {exc}"}
    payload = json.dumps(response, allow_nan=False)
    if len(payload.encode("utf-8")) > 65536:
        raise ValueError("Result exceeds 64 KiB")
    Path(output_path).write_text(payload, encoding="utf-8")


if __name__ == "__main__":
    main()
