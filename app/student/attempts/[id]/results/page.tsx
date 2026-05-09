import { demoAttemptParams } from "@/lib/static-params";
import { StudentResultsClient } from "@/components/student/student-results-client";

export function generateStaticParams() {
  return demoAttemptParams();
}

/**
 * Server Wrapper for Student Results Page.
 * This is a Server Component to support static export (generateStaticParams),
 * but it renders a Client Component to handle data fetching in the browser
 * (to avoid 'cookies()' errors during static build).
 */
export default async function StudentResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  return <StudentResultsClient id={id} />;
}
