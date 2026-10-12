import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChoiceGroup, ChoiceRow } from '@/kit/ChoiceRow';
import { Notice } from '@/kit/Notice';
import { Segmented } from '@/kit/Segmented';
import { Stepper } from '@/kit/Stepper';
import { useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

/**
 * Every shared component in every state, on one page (open with `?kit`).
 * When something looks off, look here first; screens must not restyle these.
 */
export function KitBoard() {
  const [seas, setSeas] = useState('normal');
  const [scenario, setScenario] = useState('a');
  const [count, setCount] = useState(2);
  return (
    <div className="h-full overflow-y-auto bg-background p-8 text-foreground">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <h1 className="font-head text-4xl font-bold">Components</h1>

        <Section title="Button">
          <Button size="lg">Set sail</Button>
          <Button>Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button disabled>Disabled</Button>
          <Button variant="destructive">Abandon</Button>
        </Section>

        <Section title="Badge">
          <Badge>Hold 7 / 10</Badge>
          <Badge variant="secondary">Host</Badge>
          <Badge variant="outline">Coming soon</Badge>
        </Section>

        <Section title="Segmented (ToggleGroup)">
          <ToggleGroup type="single" defaultValue="normal" variant="outline">
            <ToggleGroupItem value="calm">Calm</ToggleGroupItem>
            <ToggleGroupItem value="normal">Normal</ToggleGroupItem>
            <ToggleGroupItem value="stormy">Stormy</ToggleGroupItem>
          </ToggleGroup>
        </Section>

        <Section title="Segmented (kit)">
          <Segmented
            value={seas}
            onChange={setSeas}
            choices={[
              { label: 'Calm', value: 'calm' },
              { label: 'Normal', value: 'normal' },
              { label: 'Stormy', value: 'stormy' },
            ]}
          />
          <Segmented
            value="normal"
            disabled
            onChange={() => {}}
            choices={[
              { label: 'Calm', value: 'calm' },
              { label: 'Normal', value: 'normal' },
            ]}
          />
        </Section>

        <Section title="Choice rows">
          <ChoiceGroup value={scenario} onChange={setScenario} label="Scenario" className="w-full">
            <ChoiceRow value="a" title="Salvage" rule="Race the fleet to the floating cargo." />
            <ChoiceRow value="b" title="Merchant chase" rule="Sink the unarmed cargo ship before it escapes." />
          </ChoiceGroup>
        </Section>

        <Section title="Stepper and notice">
          <Stepper label="Opponents" value={count} min={1} max={7} onChange={setCount} />
          <Notice>Room not found.</Notice>
        </Section>

        <Section title="Switch">
          <Switch defaultChecked aria-label="Loot" />
          <Switch aria-label="Off" />
        </Section>

        <Section title="Card">
          <Card className="w-full p-4">A panel on the ocean.</Card>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
        {title}
      </h2>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </section>
  );
}
