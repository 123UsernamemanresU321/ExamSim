"""RunPod-ready MinerU worker for Exam Vault.

The worker polls queued parse_jobs, signs private PDF source reads through
Supabase Storage, runs MinerU locally, uploads artifacts to private Storage, and
calls the complete-parse-job Edge Function.
"""

from __future__ import annotations

import json
import os
import subprocess
import time
from pathlib import Path
from typing import Any

import requests


SUPABASE_URL = os.environ["NEXT_PUBLIC_SUPABASE_URL"].rstrip("/")
SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
WORKER_SECRET = os.environ["MINERU_WORKER_SECRET"]
POLL_INTERVAL_SECONDS = int(os.environ.get("POLL_INTERVAL_SECONDS", "20"))
WORKDIR = Path(os.environ.get("MINERU_WORKDIR", "/tmp/exam-vault-mineru"))


def headers() -> dict[str, str]:
    return {
        "apikey": SERVICE_ROLE_KEY,
        "authorization": f"Bearer {SERVICE_ROLE_KEY}",
        "content-type": "application/json",
    }


def supabase_get(path: str, params: dict[str, str] | None = None) -> Any:
    response = requests.get(f"{SUPABASE_URL}{path}", headers=headers(), params=params, timeout=30)
    response.raise_for_status()
    return response.json()


def supabase_patch(path: str, body: dict[str, Any]) -> Any:
    response = requests.patch(f"{SUPABASE_URL}{path}", headers={**headers(), "prefer": "return=representation"}, json=body, timeout=30)
    response.raise_for_status()
    return response.json()


def sign_storage_url(bucket: str, object_path: str, expires_in: int = 300) -> str:
    response = requests.post(
        f"{SUPABASE_URL}/storage/v1/object/sign/{bucket}/{object_path}",
        headers=headers(),
        json={"expiresIn": expires_in},
        timeout=30,
    )
    response.raise_for_status()
    data = response.json()
    return f"{SUPABASE_URL}/storage/v1{data['signedURL']}"


def upload_storage(bucket: str, object_path: str, content: bytes, content_type: str) -> None:
    response = requests.post(
        f"{SUPABASE_URL}/storage/v1/object/{bucket}/{object_path}",
        headers={
            "apikey": SERVICE_ROLE_KEY,
            "authorization": f"Bearer {SERVICE_ROLE_KEY}",
            "content-type": content_type,
            "x-upsert": "false",
        },
        data=content,
        timeout=120,
    )
    response.raise_for_status()


def fetch_next_job() -> dict[str, Any] | None:
    rows = supabase_get(
        "/rest/v1/parse_jobs",
        {
            "select": "*",
            "parser": "eq.mineru",
            "status": "eq.queued",
            "order": "created_at.asc",
            "limit": "1",
        },
    )
    if not rows:
        return None
    job = rows[0]
    updated = supabase_patch(
        f"/rest/v1/parse_jobs?id=eq.{job['id']}",
        {"status": "running", "started_at": now_iso()},
    )
    return updated[0] if updated else job


def run_mineru(source_pdf: Path, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    model_source = os.environ.get("MINERU_MODEL_SOURCE")
    command = ["mineru", "-p", str(source_pdf), "-o", str(output_dir), "--formula", "--table", "--ocr"]
    if model_source:
        command.extend(["--model-source", model_source])
    subprocess.run(command, check=True)


def upload_artifacts(job: dict[str, Any], output_dir: Path) -> tuple[str, list[dict[str, str]]]:
    artifact_rows: list[dict[str, str]] = []
    result_json_path = ""
    for path in output_dir.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(output_dir).as_posix()
        object_path = f"parse-jobs/{job['id']}/{rel}"
        suffix = path.suffix.lower()
        content_type = {
            ".json": "application/json",
            ".md": "text/markdown",
            ".html": "text/html",
            ".txt": "text/plain",
        }.get(suffix, "application/octet-stream")
        upload_storage("assessment-packages", object_path, path.read_bytes(), content_type)
        kind = "json" if suffix == ".json" else "markdown" if suffix == ".md" else "html" if suffix == ".html" else "layout"
        artifact_rows.append({"artifact_kind": kind, "object_path": object_path})
        if suffix == ".json" and not result_json_path:
            result_json_path = object_path
    if not result_json_path:
        fallback = output_dir / "mineru-summary.json"
        fallback.write_text(json.dumps({"parse_job_id": job["id"], "message": "MinerU completed without a primary JSON artifact."}), encoding="utf-8")
        result_json_path = f"parse-jobs/{job['id']}/mineru-summary.json"
        upload_storage("assessment-packages", result_json_path, fallback.read_bytes(), "application/json")
        artifact_rows.append({"artifact_kind": "json", "object_path": result_json_path})
    return result_json_path, artifact_rows


def complete_job(job_id: str, ok: bool, result_object_path: str | None, artifacts: list[dict[str, str]], error: str | None = None) -> None:
    response = requests.post(
        f"{SUPABASE_URL}/functions/v1/complete-parse-job",
        headers={"content-type": "application/json", "x-mineru-worker-secret": WORKER_SECRET},
        json={
            "parse_job_id": job_id,
            "ok": ok,
            "result_object_path": result_object_path,
            "error_message": error,
            "artifacts": artifacts,
        },
        timeout=60,
    )
    response.raise_for_status()


def process_job(job: dict[str, Any]) -> None:
    job_dir = WORKDIR / job["id"]
    source_pdf = job_dir / "source.pdf"
    output_dir = job_dir / "out"
    job_dir.mkdir(parents=True, exist_ok=True)
    signed_url = sign_storage_url("assessment-sources", job["source_object_path"])
    source_pdf.write_bytes(requests.get(signed_url, timeout=120).content)
    try:
        run_mineru(source_pdf, output_dir)
        result_path, artifacts = upload_artifacts(job, output_dir)
        complete_job(job["id"], True, result_path, artifacts)
    except Exception as exc:  # noqa: BLE001
        log_path = f"parse-jobs/{job['id']}/worker-error.txt"
        upload_storage("assessment-packages", log_path, str(exc).encode("utf-8"), "text/plain")
        complete_job(job["id"], False, None, [{"artifact_kind": "log", "object_path": log_path}], str(exc))
        raise


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def main() -> None:
    WORKDIR.mkdir(parents=True, exist_ok=True)
    while True:
        job = fetch_next_job()
        if job:
            process_job(job)
        else:
            time.sleep(POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()
