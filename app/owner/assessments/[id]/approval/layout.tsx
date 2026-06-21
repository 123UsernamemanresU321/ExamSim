import { InstitutionPermissionLayout } from "@/components/owner/institution-permission-layout";

export default function AssessmentApprovalLayout({ children }: { children: React.ReactNode }) {
  return (
    <InstitutionPermissionLayout permission="moderation" path="/owner/assessments/approval">
      {children}
    </InstitutionPermissionLayout>
  );
}
