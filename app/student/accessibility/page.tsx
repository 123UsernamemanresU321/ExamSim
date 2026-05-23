import { SectionHeading } from "@/components/section-heading";
import { AccessibilityPreferencesPanel } from "@/components/student/student-experience-panels";
import { requireAppRole } from "@/lib/auth/server";
import { getStudentSettingsData } from "@/lib/student-experience";

export default async function StudentAccessibilityPage() {
  const profile = await requireAppRole("student", "/student/accessibility");
  const data = await getStudentSettingsData(profile?.id ?? "");
  return (
    <>
      <SectionHeading title="Accessibility Settings" description="Adjust readability, low-bandwidth behavior, contrast, motion, and timer display preferences for student pages." />
      <AccessibilityPreferencesPanel performance={data.performancePreferences} />
    </>
  );
}
