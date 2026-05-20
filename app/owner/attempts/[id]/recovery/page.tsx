import { AlertTriangle, Clock, FileWarning, Wrench } from "lucide-react";
import { AttemptRecoveryControls } from "@/components/owner/attempt-recovery-controls";
import { SectionHeading } from "@/components/section-heading";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getAttemptRecoveryWorkspace } from "@/lib/usability-data";

export default async function AttemptRecoveryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getAttemptRecoveryWorkspace(id);
  if (!workspace.attempt) return <SectionHeading title="Attempt not found" description={id} />;
  const assessment = Array.isArray(workspace.attempt.assessments) ? workspace.attempt.assessments[0] : workspace.attempt.assessments;
  const student = Array.isArray(workspace.attempt.profiles) ? workspace.attempt.profiles[0] : workspace.attempt.profiles;
  return (
    <>
      <SectionHeading
        title="Attempt Recovery"
        description={`${assessment?.title ?? "Assessment"} · ${student?.display_name ?? "Student"}. Controlled repair actions are audit logged and never delete original evidence.`}
      />
      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <div className="grid gap-4">
          <Card>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><FileWarning size={18} /> Upload slots</h2>
            <div className="grid gap-3">
              {workspace.slots.map((slot) => (
                <div key={slot.id} className="rounded-md border border-[var(--border)] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">{slot.original_file_name ?? slot.question_node_id}</p>
                    <Badge tone={slot.status === "uploaded" ? "success" : slot.status === "missing" ? "warning" : "neutral"}>{slot.status}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">{slot.object_path ?? "No Storage object"} · {slot.uploaded_at ?? "not uploaded"}</p>
                </div>
              ))}
            </div>
          </Card>
          <Card>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><AlertTriangle size={18} /> Session signals</h2>
            <p className="text-sm text-[var(--muted)]">{workspace.events.length} telemetry events recorded. Heartbeat gaps, reloads, and upload failures should be handled here with incident notes or accommodations.</p>
          </Card>
        </div>
        <aside className="grid content-start gap-4">
          <AttemptRecoveryControls attemptId={id} />
          <Card>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><Clock size={18} /> Incidents</h2>
            {workspace.incidents.length === 0 ? <p className="text-sm text-[var(--muted)]">No incidents logged.</p> : workspace.incidents.map((incident) => (
              <div key={incident.id} className="border-t border-[var(--border)] py-3 first:border-t-0">
                <Badge tone={incident.severity === "high" ? "warning" : "neutral"}>{incident.incident_type}</Badge>
                <p className="mt-2 text-sm">{incident.description}</p>
              </div>
            ))}
          </Card>
          <Card>
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold"><Wrench size={18} /> Recovery actions</h2>
            {workspace.actions.length === 0 ? <p className="text-sm text-[var(--muted)]">No recovery actions yet. Use the `attempt-recovery` Edge Function for repair, extension, or resolution actions.</p> : workspace.actions.map((action) => (
              <p key={action.id} className="border-t border-[var(--border)] py-2 text-sm first:border-t-0">{action.action_type} · {new Date(action.created_at).toLocaleString()}</p>
            ))}
          </Card>
        </aside>
      </div>
    </>
  );
}
