# MinerU Worker

Self-hosted parser worker for Exam Vault PDF/OCR ingestion.

The worker must run in infrastructure you control. It receives a queued `parse_jobs` row out-of-band, downloads the
private source PDF using a short-lived signed URL, runs MinerU locally, uploads Markdown/JSON artifacts to the private
`assessment-packages` bucket, and calls the `complete-parse-job` Edge Function with `x-mineru-worker-secret`.

Recommended RunPod deployment:

```bash
docker build -t exam-vault-mineru-worker .
docker run --gpus all \
  -e NEXT_PUBLIC_SUPABASE_URL=... \
  -e SUPABASE_SERVICE_ROLE_KEY=... \
  -e MINERU_WORKER_SECRET=... \
  -e MINERU_MODEL_SOURCE=huggingface \
  exam-vault-mineru-worker
```

The worker polls `parse_jobs` with `parser = mineru` and `status = queued`.

Production rules:

- Do not use public assessment URLs.
- Do not mark MinerU output as published or trusted.
- Always leave parsed PDF output as owner review-required.
- Store artifacts in private Storage only.
- Rotate `MINERU_WORKER_SECRET` if worker logs or host access may be compromised.
