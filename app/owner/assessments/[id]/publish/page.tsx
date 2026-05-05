import { SectionHeading } from "@/components/section-heading";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/form";
import { DEFAULT_TIMEZONE } from "@/lib/constants";
import { sampleStudents } from "@/lib/demo-data";

export default async function PublishAssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <SectionHeading
        title="Publish and assign"
        description={`Publish assessment ${id}. The server converts local start time to UTC and creates attempts.`}
      />
      <Card>
        <form className="grid gap-4">
          <Field label="Start time in Africa/Johannesburg">
            <Input type="datetime-local" />
          </Field>
          <Field label="Duration seconds">
            <Input type="number" defaultValue={7200} />
          </Field>
          <Field label="Display timezone">
            <Input defaultValue={DEFAULT_TIMEZONE} />
          </Field>
          <Field label="Assign students">
            <div className="grid gap-2">
              {sampleStudents.map((student) => (
                <label key={student.id} className="flex items-center gap-3 rounded-md border border-[var(--border)] bg-white p-3">
                  <input type="checkbox" defaultChecked={student.id === "student_02"} />
                  <span>{student.display_name}</span>
                </label>
              ))}
            </div>
          </Field>
          <Button type="button">Publish immutable version</Button>
        </form>
      </Card>
    </>
  );
}
