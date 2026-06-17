import { ClipboardList, Hash, Info } from "lucide-react";
import { createRosterEntryAction, generateRosterEntriesAction } from "@/app/owner/students/actions";
import { CreateStudentGroupForm } from "@/components/owner/create-student-group-form";
import { CreateStudentForm } from "@/components/owner/create-student-form";
import { SectionHeading } from "@/components/section-heading";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, DataTableCell, DataTableRow } from "@/components/ui/data-list";
import { listOwnerRosterEntries, listOwnerStudentGroups, listOwnerStudents } from "@/lib/live-data";

export default async function OwnerStudentsPage() {
  const [students, groups, rosterEntries] = await Promise.all([listOwnerStudents(), listOwnerStudentGroups(), listOwnerRosterEntries()]);
  const duplicateNumbers = findDuplicates(rosterEntries.map((entry) => entry.student_number));
  return (
    <>
      <SectionHeading
        title="Students"
        description="Manage optional student accounts and the roster student numbers used during exam-code entry."
      />
      <Card className="mb-6 border-blue-100 bg-blue-50/40">
        <div className="flex gap-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-[4px] bg-white text-blue-700">
            <Info size={18} />
          </span>
          <div>
            <h2 className="text-base font-semibold text-[var(--ink)]">Exam code and student number are different</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              The exam code opens one specific exam session. A student number, such as <code>DP1-007</code> or <code>E001</code>,
              identifies the student on your roster across exams. It is not a password and should not be treated as a secure login credential.
            </p>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
              Student numbers identify students during exam-code entry. They are not passwords.
            </p>
            <ol className="mt-3 grid gap-1 text-sm text-[var(--muted)] md:grid-cols-5">
              <li>1. Add students</li>
              <li>2. Give each student a number</li>
              <li>3. Publish an exam session</li>
              <li>4. Give students the exam code</li>
              <li>5. Students enter both details</li>
            </ol>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="grid content-start gap-5">
          <Card>
            <h2 className="mb-2 text-lg font-semibold text-[var(--ink)]">Optional results account</h2>
            <p className="mb-4 text-sm leading-6 text-[var(--muted)]">
              Student accounts are for viewing marked papers, feedback, history, and results. They are separate from exam-code entry.
            </p>
            <CreateStudentForm />
          </Card>
          <Card>
            <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-[var(--ink)]"><Hash size={18} /> Add roster student number</h2>
            <p className="mb-4 text-sm leading-6 text-[var(--muted)]">Use these numbers for exam-code entry. They can be assigned before students create accounts.</p>
            <form action={createRosterEntryAction} className="grid gap-3">
              <input name="display_name" required placeholder="Student name" className="min-h-10 rounded-[2px] border border-[var(--border)] bg-white px-3 text-sm" />
              <div className="grid gap-3 sm:grid-cols-2">
                <input name="student_number" required placeholder="DP1-007" className="min-h-10 rounded-[2px] border border-[var(--border)] bg-white px-3 font-mono text-sm uppercase" />
                <input name="class_group" placeholder="DP1 / Group A" className="min-h-10 rounded-[2px] border border-[var(--border)] bg-white px-3 text-sm" />
              </div>
              <input name="email" type="email" placeholder="Optional email" className="min-h-10 rounded-[2px] border border-[var(--border)] bg-white px-3 text-sm" />
              <Button type="submit" variant="secondary">Add roster entry</Button>
            </form>
          </Card>
          <Card>
            <h2 className="mb-2 text-lg font-semibold text-[var(--ink)]">Generate Student Numbers</h2>
            <p className="mb-4 text-sm leading-6 text-[var(--muted)]">Create memorable placeholders such as DP1-001, MYP5-001, G11-001, or E001. Edit names after assigning them.</p>
            <form action={generateRosterEntriesAction} className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <input name="prefix" required placeholder="DP1" className="min-h-10 rounded-[2px] border border-[var(--border)] bg-white px-3 font-mono text-sm uppercase" />
                <input name="first_ordinal" type="number" min="1" defaultValue="1" className="min-h-10 rounded-[2px] border border-[var(--border)] bg-white px-3 text-sm" />
                <input name="count" type="number" min="1" max="200" defaultValue="25" className="min-h-10 rounded-[2px] border border-[var(--border)] bg-white px-3 text-sm" />
              </div>
              <input name="class_group" placeholder="Optional class/group for all generated numbers" className="min-h-10 rounded-[2px] border border-[var(--border)] bg-white px-3 text-sm" />
              <Button type="submit" variant="secondary">Auto-generate roster numbers</Button>
            </form>
          </Card>
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-[var(--ink)]">Create group</h2>
            <CreateStudentGroupForm students={students} />
          </Card>
        </div>
        <div className="grid gap-5">
          <Card>
            <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold text-[var(--ink)]"><ClipboardList size={18} /> Student instruction block</h2>
            <div className="rounded-[4px] border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-sm leading-6 text-[var(--ink)]">
              <p className="font-semibold">For students:</p>
              <p>1. Go to the Exam Vault exam entry page.</p>
              <p>2. Enter the exam code from your teacher.</p>
              <p>3. Enter your student number and full name. Your student number is not a password.</p>
              <p>4. If your number is rejected, check the number with your teacher before starting.</p>
            </div>
          </Card>
          <Card>
            <h2 className="mb-4 text-lg font-semibold text-[var(--ink)]">Roster student numbers</h2>
            {duplicateNumbers.length ? (
              <div className="mb-4 rounded-[4px] border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                Duplicate student numbers detected: {duplicateNumbers.join(", ")}. Resolve these before publishing roster-match sessions.
              </div>
            ) : null}
            {rosterEntries.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No roster student numbers yet. Add one manually or auto-generate placeholders.</p>
            ) : (
              <DataTable headers={["Student number", "Student", "Class/group", "Status"]} className="shadow-none">
                {rosterEntries.map((entry) => (
                  <DataTableRow key={entry.id}>
                    <DataTableCell className="font-mono text-xs font-semibold text-[var(--ink)]">{entry.student_number}</DataTableCell>
                    <DataTableCell>
                      <p className="font-semibold text-[var(--ink)]">{entry.display_name}</p>
                      <p className="text-xs text-[var(--muted)]">{entry.email ?? "No email"}</p>
                    </DataTableCell>
                    <DataTableCell className="text-[var(--muted)]">{entry.class_group ?? "No group"}</DataTableCell>
                    <DataTableCell><Badge tone={entry.active ? "success" : "neutral"}>{entry.active ? "Active" : "Inactive"}</Badge></DataTableCell>
                  </DataTableRow>
                ))}
              </DataTable>
            )}
          </Card>
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

function findDuplicates(values: string[]) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates];
}
