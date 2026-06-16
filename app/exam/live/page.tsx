import { GuestExamWorkspace } from "@/components/exam/guest-exam-workspace";

export default function GuestExamLivePage() {
  return (
    <main className="min-h-screen bg-[var(--background)] p-4">
      <GuestExamWorkspace mode="live" />
    </main>
  );
}
