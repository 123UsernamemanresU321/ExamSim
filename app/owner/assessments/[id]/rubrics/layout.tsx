import { InstitutionPermissionLayout } from "@/components/owner/institution-permission-layout";
export default function Layout({ children }: { children: React.ReactNode }) { return <InstitutionPermissionLayout permission="assessment_authoring" path="/owner/assessments/rubrics">{children}</InstitutionPermissionLayout>; }
