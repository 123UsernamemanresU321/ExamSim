import { InstitutionPermissionLayout } from "@/components/owner/institution-permission-layout";
export default function Layout({ children }: { children: React.ReactNode }) { return <InstitutionPermissionLayout permission="exports" path="/owner/export-hub">{children}</InstitutionPermissionLayout>; }
