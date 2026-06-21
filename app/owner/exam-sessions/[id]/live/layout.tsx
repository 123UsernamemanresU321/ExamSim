import { InstitutionPermissionLayout } from "@/components/owner/institution-permission-layout";
export default function Layout({ children }: { children: React.ReactNode }) { return <InstitutionPermissionLayout permission="invigilation" path="/owner/exam-sessions/live">{children}</InstitutionPermissionLayout>; }
