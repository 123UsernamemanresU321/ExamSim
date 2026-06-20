import { InstitutionPermissionLayout } from "@/components/owner/institution-permission-layout";
export default function Layout({ children }: { children: React.ReactNode }) { return <InstitutionPermissionLayout permission="student_data" path="/owner/attempts">{children}</InstitutionPermissionLayout>; }
