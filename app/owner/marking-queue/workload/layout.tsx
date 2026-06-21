import { InstitutionPermissionLayout } from "@/components/owner/institution-permission-layout";

export default function MarkingWorkloadLayout({ children }: { children: React.ReactNode }) {
  return <InstitutionPermissionLayout permission="moderation" path="/owner/marking-queue/workload">{children}</InstitutionPermissionLayout>;
}
