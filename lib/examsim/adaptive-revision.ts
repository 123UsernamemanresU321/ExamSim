export type RevisionWeakness = { key: string; kind: "topic" | "standard"; lossRatio: number };
export type RevisionCandidate = {
  id: string;
  tags: string[];
  curriculum_standard_ids: string[];
  estimated_difficulty: number | null;
  readiness_status: string;
  do_not_reuse: boolean;
};

export function rankRevisionCandidates({ weaknesses, candidates, limit = 12 }: { weaknesses: RevisionWeakness[]; candidates: RevisionCandidate[]; limit?: number }) {
  const normalizedWeaknesses = weaknesses
    .filter((weakness) => weakness.key.trim() && weakness.lossRatio > 0)
    .map((weakness) => ({ ...weakness, normalizedKey: weakness.key.trim().toLowerCase() }));
  return candidates
    .filter((candidate) => candidate.readiness_status === "ready" && !candidate.do_not_reuse)
    .map((candidate) => {
      const tags = candidate.tags.map((tag) => tag.trim().toLowerCase());
      const standards = candidate.curriculum_standard_ids.map((standard) => standard.trim().toLowerCase());
      const matches = normalizedWeaknesses.filter((weakness) => weakness.kind === "topic" ? tags.includes(weakness.normalizedKey) : standards.includes(weakness.normalizedKey));
      const matchScore = matches.reduce((sum, match) => sum + Math.min(1, match.lossRatio), 0);
      const difficultyFit = candidate.estimated_difficulty == null ? 0 : Math.max(0, 1 - Math.abs(candidate.estimated_difficulty - 0.55));
      return {
        ...candidate,
        score: matchScore * 10 + difficultyFit,
        reason: matches.length ? `Targets ${matches.map((match) => match.key).join(", ")}` : "",
        priority: matches.some((match) => match.lossRatio >= 0.65) ? "high" as const : "medium" as const,
      };
    })
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, Math.max(1, Math.min(30, limit)));
}
