import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowRight, GitBranch, Rocket, TriangleAlert } from "lucide-react";
import { Pill } from "../components/Pill";
import { PrStateIcon } from "../components/PrStateIcon";
import { ReviewStamp } from "../components/ReviewStamp";
import { SectionHeader } from "../components/SectionHeader";
import { StatusBadge } from "../components/StatusBadge";
import { Text } from "../components/Text";
import { TimeAgo } from "../components/TimeAgo";
import { ComponentsLayout } from "./ComponentsLayout";

export function ShowcasePage() {
  return (
    <ComponentsLayout
      title="Showcase"
      description="Visual primitives used across the dashboard."
    >
      <Group
        title="Core"
        description="Low-level, leaf primitives. Variant-driven, no domain knowledge."
      >
        <Entry
          name="Text"
          description="Typographic primitive with size, variant, and bold props."
        >
          <div className="flex flex-col gap-1">
            <Text size="small">Small</Text>
            <Text>Normal (default)</Text>
            <Text size="large">Large</Text>
            <Text bold>Normal bold</Text>
            <Text size="large" bold>
              Large bold
            </Text>
          </div>
          <div className="flex flex-col gap-1">
            <Text variant="primary">Primary (default)</Text>
            <Text variant="secondary">Secondary</Text>
            <Text variant="tertiary">Tertiary</Text>
          </div>
        </Entry>

        <Entry
          name="Pill"
          description="Compact labeled badge with an optional icon and tone."
        >
          <Pill icon={Rocket} tone="green">
            auto-merge
          </Pill>
          <Pill icon={TriangleAlert} tone="amber">
            conflict
          </Pill>
          <Pill icon={ArrowRight} tone="muted">
            release-branch
          </Pill>
          <Pill tone="red">red</Pill>
          <Pill tone="blue">blue</Pill>
          <Pill tone="muted">muted</Pill>
          <Pill icon={GitBranch}>no tone</Pill>
        </Entry>

        <Entry name="Button" description="Variants and sizes.">
          <Button variant="default">Default</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="link">Link</Button>
        </Entry>

        <Entry name="Button sizes">
          <Button size="xs">xs</Button>
          <Button size="sm">sm</Button>
          <Button size="default">default</Button>
          <Button size="lg">lg</Button>
        </Entry>

        <Entry name="Card" description="Surface used for list items.">
          <Card className="w-80 px-4 py-3 text-sm">
            Default card surface with ring.
          </Card>
          <Card size="sm" className="w-80 px-3 py-2 text-sm">
            Compact card (size="sm").
          </Card>
        </Entry>

        <Entry name="TimeAgo" description="Relative timestamp.">
          <TimeAgo date={new Date(Date.now() - 30_000).toISOString()} />
          <TimeAgo date={new Date(Date.now() - 5 * 60_000).toISOString()} />
          <TimeAgo
            date={new Date(Date.now() - 3 * 60 * 60_000).toISOString()}
          />
          <TimeAgo
            date={new Date(Date.now() - 2 * 24 * 60 * 60_000).toISOString()}
          />
        </Entry>
      </Group>

      <Group
        title="App"
        description="Higher-level components with a narrow, domain-specific API. Typically compose core primitives."
      >
        <Entry
          name="ReviewStamp"
          description="Thin wrapper over Pill with a tight kind enum; count shows when > 1."
        >
          <ReviewStamp kind="approved" />
          <ReviewStamp kind="approved" count={3} />
          <ReviewStamp kind="changes-requested" />
          <ReviewStamp kind="changes-requested" count={2} />
          <ReviewStamp kind="missing-code-owner" />
        </Entry>

        <Entry name="PrStateIcon" description="State icon used on PR cards.">
          <Label text="ready">
            <PrStateIcon status="ready" />
          </Label>
          <Label text="draft">
            <PrStateIcon status="draft" />
          </Label>
          <Label text="merge queue">
            <PrStateIcon status="merge-queue" />
          </Label>
          <Label text="merged">
            <PrStateIcon status="merged" />
          </Label>
          <Label text="closed">
            <PrStateIcon status="closed" />
          </Label>
          <Label text="loading">
            <PrStateIcon status="ready" loading={true} />
          </Label>
        </Entry>

        <Entry
          name="StatusBadge"
          description="CI status pill — narrow enum, no unknown state."
        >
          <StatusBadge status="success" />
          <StatusBadge status="failure" />
          <StatusBadge status="pending" />
        </Entry>

        <Entry name="SectionHeader" description="Column heading.">
          <div className="w-64 rounded border bg-card px-4 py-3">
            <SectionHeader
              section="prs"
              label="My PRs"
              count={4}
              isActive={true}
              isFetching={false}
              onClick={() => {}}
            />
          </div>
          <div className="w-64 rounded border bg-card px-4 py-3">
            <SectionHeader
              section="reviews"
              label="Review Requests"
              count={12}
              isActive={false}
              isFetching={true}
              onClick={() => {}}
            />
          </div>
        </Entry>
      </Group>
    </ComponentsLayout>
  );
}

function Group({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-14">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function Entry({
  name,
  description,
  children,
}: {
  name: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8 border-t pt-6">
      <div className="mb-3">
        <h3 className="font-mono text-sm font-semibold">{name}</h3>
        {description && (
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card/50 p-4">
        {children}
      </div>
    </section>
  );
}

function Label({
  text,
  children,
}: {
  text: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      {children}
      <span className="text-[10px] text-muted-foreground">{text}</span>
    </div>
  );
}
