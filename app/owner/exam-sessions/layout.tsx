import { InstitutionAnyPermissionLayout } from "@/components/owner/institution-permission-layout";
export default function Layout({ children }: { children: React.ReactNode }) { return <InstitutionAnyPermissionLayout permissions={["session_publishing", "invigilation", "student_management"]} path="/owner/exam-sessions">{children}</InstitutionAnyPermissionLayout>; }
