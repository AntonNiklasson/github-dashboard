import { PrCardPlayground } from "../components/PrCardPlayground";
import { ComponentsLayout } from "./ComponentsLayout";

export function PrCardPage() {
  return (
    <ComponentsLayout
      title="PrCard playground"
      description="Drive every prop on the PR card. Toggle 'Show grid' for a dashed outline on every element."
    >
      <PrCardPlayground />
    </ComponentsLayout>
  );
}
