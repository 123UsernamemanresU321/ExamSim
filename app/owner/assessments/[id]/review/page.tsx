import { demoAssessmentParams } from "@/lib/static-params";
import { ParseReviewClient } from "@/components/owner/parse-review-client";

export function generateStaticParams() {
  return demoAssessmentParams();
}

export default function ParseReviewPage({ params }: { params: Promise<{ id: string }> }) {
  return <ParseReviewClient params={params} />;
}
