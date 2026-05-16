-- Persist the original PDF filename confirmed by the student so the exam and
-- upload-only interfaces can show exactly which file was locked for a slot.

alter table public.upload_slots
  add column if not exists original_file_name text null
    check (original_file_name is null or length(original_file_name) <= 255);
