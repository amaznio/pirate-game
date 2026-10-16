import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScreenFrame } from '@/kit/ScreenFrame';
import { buildBattle, type BattleSetup } from '@pirate/run-core/run/battle';
import type { RunState } from '@pirate/run-core/run/types';
import { runStore, useRun } from '../../run/runStore';
import { PortScreen } from './PortScreen';
import { VoyageEndScreen } from './VoyageEndScreen';
import { VoyageMapScreen } from './VoyageMapScreen';

/**
 * The ship has reached a fight: start it at once. What the player needs to know (who is in it, what it
 * pays, what the leg costs) was shown on the map before they chose to sail, so there is no screen between.
 */
function SailIntoBattle({ run, onSail }: { run: RunState; onSail: (setup: BattleSetup) => void }) {
  useEffect(() => {
    onSail(buildBattle(run));
    // Once, on arrival: starting the battle changes the run, which must not start it again.
  }, []);
  return null;
}

/**
 * The solo voyage: shows the screen for wherever the voyage stands (no voyage
 * yet, at a port, choosing a route, or over; a fight starts as soon as the ship reaches it). The voyage itself
 * lives in the run store, so leaving and coming back finds it where it was.
 */
export function VoyageFlow({
  onBack,
  onSail,
}: {
  /** Back to the mode list; the voyage stays saved. */
  onBack: () => void;
  /** Start the battle at the ship's stop. */
  onSail: (setup: BattleSetup) => void;
}) {
  const { t } = useTranslation();
  const run = useRun((state) => state.run);

  if (!run) {
    return (
      <ScreenFrame
        title={t('menu.voyage')}
        onBack={onBack}
        wide={false}
        footer={
          <Button size="lg" className="w-full" onClick={() => runStore.getState().start()}>
            {t('menu.setSail')}
          </Button>
        }
      >
        <Card>
          <p className="font-head text-2xl font-bold">{t('voyage.new')}</p>
          <p className="text-base text-muted-foreground">{t('voyage.introBlurb')}</p>
        </Card>
      </ScreenFrame>
    );
  }
  if (run.phase === 'victory' || run.phase === 'defeat') {
    return <VoyageEndScreen run={run} onMenu={onBack} />;
  }
  if (run.phase === 'port') {
    return <PortScreen run={run} onBack={onBack} />;
  }
  if (run.phase === 'battle') {
    return <SailIntoBattle run={run} onSail={onSail} />;
  }
  return <VoyageMapScreen run={run} onBack={onBack} />;
}
