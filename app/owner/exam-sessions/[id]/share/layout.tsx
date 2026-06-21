import { InstitutionPermissionLayout } from "@/components/owner/institution-permission-layout";
export default function Layout({ children }: { children: React.ReactNode }) { return <InstitutionPermissionLayout permission="session_publishing" path="/owner/exam-sessions/share">{children}</InstitutionPermissionLayout>; }
