import { SectionHeading } from "@/components/section-heading";
import { StudentFeedbackPreview } from "@/components/student/student-experience-panels";
import { requireAppRole } from "@/lib/auth/server";
import { listStudentFeedbackCards } from "@/lib/student-experience";

export default async function StudentFeedbackInboxPage() {
  const profile = await requireAppRole("student", "/student/feedback");
  const feedback = await listStudentFeedbackCards(profile?.id ?? "");
  return (
    <>
      <SectionHeading title="Feedback Inbox" description="Released feedback across attempts. Private marker notes and unreleased annotations are never shown here." />
      <StudentFeedbackPreview feedback={feedback} />
    </>
  );
}
