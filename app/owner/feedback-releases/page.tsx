import { Eye, EyeOff } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listFeedbackReleaseControlRows } from "@/lib/usability-data";

export default async function FeedbackReleaseControlPage() {
  const rows = await listFeedbackReleaseControlRows();
  return (
    <>
      <SectionHeading
        title="Feedback Release Control"
        description="Separate marking completion from student visibility. Marks, comments, annotated PDFs, and moderation summaries can be released deliberately."
      />
      <div className="grid gap-3">
        {rows.length === 0 ? (
          <Card><p className="text-sm text-[var(--muted)]">No attempts are available for release.</p></Card>
        ) : rows.map(({ attempt, release }) => {
          const assessment = Array.isArray(attempt.assessments) ? attempt.assessments[0] : attempt.assessments;
          const student = Array.isArray(attempt.profiles) ? attempt.profiles[0] : attempt.profiles;
          return (
            <Card key={attempt.id} className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="mb-2 flex flex-wrap gap-2">
                  <Badge tone={release?.visible_to_student ? "success" : "neutral"}>
                    {release?.visible_to_student ? <Eye size={12} /> : <EyeOff size={12} />}
                    {release?.visible_to_student ? "Released" : "Draft"}
                  </Badge>
                  {release?.release_annotated_pdfs ? <Badge tone="accent">Annotated PDFs</Badge> : null}
                  {release?.release_comments ? <Badge tone="accent">Comments</Badge> : null}
                  {release?.release_marks ? <Badge tone="accent">Marks</Badge> : null}
                </div>
                <h2 className="font-semibold">{assessment?.title ?? "Assessment"}</h2>
                <p className="text-sm text-[var(--muted)]">{student?.display_name ?? "Student"} · {assessment?.paper_code ?? "No paper code"}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <ButtonLink href={`/owner/attempts/${attempt.id}/mark`}>Open release dialog</ButtonLink>
                <ButtonLink href={`/student/attempts/${attempt.id}/results`} variant="secondary">Preview student view</ButtonLink>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
