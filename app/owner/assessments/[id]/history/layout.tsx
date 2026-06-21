import { InstitutionPermissionLayout } from "@/components/owner/institution-permission-layout";

export default function AssessmentHistoryLayout({ children }: { children: React.ReactNode }) {
  return (
    <InstitutionPermissionLayout permission="assessment_authoring" path="/owner/assessments/history">
      {children}
    </InstitutionPermissionLayout>
  );
}
