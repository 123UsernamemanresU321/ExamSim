import { submitStudentIncidentReport } from "@/app/student/student-actions";
import { SectionHeading } from "@/components/section-heading";
import { FinalizationChecklistPanel } from "@/components/student/student-experience-panels";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireAppRole } from "@/lib/auth/server";
import { getStudentFinalizeData } from "@/lib/student-experience";
import { getAttemptScreenData } from "@/lib/attempt-screen-data";

export default async function StudentFinalizePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await requireAppRole("student", `/student/attempts/${id}/finalize`);
  const data = await getStudentFinalizeData(profile?.id ?? "", id);
  const screenData = await getAttemptScreenData(id, false).catch(() => ({ stateToken: "" }));

  if (!data.attempt) {
    return <SectionHeading title="Attempt not found" description="Open the command center and choose an assigned attempt." />;
  }

  return (
    <>
      <SectionHeading title="Finalize Attempt" description="Review root-question uploads, blank submissions, failed transfers, and sanity warnings before finalizing." />
      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <FinalizationChecklistPanel 
          checklist={data.checklist} 
          attemptId={id} 
          stateToken={screenData.stateToken} 
        />
        <Card>
          <h2 className="text-lg font-semibold">Report an issue before finalizing</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">If an upload or device problem affected your submission, document it here before finalization.</p>
          <form action={submitStudentIncidentReport.bind(null, id)} className="mt-4 grid gap-3">
            <input type="hidden" name="reported_from" value="finalization" />
            <label className="grid gap-1 text-sm font-semibold">
              Issue type
              <select name="incident_type" className="rounded-md border border-[var(--border)] bg-white px-3 py-2">
                <option value="upload_problem">Upload problem</option>
                <option value="wrong_file_uploaded">Wrong file uploaded</option>
                <option value="internet_issue">Internet issue</option>
                <option value="browser_crash">Browser crash</option>
                <option value="scanner_camera_issue">Scanner/camera issue</option>
                <option value="medical_issue">Medical issue</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Description
              <textarea name="description" required className="min-h-28 rounded-md border border-[var(--border)] px-3 py-2" />
            </label>
            <button type="submit" className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-semibold !text-white">Submit incident report</button>
          </form>
          <div className="mt-4 flex flex-wrap gap-3">
            <ButtonLink href={`/student/attempts/${id}/recovery-status`} variant="secondary">Recovery status</ButtonLink>
            <ButtonLink href={`/student/attempts/${id}/receipt`} variant="secondary">Receipt</ButtonLink>
          </div>
        </Card>
      </div>
    </>
  );
}
