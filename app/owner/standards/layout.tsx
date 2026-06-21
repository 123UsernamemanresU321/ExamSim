import { InstitutionAnyPermissionLayout } from "@/components/owner/institution-permission-layout";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <InstitutionAnyPermissionLayout permissions={["analytics", "assessment_authoring"]} path="/owner/standards">
      {children}
    </InstitutionAnyPermissionLayout>
  );
}
