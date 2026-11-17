"""Code sandbox for LLM-written analysis (threats T1 exfiltration and T4 escape).

LLM-written Python never runs in this process. It runs in a throwaway Docker container that gets only
the rows a capability already released (as a read-only CSV) and has:

  --network none            no route out, so nothing can be sent anywhere and no database is reachable
  --read-only + tmpfs /tmp  the image cannot be changed; scratch space is in memory and discarded
  --cap-drop ALL, no-new-privileges, non-root user, pids / memory / CPU limits, wall-clock timeout
  no environment, no project code, no credentials and no database drivers in the image

If Docker is not available the step is skipped; code is never run outside the sandbox.
"""
import ast
import json
import shutil
import subprocess
import tempfile
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

from . import config

IMAGE = "investiguard-sandbox:1"
MARK = "<<<IG_RESULT>>>"
TIMEOUT_S = 20
_ALLOWED_IMPORTS = {"pandas", "numpy", "math", "statistics", "datetime", "json", "re", "itertools", "collections"}
_status: dict = {}


@dataclass
class SandboxResult:
    ok: bool
    columns: list[str] = field(default_factory=list)
    rows: list[dict] = field(default_factory=list)
    error: str = ""
    seconds: float = 0.0
    isolation: str = "docker: no network, read-only, non-root, 512 MB, 1 CPU"

    def frame(self) -> pd.DataFrame:
        return pd.DataFrame(self.rows, columns=self.columns)


def status(refresh: bool = False) -> dict:
    """{'available': bool, 'reason': str}. Cached, because `docker` calls are slow."""
    if _status and not refresh:
        return _status
    _status.clear()
    if not shutil.which("docker"):
        _status.update(available=False, reason="Docker is not installed")
        return _status
    try:
        subprocess.run(["docker", "info"], capture_output=True, timeout=8, check=True)
    except Exception:
        _status.update(available=False, reason="Docker is installed but not running")
        return _status
    has = subprocess.run(["docker", "image", "inspect", IMAGE], capture_output=True, timeout=8).returncode == 0
    if not has:
        built = subprocess.run(["docker", "build", "-q", "-t", IMAGE, str(config.ROOT / "sandbox")],
                               capture_output=True, timeout=600)
        if built.returncode != 0:
            _status.update(available=False, reason="could not build the sandbox image")
            return _status
    _status.update(available=True, reason="ready")
    return _status


def precheck(code: str) -> str | None:
    """Cheap static check before starting a container. The container is the real boundary; this only
    turns obvious mistakes into a clear error for the code writer."""
    try:
        tree = ast.parse(code)
    except SyntaxError as e:
        return f"syntax error: {e.msg} (line {e.lineno})"
    for node in ast.walk(tree):
        if isinstance(node, (ast.Import, ast.ImportFrom)):
            names = [a.name for a in node.names] if isinstance(node, ast.Import) else [node.module or ""]
            bad = [n for n in names if n.split(".")[0] not in _ALLOWED_IMPORTS]
            if bad:
                return f"import not available in the sandbox: {bad}; use pandas (pd) and numpy (np)"
    return None


def run_python(code: str, df: pd.DataFrame, timeout_s: int = TIMEOUT_S) -> SandboxResult:
    """Run `code` with the frame available as `df`; it must assign its output to `result`."""
    t0 = time.time()
    err = precheck(code)
    if err:
        return SandboxResult(ok=False, error=err)
    st = status()
    if not st["available"]:
        return SandboxResult(ok=False, error=f"sandbox unavailable: {st['reason']}", isolation="not run")
    name = f"ig-sbx-{uuid.uuid4().hex[:10]}"
    with tempfile.TemporaryDirectory(prefix="ig-sbx-") as tmp:
        work = Path(tmp)
        df.to_csv(work / "input.csv", index=False)
        (work / "code.py").write_text(code)
        work.chmod(0o755)
        for f in work.iterdir():
            f.chmod(0o644)
        cmd = ["docker", "run", "--rm", "--name", name, "--network", "none", "--read-only",
               "--tmpfs", "/tmp:rw,size=64m,noexec", "--memory", "512m", "--memory-swap", "512m", "--cpus", "1",
               "--pids-limit", "64", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
               "-v", f"{work}:/work:ro", IMAGE]
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout_s)
        except subprocess.TimeoutExpired:
            subprocess.run(["docker", "kill", name], capture_output=True)
            return SandboxResult(ok=False, error=f"timed out after {timeout_s}s", seconds=time.time() - t0)
    out = proc.stdout
    if MARK not in out:
        tail = (proc.stderr or out).strip().splitlines()[-1:] or ["no output"]
        return SandboxResult(ok=False, error=f"sandbox exited with code {proc.returncode}: {tail[0][:300]}",
                             seconds=time.time() - t0)
    try:
        payload = json.loads(out.split(MARK, 1)[1].strip().splitlines()[0])
    except (json.JSONDecodeError, IndexError):
        return SandboxResult(ok=False, error="sandbox returned unreadable output", seconds=time.time() - t0)
    if not payload.get("ok"):
        return SandboxResult(ok=False, error=payload.get("error", "error").strip().splitlines()[-1][:400],
                             seconds=time.time() - t0)
    return SandboxResult(ok=True, columns=payload["columns"], rows=payload["rows"], seconds=time.time() - t0)
