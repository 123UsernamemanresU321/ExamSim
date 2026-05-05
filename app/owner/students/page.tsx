import { UserPlus } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { sampleStudents } from "@/lib/demo-data";

export default function OwnerStudentsPage() {
  return (
    <>
      <SectionHeading
        title="Students"
        description="Owner-created student accounts use login codes and one-time activation codes."
      />
      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <h2 className="mb-4 text-lg font-semibold">Create student</h2>
          <form className="grid gap-4">
            <Field label="Display name">
              <Input placeholder="Student name" />
            </Field>
            <Button type="button">
              <UserPlus size={16} aria-hidden="true" />
              Generate login and activation code
            </Button>
          </form>
        </Card>
        <div className="grid gap-3">
          {sampleStudents.map((student) => (
            <Card key={student.id} className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-semibold">{student.display_name}</h2>
                <p className="text-sm text-[var(--muted)]">{student.login_code}</p>
              </div>
              <p className="text-sm text-[var(--muted)]">
                {student.activated_at ? "Activated" : "Pending activation"}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
