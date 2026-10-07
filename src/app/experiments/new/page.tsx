import { PageHeader } from "@/components/ui";
import { ExperimentForm } from "@/components/experiment-form";

export default function NewExperimentPage() {
  return (
    <div>
      <PageHeader title="New experiment" subtitle="Define the problem, hypothesis, baseline and the new approach." />
      <ExperimentForm />
    </div>
  );
}
