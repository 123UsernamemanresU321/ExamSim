export type StudentVisibleInvigilationMessage = {
  id: string;
  message_kind: "broadcast" | "private" | "system";
  sender_kind: "owner" | "student_guest" | "student_account" | "system";
  body: string;
  created_at: string;
  acknowledged_at: string | null;
};

export async function loadStudentVisibleMessages(
  admin: any,
  examSessionId: string,
  attemptId: string,
): Promise<StudentVisibleInvigilationMessage[]> {
  const [broadcasts, directMessages, receipts] = await Promise.all([
    admin
      .from("invigilation_messages")
      .select("id,message_kind,sender_kind,body,created_at")
      .eq("exam_session_id", examSessionId)
      .eq("message_kind", "broadcast")
      .eq("visible_to_student", true)
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("invigilation_messages")
      .select("id,message_kind,sender_kind,body,created_at")
      .eq("exam_session_id", examSessionId)
      .eq("attempt_id", attemptId)
      .eq("visible_to_student", true)
      .in("message_kind", ["private", "system"])
      .order("created_at", { ascending: false })
      .limit(20),
    admin
      .from("invigilation_message_receipts")
      .select("message_id,acknowledged_at")
      .eq("attempt_id", attemptId),
  ]);
  if (broadcasts.error) throw broadcasts.error;
  if (directMessages.error) throw directMessages.error;
  if (receipts.error && !isMissingReceiptTable(receipts.error)) throw receipts.error;
  const acknowledgedByMessage = new Map<string, string>();
  for (const receipt of receipts.data ?? []) {
    acknowledgedByMessage.set(String(receipt.message_id), String(receipt.acknowledged_at));
  }
  return [...(broadcasts.data ?? []), ...(directMessages.data ?? [])]
    .sort((a, b) => Date.parse(String(b.created_at)) - Date.parse(String(a.created_at)))
    .slice(0, 24)
    .map((message) => ({
      ...message,
      acknowledged_at: acknowledgedByMessage.get(String(message.id)) ?? null,
    })) as StudentVisibleInvigilationMessage[];
}

function isMissingReceiptTable(error: unknown) {
  const value = error as { code?: unknown };
  return value.code === "42P01" || value.code === "PGRST205";
}
