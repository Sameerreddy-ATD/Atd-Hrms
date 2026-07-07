import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";

export function PlaceholderPage({
  title,
  description,
  note = "This screen is scaffolded. Wire it to the backend API to populate content.",
}: {
  title: string;
  description?: string;
  note?: string;
}) {
  return (
    <div>
      <PageHeader title={title} description={description} />
      <EmptyState title="Ready for integration" description={note} />
    </div>
  );
}