import { InstitutionPermissionLayout } from "@/components/owner/institution-permission-layout";
export default function Layout({ children }: { children: React.ReactNode }) { return <InstitutionPermissionLayout permission="moderation" path="/owner/marking-queue/moderation">{children}</InstitutionPermissionLayout>; }
