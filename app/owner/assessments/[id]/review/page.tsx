import { ParseReviewClient } from "@/components/owner/parse-review-client";

export default function ParseReviewPage({ params }: { params: Promise<{ id: string }> }) {
  return <ParseReviewClient params={params} />;
}
