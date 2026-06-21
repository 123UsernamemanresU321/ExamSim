export function assertVersionMutable(status: string | null | undefined) {
  if (status !== "draft" && status !== "review_required") {
    throw new Error("Published versions are frozen. Create a new draft version before editing.");
  }
}
