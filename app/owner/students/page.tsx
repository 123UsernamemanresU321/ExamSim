import { CreateStudentForm } from "@/components/owner/create-student-form";
import { SectionHeading } from "@/components/section-heading";
import { Card } from "@/components/ui/card";
import { listOwnerStudents } from "@/lib/live-data";

export default async function OwnerStudentsPage() {
  const students = await listOwnerStudents();
  return (
    <>
      <SectionHeading
        title="Students"
        description="Owner-created student accounts use login codes and one-time activation codes."
      />
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <h2 className="mb-4 text-lg font-semibold">Create student</h2>
          <CreateStudentForm />
        </Card>
        <div className="grid gap-3">
          {students.length === 0 ? (
            <Card>
              <p className="text-sm text-[var(--muted)]">No students yet.</p>
            </Card>
          ) : (
            students.map((student) => (
              <Card key={student.id} className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="font-semibold">{student.display_name}</h2>
                  <p className="text-sm text-[var(--muted)]">{student.login_code}</p>
                </div>
                <p className="text-sm text-[var(--muted)]">
                  {student.activated_at ? "Activated" : "Pending activation"}
                </p>
              </Card>
            ))
          )}
        </div>
      </div>
    </>
  );
}
