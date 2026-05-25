import { LayoutDashboard, LogIn, UserCircle } from "lucide-react";
import Link from "next/link";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { ButtonLink } from "@/components/ui/button";
import { getCurrentUserProfile } from "@/lib/auth/server";

export async function AuthAwareHeaderNav() {
  const { user, profile } = await getCurrentUserProfile();

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <ButtonLink href="/login" variant="secondary">
          <LogIn size={16} aria-hidden="true" />
          Log in
        </ButtonLink>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex items-center gap-2 sm:gap-3">
        <ButtonLink href="/login" variant="secondary">
          <span className="hidden sm:inline">Continue setup</span>
          <span className="sm:hidden">Setup</span>
        </ButtonLink>
        <AccountSummary label={user.email ?? "Signed in"} role="Account setup needed" dashboardHref={null} />
      </div>
    );
  }

  const isOwner = profile.app_role === "owner";
  const dashboardHref = isOwner ? "/owner" : "/student/command-center";
  const dashboardLabel = isOwner ? "Go to Owner Dashboard" : "Go to Student Command Center";
  const roleLabel = isOwner ? "Owner" : "Student";

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <ButtonLink href={dashboardHref} variant="secondary">
        <LayoutDashboard size={16} aria-hidden="true" />
        <span className="hidden lg:inline">{dashboardLabel}</span>
        <span className="lg:hidden">Dashboard</span>
      </ButtonLink>
      <AccountSummary label={profile.display_name || profile.email || "Signed in"} role={roleLabel} dashboardHref={dashboardHref} />
    </div>
  );
}

function AccountSummary({ label, role, dashboardHref }: { label: string; role: string; dashboardHref: string | null }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm sm:gap-3 sm:px-3">
      <UserCircle size={18} aria-hidden="true" className="text-[var(--primary)]" />
      <div className="hidden min-w-0 sm:block">
        <p className="max-w-44 truncate font-semibold text-[var(--ink)]">{label}</p>
        <p className="text-xs text-[var(--muted)]">{role}</p>
      </div>
      {dashboardHref ? (
        <Link className="hidden text-xs font-bold text-[var(--primary)] sm:inline" href={dashboardHref}>
          Dashboard
        </Link>
      ) : null}
      <SignOutButton />
    </div>
  );
}
