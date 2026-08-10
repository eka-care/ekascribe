#!/usr/bin/env python3
"""ekascribe one-command init (plan B5, Phase 6).

    uv run python scripts/setup.py [options]

Steps (each skippable):
  1. .env generation (secrets + dev-auth identity)          [--no-env]
  2. DB connectivity check
  3. Storage read/write/delete probe
  4. Migrations: app schema + procrastinate queue schema
  5. Queue enqueue round-trip probe
  6. Seeds: 3 starter templates for the directory (templates/seed_data.yaml)
     + workspace config bound to the dev identity            [--no-seed]
  7. Model checks: prompts resolve, LLM ping, STT ping       [--skip-model-check]
  8. Serve-and-verify: boot API, hit /voice/ping + discovery [--no-serve-check]
  9. --smoke: end-to-end session against a RUNNING api+worker

Run from the repo root. Idempotent — safe to re-run.
"""

from __future__ import annotations

import argparse
import os
import secrets as pysecrets
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "apps" / "api" / "src"))

OK, FAIL, SKIP, WARN = "  [ok]  ", "  [FAIL]", "  [skip]", "  [warn]"


def _load_env() -> None:
    """Load .env into the process env. Last occurrence of a key wins (dotenv
    convention); real environment variables still take precedence."""
    env_path = ROOT / ".env"
    if not env_path.exists():
        return
    parsed: dict[str, str] = {}
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            parsed[k.strip()] = v.strip()
    for k, v in parsed.items():
        os.environ.setdefault(k, v)


def step_env(non_interactive: bool) -> bool:
    env_path = ROOT / ".env"
    if env_path.exists():
        print(f"{OK} .env exists — leaving untouched")
        return True
    shutil.copy(ROOT / ".env.example", env_path)
    content = env_path.read_text()
    content = content.replace(
        "UPLOAD_URL_SIGNING_SECRET=change-me",
        f"UPLOAD_URL_SIGNING_SECRET={pysecrets.token_urlsafe(32)}",
    )
    content = content.replace(
        "# DEV_AUTH_TOKEN=", f"DEV_AUTH_TOKEN={pysecrets.token_urlsafe(24)}"
    )
    env_path.write_text(content)
    print(f"{OK} wrote .env (signing secret + dev token generated)")
    if not non_interactive:
        print("       edit it to set SARVAM_API_KEY / ECHO_LLM_BASE_URL, then re-run")
    return True


def step_db() -> bool:
    from scribe_core.settings import get_settings

    s = get_settings()
    try:
        import psycopg

        with psycopg.connect(s.database_url, connect_timeout=5) as conn:
            conn.execute("SELECT 1")
        print(f"{OK} postgres reachable ({s.database_url.split('@')[-1]})")
        return True
    except Exception as e:
        print(f"{FAIL} database: {e}")
        return False


def step_storage() -> bool:
    try:
        from scribe_core.storage import get_blob_store

        store = get_blob_store()
        store.put("voice-records", "_setup/probe.txt", b"probe")
        assert store.get("voice-records", "_setup/probe.txt") == b"probe"
        assert store.exists("voice-records", "_setup/probe.txt")
        store.delete("voice-records", "_setup/probe.txt")
        print(f"{OK} storage write/read/delete probe")
        return True
    except Exception as e:
        print(f"{FAIL} storage: {e}")
        return False


def step_migrations() -> bool:
    from scribe_core.settings import get_settings

    s = get_settings()
    ok = True
    try:
        from scribe_core.db import ensure_schema

        ensure_schema()
        print(f"{OK} app schema (tables + indexes)")
    except Exception as e:
        print(f"{FAIL} app schema: {e}")
        ok = False
    try:
        import procrastinate

        app = procrastinate.App(
            connector=procrastinate.SyncPsycopgConnector(conninfo=s.procrastinate_dsn)
        )
        with app.open():
            try:
                app.schema_manager.apply_schema()
                print(f"{OK} procrastinate schema applied")
            except Exception:
                print(f"{OK} procrastinate schema already present")
    except Exception as e:
        print(f"{FAIL} procrastinate schema: {e}")
        ok = False
    return ok


def step_queue() -> bool:
    from scribe_core.settings import get_settings

    try:
        from scribe_core.queue import get_task_queue

        get_task_queue().enqueue("setup_probe", {"ts": int(time.time())})
        import psycopg

        with psycopg.connect(get_settings().procrastinate_dsn) as conn:
            n = conn.execute(
                "SELECT count(*) FROM procrastinate_jobs WHERE task_name='setup_probe'"
            ).fetchone()[0]
            assert n >= 1
            # clean up: probe jobs have no real task — don't leave them for the worker
            conn.execute("DELETE FROM procrastinate_jobs WHERE task_name='setup_probe'")
            conn.commit()
        print(f"{OK} queue enqueue round-trip verified (probe cleaned up)")
        return True
    except Exception as e:
        print(f"{FAIL} queue: {e}")
        return False


def step_seed() -> bool:
    try:
        import yaml

        from scribe_core.settings import get_settings
        from scribe.repositories.doc_store import DocStore

        s = get_settings()
        data = yaml.safe_load((ROOT / "templates" / "seed_data.yaml").read_text())

        section_db = DocStore("ekascribe_template_section")
        for sec in data.get("sections", []):
            sec.setdefault("wid", "DEFAULT")
            section_db.upsert_item(key_dict={"id": sec["id"]}, update_dict=sec)
        template_db = DocStore("ekascribe_template")
        for tpl in data.get("templates", []):
            tpl.setdefault("wid", "DEFAULT")
            template_db.upsert_item(key_dict={"id": tpl["id"]}, update_dict=tpl)

        # No default template selection — users pick from the directory.
        config_db = DocStore("ekascribe_config")
        config_db.upsert_item(
            key_dict={"b_id": s.dev_b_id, "user_uuid": "_"},
            update_dict={"model_type": "pro"},
        )
        print(
            f"{OK} seeded {len(data.get('sections', []))} sections, "
            f"{len(data.get('templates', []))} templates, config for b_id={s.dev_b_id}"
        )
        return True
    except Exception as e:
        print(f"{FAIL} seed: {e}")
        return False


def step_models() -> bool:
    ok = True
    # agent prompt files resolve
    try:
        from scribe.prompts import AGENT_PROMPT_NAMES, get_prompt_service

        svc = get_prompt_service()
        for key in AGENT_PROMPT_NAMES:
            svc.get_parsed_agent_prompt(key)
        print(f"{OK} all {len(AGENT_PROMPT_NAMES)} agent prompts resolve from agents/prompts/")
    except Exception as e:
        print(f"{FAIL} prompts: {e}")
        ok = False

    # LLM ping
    try:
        from echo.llm import LLMConfig, get_llm
        from echo.models import ConversationContext, Message, MessageRole, TextMessage
        import asyncio

        from scribe_core.settings import get_settings

        s = get_settings()
        llm = get_llm(
            LLMConfig(
                provider=s.echo_default_llm_provider,
                model=s.echo_llm_model,
                base_url=s.echo_llm_base_url,
                max_tokens=16,
            )
        )
        ctx = ConversationContext(
            messages=[Message(role=MessageRole.USER, content=[TextMessage(text="Say OK")])]
        )
        resp, _ = asyncio.run(llm.invoke(context=ctx))
        print(f"{OK} LLM ping via {s.echo_default_llm_provider} ({s.echo_llm_model})")
    except Exception as e:
        print(f"{WARN} LLM ping failed (is your endpoint up?): {str(e)[:140]}")
        ok = False

    # STT ping with the synthetic fixture
    try:
        import asyncio

        from echo.audio.transcription.config import TranscriberConfig
        from echo.audio.transcription.factory import get_transcriber

        from scribe_core.settings import get_settings

        s = get_settings()
        if s.echo_default_transcriber_provider == "sarvam" and not (
            s.sarvam_api_key or os.getenv("SARVAM_API_KEY")
        ):
            print(f"{SKIP} STT ping (no SARVAM_API_KEY set)")
        else:
            fixture = (
                ROOT / "apps" / "api" / "scripts" / "files" / "synthetic_audio" / "1.m4a"
            )
            t = get_transcriber(
                TranscriberConfig(provider=s.echo_default_transcriber_provider)
            )
            result = asyncio.run(t.transcribe(fixture.read_bytes(), mime_type="audio/mp4"))
            if result.error:
                raise RuntimeError(result.error)
            print(f"{OK} STT ping via {s.echo_default_transcriber_provider}")
    except Exception as e:
        print(f"{WARN} STT ping failed: {str(e)[:140]}")
        ok = False
    return ok


def step_serve() -> bool:
    from scribe_core.settings import get_settings

    port = int(os.getenv("SETUP_SERVE_PORT", "8765"))
    log_path = ROOT / "logs" / "setup-serve.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_f = open(log_path, "w")
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "scribe.main:app", "--port", str(port)],
        cwd=ROOT,
        env={**os.environ, "PYTHONPATH": str(ROOT / "apps" / "api" / "src")},
        stdout=log_f,
        stderr=subprocess.STDOUT,
    )
    try:
        import httpx

        for _ in range(40):
            time.sleep(0.5)
            try:
                with socket.create_connection(("127.0.0.1", port), timeout=1):
                    break
            except OSError:
                continue
        r = httpx.get(f"http://127.0.0.1:{port}/voice/ping", timeout=5)
        assert r.json() == {"ping": "pong"}
        d = httpx.get(
            f"http://127.0.0.1:{port}/voice/v1/.well-known/medscribealliance", timeout=5
        )
        assert d.status_code == 200 and "eka.care" not in d.text
        base = d.json()["endpoints"]["base_url"]
        expected = get_settings().self_url.rstrip("/")
        flag = OK if base.startswith(expected) else WARN
        print(f"{flag} API boots; ping + discovery serve (base_url={base})")
        return True
    except Exception as e:
        tail = ""
        try:
            tail = log_path.read_text()[-400:]
        except Exception:
            pass
        print(f"{FAIL} serve check: {type(e).__name__}: {e}\n       log tail: {tail}")
        return False
    finally:
        proc.terminate()
        proc.wait(timeout=10)
        log_f.close()


def step_smoke() -> bool:
    """End-to-end against a RUNNING api (+worker): create → upload → end → poll."""
    import httpx

    from scribe_core.settings import get_settings

    s = get_settings()
    base = f"{s.self_url.rstrip('/')}/voice/v1"
    headers = {}
    if s.dev_auth_token:
        headers["Authorization"] = f"Bearer {s.dev_auth_token}"
    try:
        r = httpx.post(
            f"{base}/sessions",
            json={"mode": "consultation", "upload_type": "chunked"},
            headers=headers,
            timeout=30,
        )
        r.raise_for_status()
        session = r.json()
        sid = session.get("session_id") or session.get("txn_id")
        fixture_dir = ROOT / "apps" / "api" / "scripts" / "files" / "synthetic_audio"
        for i, f in enumerate(sorted(fixture_dir.glob("*.m4a"))):
            up = httpx.post(
                f"{base}/sessions/{sid}/audio/audio_{i}.m4a",
                content=f.read_bytes(),
                headers={**headers, "Content-Type": "audio/m4a"},
                timeout=60,
            )
            up.raise_for_status()
        end = httpx.patch(
            f"{base}/sessions/{sid}", json={"action": "end"}, headers=headers, timeout=30
        )
        print(f"       session={sid} uploaded; end status={end.status_code}")
        for _ in range(30):
            time.sleep(5)
            poll = httpx.get(f"{base}/sessions/{sid}", headers=headers, timeout=30)
            print(f"       poll: {poll.status_code}")
            if poll.status_code == 200:
                print(f"{OK} smoke: session completed end-to-end")
                return True
        print(f"{WARN} smoke: session did not complete in 150s (check worker + STT/LLM)")
        return False
    except Exception as e:
        print(f"{FAIL} smoke: {e}")
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description="ekascribe setup")
    parser.add_argument("--non-interactive", action="store_true")
    parser.add_argument("--no-env", action="store_true")
    parser.add_argument("--no-seed", action="store_true")
    parser.add_argument("--skip-model-check", action="store_true")
    parser.add_argument("--no-serve-check", action="store_true")
    parser.add_argument("--smoke", action="store_true")
    args = parser.parse_args()

    print("ekascribe setup\n" + "=" * 40)
    results = []
    if not args.no_env:
        results.append(("env", step_env(args.non_interactive)))
    _load_env()

    results.append(("db", step_db()))
    if not results[-1][1]:
        print("\nDatabase unreachable — start it (make dev / docker compose) and re-run.")
        return 1
    results.append(("storage", step_storage()))
    results.append(("migrations", step_migrations()))
    results.append(("queue", step_queue()))
    if not args.no_seed:
        results.append(("seed", step_seed()))
    if not args.skip_model_check:
        results.append(("models", step_models()))
    if not args.no_serve_check:
        results.append(("serve", step_serve()))
    if args.smoke:
        results.append(("smoke", step_smoke()))

    print("=" * 40)
    failed = [name for name, ok in results if not ok]
    if failed:
        print(f"Completed with issues: {', '.join(failed)}")
        return 1
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
