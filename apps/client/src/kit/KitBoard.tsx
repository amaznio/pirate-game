import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Banner } from '@/kit/Banner';
import { Tile } from '@/kit/Tile';
import { Anchor, Compass } from 'lucide-react';
import { CannonToggle } from '@/ui/CannonToggle';
import { HullBar } from '@/ui/ShipStatus';
import { ResultSummaryView } from '@/ui/ResultSummary';
import type { MatchResult } from '@pirate/game-core/domain/MatchResult';
import { TOKEN_META, TOKEN_ORDER } from '@/ui/tokenMeta';
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
  const [language, setLanguage] = useState('en');
  const [fire, setFire] = useState(true);
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

        <Section title="Select">
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger aria-label="Language" className="min-w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="es">Español</SelectItem>
              <SelectItem value="pl">Polski</SelectItem>
            </SelectContent>
          </Select>
        </Section>

        <Section title="Dialog">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="secondary">Open a dialog</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-head text-2xl font-bold">Sea guide</DialogTitle>
                <DialogDescription>Wind pushes a ship one cell.</DialogDescription>
              </DialogHeader>
            </DialogContent>
          </Dialog>
        </Section>

        <Section title="Banner (objective, info, warning, bad)">
          <div className="flex w-full flex-col gap-2">
            <Banner tone="objective">Merchant: 11 cells from escaping, turn 3 of 12</Banner>
            <Banner tone="info">Locked in, waiting for 1 other player</Banner>
            <Banner tone="warning">Timer low</Banner>
            <Banner tone="bad">Your ship was sunk, watching the battle</Banner>
          </div>
        </Section>

        <Section title="Tile (primary, normal, disabled)">
          <div className="grid w-full gap-3 md:grid-cols-3">
            <Tile primary icon={<Anchor />} title="Quick battle" blurb="Pick a scenario." cta="Choose" onClick={() => {}} />
            <Tile icon={<Anchor />} title="Friends" blurb="Create a room." cta="Open lobby" onClick={() => {}} />
            <Tile icon={<Compass />} title="Voyage" blurb="A map of battles." badge="Coming soon" />
          </div>
        </Section>

        <Section title="Hull pips (full, damaged)">
          <HullBar hp={6} maxHp={6} />
          <HullBar hp={3} maxHp={6} />
          <HullBar hp={2} maxHp={4} small />
        </Section>

        <Section title="Token chips (arrow, word, count)">
          {TOKEN_ORDER.map((action) => (
            <Badge key={action} className={`${TOKEN_META[action].bgClass} gap-1 text-ocean-deep`}>
              <span aria-hidden>{TOKEN_META[action].arrow}</span>
              {TOKEN_META[action].short.charAt(0) + TOKEN_META[action].short.slice(1).toLowerCase()}
              <span className="tabular-nums">x3</span>
            </Badge>
          ))}
        </Section>

        <Section title="Cannon toggle (on, off, disabled, small)">
          <CannonToggle active={fire} disabled={false} label="Fire" onClick={() => setFire(!fire)} />
          <CannonToggle active={false} disabled={false} label="Off" onClick={() => {}} />
          <CannonToggle active={false} disabled label="Disabled" onClick={() => {}} />
          <CannonToggle active small disabled={false} label="Small" onClick={() => {}} />
        </Section>

        <Section title="Switch">
          <Switch defaultChecked aria-label="Loot" />
          <Switch aria-label="Off" />
        </Section>

        <Section title="Card">
          <Card className="w-full p-4">A panel on the ocean.</Card>
        </Section>

        <Section title="Result summary (a win, a hunt left, a loss)">
          <div className="flex w-full gap-4">
            {['victory', 'defeat', 'draw'].map((name) => (
              <img key={name} src={`/assets/result/emblem-${name}.png`} width={96} height={96} alt={name} className="[image-rendering:pixelated]" />
            ))}
          </div>
          <div className="flex w-full flex-wrap gap-4">
            {SAMPLE_RESULTS.map((sample, index) => (
              <Card key={index} className="w-full max-w-md p-4">
                <ResultSummaryView battle={sample} viewerId="you" />
              </Card>
            ))}
          </div>
        </Section>
      </div>
    </div>
  );
}

const NO_LOOT = { barrel: 0, crate: 0, plank: 0 };
const SAMPLE_SHIPS = {
  you: { playerId: 'you', name: 'You', teamId: 'a', shipTypeId: 'brigantine', hull: 5, maxHull: 6, afloat: true, ammo: 2, tokens: 0, pickups: { barrel: 1, crate: 0, plank: 1 } },
  foe: { playerId: 'foe', name: 'Enemy', teamId: 'b', shipTypeId: 'sloop', hull: 0, maxHull: 4, afloat: false, ammo: 0, tokens: 0, pickups: NO_LOOT },
  rival: { playerId: 'rival', name: 'Bot 3', teamId: 'c', shipTypeId: 'galleon', hull: 3, maxHull: 6, afloat: true, ammo: 4, tokens: 0, pickups: NO_LOOT },
};
const SAMPLE_RESULTS: MatchResult[] = [
  {
    outcome: { kind: 'win', teamId: 'a' },
    turns: 9,
    ships: [SAMPLE_SHIPS.you, SAMPLE_SHIPS.foe, SAMPLE_SHIPS.rival],
    objective: { kind: 'salvage', met: true },
  },
  {
    outcome: { kind: 'win', teamId: 'a', reason: 'left' },
    turns: 13,
    ships: [{ ...SAMPLE_SHIPS.you, hull: 3, afloat: false, escaped: true, haul: 12 }],
    objective: { kind: 'hunt', met: true },
    hunt: { ending: 'left', bossSlain: true, monstersSunk: 3, haul: 12 },
  },
  {
    outcome: { kind: 'win', teamId: 'b' },
    turns: 7,
    ships: [{ ...SAMPLE_SHIPS.you, hull: 0, afloat: false, ammo: 5 }, { ...SAMPLE_SHIPS.foe, hull: 2, afloat: true }],
  },
] as MatchResult[];

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
