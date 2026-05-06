import type { AppRole } from "@/lib/constants";

export function dashboardPathForRole(role: AppRole) {
  return role === "owner" ? "/owner" : "/student";
}

export function postLoginRedirectForRole(role: AppRole, nextPath?: string | null) {
  if (nextPath && nextPath.startsWith("/") && !nextPath.startsWith("//")) {
    if (role === "owner" && nextPath.startsWith("/owner")) return nextPath;
    if (role === "student" && nextPath.startsWith("/student")) return nextPath;
  }

  return dashboardPathForRole(role);
}
