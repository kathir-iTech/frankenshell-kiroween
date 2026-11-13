"""Subprocess entry point for one trusted checkout and one JSON input."""

import contextlib
import importlib
import json
import os
import sys
from pathlib import Path


def main():
    target, output_path = sys.argv[1:]
    module_name, _, function_name = target.partition(":")
    sys.path.insert(0, os.getcwd())
    with open(os.devnull, "w", encoding="utf-8") as sink:
        with contextlib.redirect_stdout(sink), contextlib.redirect_stderr(sink):
            try:
                function = getattr(importlib.import_module(module_name), function_name)
                if not callable(function):
                    raise TypeError("Target must be callable")
                case = json.load(sys.stdin)
            except Exception as exc:
                response = {"setup_error": f"{type(exc).__name__}: {exc}"}
            else:
                try:
                    response = {"output": function(case)}
                except Exception as exc:
                    response = {"error": {"type": type(exc).__name__, "message": str(exc)}}
    payload = json.dumps(response, allow_nan=False)
    if len(payload.encode("utf-8")) > 65536:
        raise ValueError("Result exceeds 64 KiB")
    Path(output_path).write_text(payload, encoding="utf-8")


if __name__ == "__main__":
    main()
