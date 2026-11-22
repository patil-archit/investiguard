"""Web-layer hardening for the InvestiGuard API.

  * Host allow-list            stops DNS-rebinding pages from talking to a server bound to localhost
  * Same-origin writes         a POST/PUT/DELETE carrying a foreign Origin header is refused (CSRF)
  * Security headers           CSP, no framing, no sniffing, no referrer, no powerful browser features
  * Rate limits                per client IP, on the endpoints that spend model calls or CPU
  * Body size cap              uploads above the limit are refused before they are read into memory
  * Request ids                every response carries X-Request-ID for the audit trail

Everything here is deterministic configuration; `controls()` lists it for the Security page.
"""
import os
import threading
import time
import uuid
from collections import defaultdict, deque

from fastapi import Request
from fastapi.responses import JSONResponse

ALLOWED_HOSTS = {h.strip().lower() for h in os.getenv("IG_ALLOWED_HOSTS", "localhost,127.0.0.1,[::1],testserver").split(",") if h.strip()}
MAX_BODY_MB = int(os.getenv("IG_MAX_UPLOAD_MB", "500"))
RATE_LIMITS = {  # path prefix, method -> (requests, window seconds)
    ("/api/investigations", "POST"): (20, 60),
    ("/api/ask", "POST"): (40, 60),
    ("/api/benchmark/run", "POST"): (2, 600),
    ("/api/threats/run", "GET"): (10, 60),
    ("/api/datasets/upload", "POST"): (10, 300),
    ("/api/datasets/connect", "POST"): (10, 300),
}
CSP = ("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
       "font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob:; connect-src 'self'; "
       "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'")
HEADERS = {
    "Content-Security-Policy": CSP,
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Resource-Policy": "same-origin",
}

_hits: dict[tuple[str, str], deque] = defaultdict(deque)
_lock = threading.Lock()
STATS = {"blocked_host": 0, "blocked_origin": 0, "rate_limited": 0, "too_large": 0, "requests": 0}


def _host_ok(host: str) -> bool:
    name = host.rsplit(":", 1)[0] if not host.startswith("[") else host.split("]")[0] + "]"
    return name.lower() in ALLOWED_HOSTS


def _origin_ok(request: Request) -> bool:
    origin = request.headers.get("origin")
    if not origin or origin == "null":
        return origin is None
    host = origin.split("://", 1)[-1].split("/", 1)[0]
    return _host_ok(host)


def _limited(request: Request) -> tuple[bool, int]:
    for (prefix, method), (n, window) in RATE_LIMITS.items():
        if request.method == method and request.url.path.startswith(prefix):
            key = (request.client.host if request.client else "?", prefix)
            now = time.time()
            with _lock:
                q = _hits[key]
                while q and q[0] < now - window:
                    q.popleft()
                if len(q) >= n:
                    return True, int(window - (now - q[0])) + 1
                q.append(now)
    return False, 0


async def middleware(request: Request, call_next):
    STATS["requests"] += 1
    rid = uuid.uuid4().hex[:12]

    def refuse(code: int, msg: str, stat: str, extra: dict | None = None):
        STATS[stat] += 1
        return JSONResponse({"detail": msg}, status_code=code, headers={**HEADERS, "X-Request-ID": rid, **(extra or {})})

    if not _host_ok(request.headers.get("host", "")):
        return refuse(400, "host not allowed", "blocked_host")
    if request.method in ("POST", "PUT", "PATCH", "DELETE") and not _origin_ok(request):
        return refuse(403, "cross-origin request refused", "blocked_origin")
    size = request.headers.get("content-length")
    if size and size.isdigit() and int(size) > MAX_BODY_MB * 1024 * 1024:
        return refuse(413, f"request body over {MAX_BODY_MB} MB", "too_large")
    limited, retry = _limited(request)
    if limited:
        return refuse(429, f"too many requests; try again in {retry}s", "rate_limited", {"Retry-After": str(retry)})
    resp = await call_next(request)
    for k, v in HEADERS.items():
        resp.headers.setdefault(k, v)
    resp.headers["X-Request-ID"] = rid
    if request.url.path.startswith("/api/"):
        resp.headers.setdefault("Cache-Control", "no-store")
    return resp


def controls() -> list[dict]:
    """Every security control in the system, grouped by layer, for the Security page."""
    return [
        {"layer": "Web", "name": "Host allow-list", "plain": "Only answers requests addressed to this computer.",
         "detail": ", ".join(sorted(ALLOWED_HOSTS)), "stat": STATS["blocked_host"]},
        {"layer": "Web", "name": "Same-origin writes", "plain": "Other websites cannot press buttons in this app for you.",
         "detail": "POST/PUT/DELETE with a foreign Origin header -> 403", "stat": STATS["blocked_origin"]},
        {"layer": "Web", "name": "Content Security Policy", "plain": "The page only runs its own code.",
         "detail": CSP, "stat": None},
        {"layer": "Web", "name": "Rate limits", "plain": "Nobody can flood the expensive endpoints.",
         "detail": "; ".join(f"{m} {p}: {n}/{w}s" for (p, m), (n, w) in RATE_LIMITS.items()), "stat": STATS["rate_limited"]},
        {"layer": "Web", "name": "Upload size cap", "plain": "Huge uploads are refused before they are read.",
         "detail": f"{MAX_BODY_MB} MB", "stat": STATS["too_large"]},
        {"layer": "Web", "name": "Path containment", "plain": "File requests cannot climb out of the app folder.",
         "detail": "resolved path must stay inside frontend/dist", "stat": None},
        {"layer": "Secrets", "name": "Per-install signing key", "plain": "Keys and receipts are signed with a random key made on this machine.",
         "detail": "256-bit, data/.signing_key (0600) or CAP_SECRET; receipts carry only its fingerprint", "stat": None},
        {"layer": "Secrets", "name": "Connection strings in .env", "plain": "Database passwords never go into project files.",
         "detail": ".env written with mode 0600; datasets.yaml stores the variable name only", "stat": None},
        {"layer": "Agent", "name": "Policy engine P1-P5", "plain": "Plain code decides what the AI may read, not the AI.",
         "detail": "operation, sensitivity, declaration, evidence gate, budgets", "stat": None},
        {"layer": "Agent", "name": "Hypothesis-scoped keys", "plain": "Each test gets its own short-lived key for a few columns.",
         "detail": "HMAC-SHA256 JWT, TTL <= 900 s, revoked on verdict", "stat": None},
        {"layer": "Agent", "name": "SQL gateway", "plain": "Every query is taken apart and checked column by column.",
         "detail": "sqlglot AST; single read-only SELECT; COUNT-only for confidential; row limit; read-only connection", "stat": None},
        {"layer": "Agent", "name": "Injection firewall", "plain": "Orders hidden in the data are blanked out before the AI reads them.",
         "detail": "8 deterministic pattern families", "stat": None},
        {"layer": "Agent", "name": "Claim filter", "plain": "Report sentences without evidence are deleted.",
         "detail": "claims must cite evidence ids that exist", "stat": None},
        {"layer": "Execution", "name": "Docker sandbox", "plain": "AI-written code runs in a sealed box with no internet.",
         "detail": "--network none, read-only, non-root, cap-drop ALL, 512 MB, 1 CPU, 64 pids", "stat": None},
        {"layer": "Audit", "name": "Hash-chained receipt", "plain": "A tamper-evident record of everything the AI touched.",
         "detail": "SHA-256 chain + HMAC-SHA256 seal, re-verifiable", "stat": None},
        {"layer": "Audit", "name": "Human approval", "plain": "You can allow one blocked test, once, for two minutes.",
         "detail": "only P4/P5 are waivable; P1-P3 never", "stat": None},
    ]
