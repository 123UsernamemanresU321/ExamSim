"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { invokeEdgeFunction } from "@/lib/supabase/functions-client";
import type { CommentBankItem } from "@/types/database";

export function CommentBankManager({ items }: { items: CommentBankItem[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function submit(formData: FormData) {
    setBusyId("new");
    try {
      const supabase = createSupabaseBrowserClient();
      await invokeEdgeFunction(supabase, "comment-bank", {
        body: {
          action: "upsert",
          label: String(formData.get("label") ?? ""),
          comment_text: String(formData.get("comment_text") ?? ""),
          category: emptyToNull(formData.get("category")),
          subject: emptyToNull(formData.get("subject")),
          tags: String(formData.get("tags") ?? "")
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          is_student_facing_default: formData.get("student_facing") === "on",
        },
        requiresAal2: true,
      });
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not save snippet.");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteItem(id: string) {
    if (!confirm("Delete this reusable feedback snippet?")) return;
    setBusyId(id);
    try {
      const supabase = createSupabaseBrowserClient();
      await invokeEdgeFunction(supabase, "comment-bank", {
        body: { action: "delete", id },
        requiresAal2: true,
      });
      router.refresh();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Could not delete snippet.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_1fr]">
      <form action={submit} className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm">
        <div className="mb-5">
          <h2 className="text-sm font-black uppercase tracking-widest text-[var(--ink)]">New snippet</h2>
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
            Snippets can be inserted into private marker notes or student-facing feedback while marking.
          </p>
        </div>
        <div className="grid gap-4">
          <Field label="Label">
            <Input name="label" placeholder="Correct method, arithmetic error" required />
          </Field>
          <Field label="Comment text">
            <Textarea name="comment_text" placeholder="Your method is sound, but an arithmetic slip changes the final answer." required />
          </Field>
          <Field label="Category">
            <Input name="category" placeholder="Method" />
          </Field>
          <Field label="Subject">
            <Input name="subject" placeholder="Mathematics" />
          </Field>
          <Field label="Tags">
            <Input name="tags" placeholder="algebra, arithmetic, feedback" />
          </Field>
          <label className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
            <input name="student_facing" type="checkbox" defaultChecked />
            Student-facing by default
          </label>
          <Button type="submit" className="gap-2 text-white" disabled={busyId === "new"}>
            <Plus size={16} />
            Add snippet
          </Button>
        </div>
      </form>

      <section className="grid gap-3">
        {items.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[var(--border)] bg-white p-8 text-sm text-[var(--muted)]">
            No snippets yet. Add your common feedback comments here.
          </div>
        ) : (
          items.map((item) => (
            <article key={item.id} className="rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-[var(--ink)]">{item.label}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.comment_text}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.subject ? <Badge tone="neutral">{item.subject}</Badge> : null}
                    {item.category ? <Badge tone="neutral">{item.category}</Badge> : null}
                    {item.tags.map((tag) => <Badge key={tag} tone="accent">{tag}</Badge>)}
                    <Badge tone="neutral">used {item.usage_count}</Badge>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="gap-2 text-red-700 hover:bg-red-600 hover:text-white"
                  disabled={busyId === item.id}
                  onClick={() => deleteItem(item.id)}
                >
                  <Trash2 size={14} />
                  Delete
                </Button>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}

function emptyToNull(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}
