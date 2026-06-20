import { InstitutionPermissionLayout } from "@/components/owner/institution-permission-layout";
export default function Layout({ children }: { children: React.ReactNode }) { return <InstitutionPermissionLayout permission="readiness_security" path="/owner/security">{children}</InstitutionPermissionLayout>; }
