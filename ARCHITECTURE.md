# Architecture

```mermaid
flowchart TD
  Owner["Owner Browser"] --> Next["Next.js App Router"]
  Student["Student Browser"] --> Next
  Next --> SupabaseAuth["Supabase Auth"]
  Next --> RLS["Postgres with RLS"]
  Next --> Edge["Supabase Edge Functions"]
  Edge --> RLS
  Edge --> Storage["Private Supabase Storage"]
  Edge --> Token["HMAC State Token"]
  RLS --> Realtime["Realtime-ready attempt metadata"]
```

## State Machine

```mermaid
stateDiagram-v2
  [*] --> WAITING
  WAITING --> ACTIVE: server now >= start_at_utc
  ACTIVE --> UPLOAD_ONLY: solutions_requested and server now >= end_at_utc
  ACTIVE --> FINISHED_REVIEW: no upload grace
  UPLOAD_ONLY --> FINISHED_REVIEW: server now >= upload_deadline_at_utc
```

All stored times are UTC. The default display timezone is `Africa/Johannesburg`.

## Responsibilities

- Next.js renders the product shell, forms, dashboards, paper views, countdown display, and telemetry listeners.
- Supabase Auth authenticates owners and students.
- Postgres stores metadata, immutable assessment versions, attempts, responses, upload slots, and moderation reports.
- RLS protects metadata and prevents direct student reads of sensitive question/package tables.
- Edge Functions handle privileged workflows and recompute attempt state server-side.
- Private Storage stores source papers, normalized packages, answer uploads, and marking packets.

## Content Release Model

The waiting page renders metadata only. It does not request or preload the normalized package. `get-attempt-package` validates JWT ownership, recomputes state, validates a short-lived state token, and denies content during `WAITING`.

## Storage Strategy

- `assessment-sources`: original PDFs, LaTeX, and JSON imports.
- `assessment-packages`: immutable normalized packages and rendered assets.
- `answer-uploads`: one current student PDF per upload slot plus blank placeholders.
- `marking-packets`: optional owner-only generated bundles.

All buckets are private. Signed URLs are minted on demand by Edge Functions after server-side state checks.

## Edge Function List

`create-student`, `activate-student`, `ingest-assessment`, `update-question-tree`, `publish-assessment`, `get-attempt-state`, `start-attempt-session`, `get-attempt-package`, `issue-upload-slot-url`, `confirm-upload-slot`, `submit-blank-slot`, `save-text-response`, `finalize-attempt`, `record-attempt-event`, `summarize-attempt-report`, and `owner-download-marking-packet`.

