import { CreateStudentGroupForm } from "@/components/owner/create-student-group-form";
import { CreateStudentForm } from "@/components/owner/create-student-form";
import { SectionHeading } from "@/components/section-heading";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, DataTableCell, DataTableRow } from "@/components/ui/data-list";
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
              <DataTable headers={["Group", "Description", "Members"]} className="shadow-none">
                {groups.map((group) => (
                  <DataTableRow key={group.id}>
                    <DataTableCell className="font-semibold text-[var(--ink)]">{group.name}</DataTableCell>
                    <DataTableCell className="text-[var(--muted)]">{group.description ?? "No description"}</DataTableCell>
                    <DataTableCell className="font-mono text-xs text-[var(--subtle)]">{group.member_count}</DataTableCell>
                  </DataTableRow>
                ))}
              </DataTable>
            )}
          </Card>

          <Card>
            <h2 className="mb-4 text-lg font-semibold text-[var(--ink)]">Students</h2>
            {students.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No students yet.</p>
            ) : (
              <DataTable headers={["Student", "Login code", "Status"]} className="shadow-none">
                {students.map((student) => (
                  <DataTableRow key={student.id}>
                    <DataTableCell className="font-semibold text-[var(--ink)]">{student.display_name}</DataTableCell>
                    <DataTableCell className="font-mono text-xs text-[var(--muted)]">{student.login_code}</DataTableCell>
                    <DataTableCell>
                      <Badge tone={student.activated_at ? "success" : "warning"}>
                      {student.activated_at ? "Activated" : "Pending"}
                      </Badge>
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </DataTable>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
