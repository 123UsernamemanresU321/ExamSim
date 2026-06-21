import { InstitutionPermissionLayout } from "@/components/owner/institution-permission-layout";
export default function Layout({ children }: { children: React.ReactNode }) { return <InstitutionPermissionLayout permission="marking" path="/owner/attempts/mark">{children}</InstitutionPermissionLayout>; }
