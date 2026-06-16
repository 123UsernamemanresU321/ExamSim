import { CommentBankManager } from "@/components/owner/comment-bank-manager";
import { SectionHeading } from "@/components/section-heading";
import { listCommentBankItems } from "@/lib/usability-data";

export default async function CommentBankPage() {
  const items = await listCommentBankItems();
  return (
    <>
      <SectionHeading
        title="Rubrics / Feedback Library"
        description="Reusable rubrics, private notes, and student-facing feedback snippets for faster, more consistent marking."
      />
      <CommentBankManager items={items} />
    </>
  );
}
