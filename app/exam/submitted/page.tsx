import { GuestExamWorkspace } from "@/components/exam/guest-exam-workspace";

export default function GuestSubmittedPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-10">
      <GuestExamWorkspace mode="submitted" />
    </main>
  );
}
