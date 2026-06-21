import { InstitutionPermissionLayout } from "@/components/owner/institution-permission-layout";

export default function CorrectionReviewLayout({ children }: { children: React.ReactNode }) {
  return <InstitutionPermissionLayout permission="marking" path="/owner/attempts/corrections">{children}</InstitutionPermissionLayout>;
}
