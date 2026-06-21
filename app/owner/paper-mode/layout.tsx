import { InstitutionAnyPermissionLayout } from "@/components/owner/institution-permission-layout";
export default function Layout({ children }: { children: React.ReactNode }) {
  return <InstitutionAnyPermissionLayout permissions={["assessment_authoring", "marking"]} path="/owner/paper-mode">{children}</InstitutionAnyPermissionLayout>;
}
