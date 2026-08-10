"""Serve the exported Next.js bundle (apps/web `out/`) from the api process.

The web app is a static export (`output: 'export'`); this module is the whole
"web server": content-hashed build assets under /_next get immutable caching,
everything else gets no-store (same split the old next.config headers() did).
Session pages are runtime UUIDs, so every /session/* path serves the single
exported shell and the client router reads the id from the URL.

Registered after all API routers in create_app(), so /voice/*, /connect-auth/*,
/healthz and /docs always win over the catch-all.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from starlette.staticfiles import StaticFiles

from scribe.core.custom_logger import get_logger

logger = get_logger(__name__)

IMMUTABLE = "public, max-age=31536000, immutable"
NO_STORE = "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"

# Prefixes owned by the API; the catch-all must 404 these as API paths, never
# swallow them into the SPA fallback.
_API_PREFIXES = ("voice/", "connect-auth/", "healthz", "docs", "openapi.json", "redoc")


class _ImmutableStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):
        response = await super().get_response(path, scope)
        response.headers["Cache-Control"] = IMMUTABLE
        return response


def mount_web_static(app: FastAPI, dist_dir: str) -> None:
    root = Path(dist_dir).resolve()
    if not root.is_dir():
        logger.warning("WEB_DIST_DIR does not exist, web UI not served", dist_dir=dist_dir)
        return

    app.mount("/_next", _ImmutableStaticFiles(directory=root / "_next"), name="web-next")

    session_shell = root / "session" / "_.html"
    session_flight = root / "session" / "_.txt"
    not_found_page = root / "404.html"

    def _file(fp: Path, status_code: int = 200) -> FileResponse:
        return FileResponse(fp, status_code=status_code, headers={"Cache-Control": NO_STORE})

    @app.api_route("/{path:path}", methods=["GET", "HEAD"], include_in_schema=False)
    async def web_app(path: str):  # pyright: ignore[reportUnusedFunction]
        if path.startswith(_API_PREFIXES):
            raise HTTPException(status_code=404)
        if path in ("", "index.html"):
            return _file(root / "index.html")
        # Any session id maps to the one exported shell (ids are runtime UUIDs).
        # The client router fetches <path>.txt for the RSC flight payload on
        # client-side navigations — serving HTML there makes Next fall back to
        # a full-document reload.
        if path == "session" or path.startswith("session/"):
            if path.endswith(".txt"):
                return _file(session_flight)
            return _file(session_shell)

        candidate = (root / path).resolve()
        if not candidate.is_relative_to(root):
            raise HTTPException(status_code=404)
        if candidate.is_file():
            return _file(candidate)
        # Route without extension → its exported HTML (e.g. /template → template.html).
        html = candidate.with_name(candidate.name + ".html")
        if html.is_file():
            return _file(html)
        return _file(not_found_page, status_code=404)

    logger.info("serving web UI", dist_dir=str(root))
