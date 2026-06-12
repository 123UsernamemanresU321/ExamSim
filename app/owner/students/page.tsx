import { CreateStudentGroupForm } from "@/components/owner/create-student-group-form";
import { CreateStudentForm } from "@/components/owner/create-student-form";
import { SectionHeading } from "@/components/section-heading";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataList, DataListRow } from "@/components/ui/data-list";
import { listOwnerStudentGroups, listOwnerStudents } from "@/lib/live-data";

export default async function OwnerStudentsPage() {
  const [students, groups] = await Promise.all([listOwnerStudents(), listOwnerStudentGroups()]);
  return (
    <>
      <SectionHeading
        title="Students"
        description="Owner-created student accounts use login codes and one-time activation codes."
      />
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="grid content-start gap-5">
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-[var(--ink)]">Create student</h2>
            <CreateStudentForm />
          </Card>
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-[var(--ink)]">Create group</h2>
            <CreateStudentGroupForm students={students} />
          </Card>
        </div>
        <div className="grid gap-5">
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-[var(--ink)]">Groups</h2>
            {groups.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No groups yet.</p>
            ) : (
              <DataList>
                {groups.map((group) => (
                  <DataListRow key={group.id} className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-[var(--ink)]">{group.name}</p>
                      {group.description && <p className="text-xs text-[var(--muted)] mt-0.5">{group.description}</p>}
                    </div>
                    <span className="text-xs font-semibold text-[var(--subtle)]">{group.member_count} member(s)</span>
                  </DataListRow>
                ))}
              </DataList>
            )}
          </Card>

          <Card>
            <h2 className="mb-4 text-lg font-semibold text-[var(--ink)]">Students</h2>
            {students.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No students yet.</p>
            ) : (
              <DataList>
                {students.map((student) => (
                  <DataListRow key={student.id} className="flex items-center justify-between gap-4">
                    <div>
                      <h2 className="font-semibold text-[var(--ink)]">{student.display_name}</h2>
                      <p className="text-xs text-[var(--muted)] mt-0.5">Login code: <span className="font-mono">{student.login_code}</span></p>
                    </div>
                    <Badge tone={student.activated_at ? "success" : "warning"}>
                      {student.activated_at ? "Activated" : "Pending"}
                    </Badge>
                  </DataListRow>
                ))}
              </DataList>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
