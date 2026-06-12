import { PageHeader } from "@/components/ui/page-header";

export function SectionHeading({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return <PageHeader title={title} description={description} actions={actions} />;
}
