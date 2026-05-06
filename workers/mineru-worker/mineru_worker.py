"""Self-hosted MinerU worker scaffold for Exam Vault.

This script intentionally leaves queue polling and Storage upload wiring explicit
so deployments can choose Docker, a VM, or a private job runner without changing
Exam Vault's security boundary.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
from pathlib import Path
from urllib.request import Request, urlopen


def run_mineru(source_pdf: Path, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["mineru", "-p", str(source_pdf), "-o", str(output_dir), "--formula", "--table", "--ocr"],
        check=True,
    )


def complete_job(function_url: str, worker_secret: str, parse_job_id: str, ok: bool, result_object_path: str, error: str | None) -> None:
    body = json.dumps(
        {
            "parse_job_id": parse_job_id,
            "ok": ok,
            "result_object_path": result_object_path if ok else None,
            "error_message": error,
            "artifacts": [
                {
                    "artifact_kind": "log",
                    "object_path": f"parse-jobs/{parse_job_id}/worker-log.txt",
                    "content_preview": "MinerU worker completed; upload artifacts before enabling this callback in production.",
                }
            ],
        }
    ).encode("utf-8")
    request = Request(
        function_url,
        data=body,
        method="POST",
        headers={
            "content-type": "application/json",
            "x-mineru-worker-secret": worker_secret,
        },
    )
    with urlopen(request, timeout=30) as response:
        response.read()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--parse-job-id", required=True)
    parser.add_argument("--signed-source-url", required=True)
    parser.add_argument("--complete-function-url", required=True)
    parser.add_argument("--result-object-path", required=True)
    parser.add_argument("--workdir", default="./mineru-work")
    args = parser.parse_args()

    worker_secret = os.environ["MINERU_WORKER_SECRET"]
    workdir = Path(args.workdir)
    workdir.mkdir(parents=True, exist_ok=True)
    source_pdf = workdir / f"{args.parse_job_id}.pdf"

    try:
      with urlopen(args.signed_source_url, timeout=60) as response:
          source_pdf.write_bytes(response.read())
      run_mineru(source_pdf, workdir / args.parse_job_id)
      complete_job(args.complete_function_url, worker_secret, args.parse_job_id, True, args.result_object_path, None)
    except Exception as exc:  # noqa: BLE001
      complete_job(args.complete_function_url, worker_secret, args.parse_job_id, False, "", str(exc))
      raise


if __name__ == "__main__":
    main()
