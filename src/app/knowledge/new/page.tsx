import { PageHeader } from "@/components/ui";
import { KnowledgeForm } from "@/components/knowledge-form";

export default function NewKnowledgePage() {
  return (
    <div>
      <PageHeader title="New knowledge item" />
      <KnowledgeForm />
    </div>
  );
}
