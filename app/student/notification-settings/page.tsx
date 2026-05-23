import { SectionHeading } from "@/components/section-heading";
import { BrowserNotificationPermissionCard } from "@/components/student/student-interactive-panels";
import { NotificationPreferencesPanel } from "@/components/student/student-experience-panels";
import { requireAppRole } from "@/lib/auth/server";
import { getStudentSettingsData } from "@/lib/student-experience";

export default async function StudentNotificationSettingsPage() {
  const profile = await requireAppRole("student", "/student/notification-settings");
  const data = await getStudentSettingsData(profile?.id ?? "");
  return (
    <>
      <SectionHeading title="Notification Settings" description="Control in-app reminders and optional browser notification behavior." />
      <div className="grid gap-5 xl:grid-cols-2">
        <BrowserNotificationPermissionCard />
        <NotificationPreferencesPanel preferences={data.notificationPreferences} />
      </div>
    </>
  );
}
