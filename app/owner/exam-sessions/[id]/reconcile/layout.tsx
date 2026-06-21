import { InstitutionPermissionLayout } from "@/components/owner/institution-permission-layout";
export default function Layout({ children }: { children: React.ReactNode }) { return <InstitutionPermissionLayout permission="student_management" path="/owner/exam-sessions/reconcile">{children}</InstitutionPermissionLayout>; }
