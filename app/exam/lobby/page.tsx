import { GuestExamWorkspace } from "@/components/exam/guest-exam-workspace";

export default function GuestExamLobbyPage() {
  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-10">
      <GuestExamWorkspace mode="lobby" />
    </main>
  );
}
