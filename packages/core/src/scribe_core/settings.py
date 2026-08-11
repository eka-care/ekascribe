"""Central configuration for the whole stack (decision: one pydantic-settings module).

Every scattered ``os.getenv`` in the forked code migrates here during the port.
All services (api, worker, setup script) import the same ``get_settings()``.
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Deployment ---------------------------------------------------------
    env: Literal["local", "dev", "prod"] = "local"
    self_url: str = "http://localhost:8000"  # public base URL of the API (discovery doc, upload URLs)
    # Exported web bundle (apps/web out/) served by the api at /. None = API only
    # (native dev runs `next dev` instead); the Docker image sets /app/web-static.
    web_dist_dir: str | None = None

    # --- Pluggable backends --------------------------------------------------
    storage_backend: Literal["local", "s3"] = "local"
    # Where the pipeline runs:
    #   inprocess = FastAPI in-process background jobs (single container, no worker)
    #   worker    = defer to Postgres/procrastinate; apps/worker consumes
    execution_mode: Literal["worker", "inprocess"] = "inprocess"

    # --- Storage ------------------------------------------------------------
    storage_root: str = "./storage"          # STORAGE_BACKEND=local
    s3_bucket: str | None = None             # STORAGE_BACKEND=s3
    s3_endpoint_url: str | None = None       # real AWS if None; LocalStack/MinIO otherwise
    aws_region: str = "ap-south-1"

    # --- Database -----------------------------------------------------------
    database_url: str = "postgresql://scribe:scribe@localhost:5432/scribe"

    # --- Auth (decision #17: dev-token only for v1) -------------------------
    auth_mode: Literal["dev", "jwt", "sso"] = "dev"
    dev_auth_token: str | None = None        # if set, requests must send it (Authorization: Bearer <token>)
    dev_b_id: str = "onprem-workspace"
    dev_uuid: str = "00000000-0000-0000-0000-000000000001"
    dev_oid: str = "onprem-doctor-oid"
    dev_client_id: str | None = None         # machine-client id (optional)
    auth_issuer: str = "scribe.local"
    # --- Session auth (AUTH_MODE=jwt): username/password login + cookie JWT --
    auth_jwt_secret: str | None = None       # REQUIRED in jwt mode (HS256 signing key)
    auth_access_ttl_seconds: int = 900       # access JWT lifetime (15 min)
    auth_refresh_ttl_seconds: int = 2592000  # refresh token + cookie lifetime (30 d)
    auth_cookie_name: str = "scribe_session"
    auth_refresh_cookie_name: str = "scribe_refresh"
    auth_cookie_secure: bool = False         # True behind HTTPS (prod)
    auth_cookie_domain: str | None = None    # e.g. .dev.eka.care to span FE/BE subdomains
    auth_allow_signup: bool = True           # open registration; set False to lock down
    auth_allow_password_login: bool = True   # False on SSO deployments: /login + /signup return 403
    # --- SSO (AUTH_MODE=sso): trust the platform's `token` cookie, exchange it
    # --- for our session via the platform's userinfo API (Open WebUI /api/v1/auths/)
    sso_userinfo_url: str | None = None      # e.g. http://indiaai-portal:8080/api/v1/auths/
    sso_token_cookie: str = "token"          # platform cookie carrying the user's JWT
    sso_login_redirect_url: str = "https://bharatai.gov.in/auth"  # where unauthenticated users go
    sso_request_timeout_s: float = 10.0
    sso_verify_ssl: bool = True              # False for self-signed platform endpoints
    upload_url_signing_secret: str = "change-me"  # signs tokenized upload URLs (attachAuth: false path)

    # --- Models: STT (decision #14: Sarvam cloud default, local optional) ---
    echo_default_transcriber_provider: str = "sarvam"
    sarvam_api_key: str | None = None
    deepgram_api_key: str | None = None

    # --- Models: LLM (decision #15: any OpenAI-compatible endpoint) ---------
    echo_default_llm_provider: str = "openai_compatible"
    echo_llm_base_url: str = "http://localhost:11434/v1"  # vLLM/Ollama; or api.openai.com/v1
    echo_llm_api_key: str | None = None
    echo_llm_model: str = Field(
        default="qwen3:14b",
        validation_alias=AliasChoices("ECHO_LLM_MODEL", "ECHO_DEFAULT_LLM_MODEL"),
    )

    # --- Logging (file-based, keeps get_logger kwargs signature) ------------
    log_dir: str = "./logs"
    log_level: str = "INFO"
    log_max_bytes: int = 50 * 1024 * 1024
    log_backup_count: int = 5

    # --- Discovery doc ------------------------------------------------------
    discovery_support_email: str = "admin@example.com"

    queue_dsn: str | None = Field(default=None, description="Override procrastinate DSN; defaults to database_url")

    @property
    def procrastinate_dsn(self) -> str:
        return self.queue_dsn or self.database_url


def _export_env_file() -> None:
    """Export .env into os.environ (setdefault — real env vars win).

    pydantic-settings reads .env for Settings fields, but the forked voice2rx
    code and echo-sdk read os.getenv() directly (ECHO_DEFAULT_TRANSCRIBER_PROVIDER,
    SARVAM_API_KEY, ANTHROPIC_API_KEY, ...). Without this export, those reads
    silently miss .env in any process that wasn't started by the setup script.
    Last occurrence of a key in the file wins (dotenv convention).
    """
    import os
    from pathlib import Path

    path = Path(os.getenv("ENV_FILE", ".env"))
    if not path.is_file():
        return
    parsed: dict = {}
    try:
        for line in path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                parsed[k.strip()] = v.strip()
    except OSError:
        return
    for k, v in parsed.items():
        os.environ.setdefault(k, v)


@lru_cache
def get_settings() -> Settings:
    _export_env_file()
    return Settings()
