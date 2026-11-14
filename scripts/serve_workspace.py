"""Serve the built FrankenShell workspace and run trusted local audits."""

import argparse
from hmac import compare_digest
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile
from threading import Lock
from urllib.parse import urlsplit
import webbrowser


ROOT = Path(__file__).resolve().parents[1]
REPORT_LIMIT = 2 * 1024 * 1024


class WorkspaceHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / "dist"), **kwargs)

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        super().end_headers()

    def send_head(self):
        if self.headers.get("Host") != self.server.address:
            self.send_error(403)
            return None
        path = Path(self.translate_path(self.path)).resolve()
        if not path.is_relative_to((ROOT / "dist").resolve()) or not path.is_file():
            if urlsplit(self.path).path != "/":
                self.send_error(404)
                return None
        return super().send_head()

    def reply(self, status, payload):
        data = json.dumps(payload, allow_nan=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if self.path != "/api/audit":
            self.reply(404, {"error": "Unknown endpoint"})
            return
        if (
            self.headers.get("Host") != self.server.address
            or self.headers.get("Origin") != f"http://{self.server.address}"
            or not compare_digest(
                self.headers.get("X-FrankenShell-Session", "").encode("utf-8"),
                self.server.token.encode("ascii"),
            )
        ):
            self.reply(403, {"error": "Open the session URL printed by FrankenShell."})
            return
        if self.headers.get_content_type() != "application/json":
            self.reply(415, {"error": "Expected application/json"})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 32_768:
                self.reply(413, {"error": "Audit settings must fit within 32 KiB."})
                return
            self.connection.settimeout(10)
            data = json.loads(self.rfile.read(length))
        except (ValueError, OSError):
            self.reply(400, {"error": "Could not read audit settings."})
            return
        if not self.server.audit_lock.acquire(blocking=False):
            self.reply(409, {"error": "An audit is already running in this session."})
            return
        try:
            report = run_audit(self.server.project_root, data)
        except (KeyError, TypeError, ValueError, OSError) as exc:
            self.reply(400, {"error": str(exc)})
        except subprocess.TimeoutExpired:
            self.reply(504, {"error": "The local audit exceeded the session time limit."})
        finally:
            self.server.audit_lock.release()
        if "report" in locals():
            self.reply(200, report)


def run_audit(root, data):
    if not isinstance(data, dict):
        raise ValueError("Expected audit settings as a JSON object.")
    allowed = {"baseline", "candidate", "alternative", "target", "contract", "tests", "cases"}
    if data.keys() - allowed:
        raise ValueError("Unknown audit setting.")
    for field in ("baseline", "candidate", "target", "contract"):
        if not isinstance(data.get(field), str) or not data[field].strip():
            raise ValueError(f"Enter a value for {field}.")
    for field in ("alternative", "tests"):
        if field in data and not isinstance(data[field], str):
            raise ValueError(f"Expected text for {field}.")
    config = {
        "schema_version": 1,
        "checkouts": {"baseline": str(root / data["baseline"]), "candidate": str(root / data["candidate"])},
        "target": data["target"],
        "contract": str(root / data["contract"]),
        "cases": data.get("cases", 8),
        "timeout": 15,
        "budget_seconds": 120,
    }
    if data.get("alternative"):
        config["checkouts"]["alternative"] = str(root / data["alternative"])
    if data.get("tests"):
        config["unittest"] = {"directory": str(root / data["tests"])}
    with tempfile.TemporaryDirectory(prefix="frankenshell-workspace-") as folder:
        path = Path(folder) / "audit.json"
        path.write_text(json.dumps(config), encoding="utf-8")
        with tempfile.TemporaryFile() as output:
            process = subprocess.run(
                [sys.executable, "-X", "utf8", str(ROOT / "scripts/audit_repair.py"), "--config", str(path)],
                cwd=root, stdin=subprocess.DEVNULL, stdout=output, stderr=subprocess.DEVNULL,
                timeout=130, check=False,
            )
            if process.returncode not in (0, 1, 2):
                raise ValueError(f"Audit exited unexpectedly with status {process.returncode}.")
            output.seek(0)
            raw = output.read(REPORT_LIMIT + 1)
    if len(raw) > REPORT_LIMIT:
        raise ValueError("Audit report exceeds 2 MiB.")
    try:
        report = json.loads(raw)
    except ValueError as exc:
        raise ValueError("The audit did not produce a JSON report.") from exc
    if not isinstance(report, dict) or report.get("schema_version") != 2:
        raise ValueError("The audit did not produce a schema v2 report.")
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", type=Path, default=Path.cwd())
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    if not (ROOT / "dist/index.html").is_file():
        parser.error("Build the workspace first with npm ci and npm run build.")
    project_root = args.project_root.resolve()
    if not project_root.is_dir():
        parser.error("--project-root must be a directory.")
    with ThreadingHTTPServer(("127.0.0.1", args.port), WorkspaceHandler) as server:
        server.address = f"127.0.0.1:{server.server_port}"
        server.token = secrets.token_urlsafe(32)
        server.project_root = project_root
        server.audit_lock = Lock()
        url = f"http://{server.address}/#session={server.token}"
        print(f"Workspace: {url}", flush=True)
        print(f"Relative paths resolve under {project_root}", flush=True)
        if not args.no_browser:
            webbrowser.open(url)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
