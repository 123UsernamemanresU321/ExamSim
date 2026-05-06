export type MarkingPacketInput = {
  attemptId: string;
  uploadSlots: { question_node_id?: string | null; object_path?: string | null; status?: string | null }[];
  typedResponses: { question_node_id?: string | null; answer_text?: string | null }[];
  marks: { awarded_marks?: number | string | null }[];
};

export type MarkingPacketManifest = {
  attemptId: string;
  files: string[];
  uploadObjectPaths: string[];
  totalAwardedMarks: number;
};

export function buildMarkingPacketManifest(input: MarkingPacketInput): MarkingPacketManifest {
  const uploadObjectPaths = input.uploadSlots.map((slot) => slot.object_path).filter((path): path is string => Boolean(path));
  return {
    attemptId: input.attemptId,
    uploadObjectPaths,
    totalAwardedMarks: input.marks.reduce((total, mark) => total + Number(mark.awarded_marks || 0), 0),
    files: [
      "manifest.json",
      "assessment-package.json",
      "question-tree.json",
      "typed-responses.json",
      "upload-slots.json",
      "moderation-report.json",
      "marks.json",
      "annotations.json",
      "feedback-release.json",
      "audit.json",
    ],
  };
}
