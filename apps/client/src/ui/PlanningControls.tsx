import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Banner } from '@/kit/Banner';
import { Segmented } from '@/kit/Segmented';
import { useGameUIStore } from '../store/useGameUIStore';
import { MoveTokenTray } from './MoveTokenTray';
import { PlannedMoves } from './PlannedMoves';
import { CannonballChip } from './CannonballChip';
import { TOKEN_ORDER, tokenLabel } from './tokenMeta';

function SectionTitle({ children }: { children: string }) {
  return (
    <h3 className="text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
      {children}
    </h3>
  );
}

/**
 * Everything needed to plan a turn: next-token choice, token tray, the four
 * plan slots with cannon buttons, and Clear / Lock In. Shared by the mobile
 * sheet and the desktop sidebar so both behave identically.
 */
export function PlanningControls({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const status = useGameUIStore((state) => state.status);
  const hasPlan = useGameUIStore(
    (state) =>
      state.leaving ||
      state.queue.some((slot) => slot !== null) ||
      state.cannonQueue.some((slot) => slot.left || slot.right),
  );
  const auto = useGameUIStore((state) => state.auto);
  const requested = useGameUIStore((state) => state.requested);
  const setAuto = useGameUIStore((state) => state.setAuto);
  const setRequested = useGameUIStore((state) => state.setRequested);
  const lockIn = useGameUIStore((state) => state.lockIn);
  const canLeave = useGameUIStore((state) => state.canLeave);
  const leaving = useGameUIStore((state) => state.leaving);
  const haul = useGameUIStore((state) => state.haul);
  const setLeave = useGameUIStore((state) => state.setLeave);
  const clearPlayerActions = useGameUIStore((state) => state.clearPlayerActions);

  const planning = status === 'planning';
  const canPlan = useGameUIStore((state) => state.canPlan);
  const lockedIn = useGameUIStore((state) => state.lockedIn);
  const waitingFor = useGameUIStore((state) => state.waitingFor);
  const spectating = useGameUIStore((state) => state.spectating);

  return (
    <div className={compact ? 'flex flex-col gap-3' : 'flex flex-col gap-4'}>
      {spectating && <Banner tone="bad">{t('hud.sunkWatching')}</Banner>}
      {lockedIn && planning && !spectating && (
        <Banner tone="info">
          {waitingFor > 0 ? t('hud.waitingFor', { count: waitingFor }) : t('hud.lockedIn')}
        </Banner>
      )}

      {!compact && (
        <div className="flex flex-col gap-1.5">
          <SectionTitle>{t('plan.nextToken')}</SectionTitle>
          <Segmented
            label={t('plan.nextToken')}
            compact
            disabled={!planning}
            value={auto ? 'auto' : requested}
            onChange={(choice) => {
              if (choice === 'auto') {
                setAuto(true);
              } else {
                setAuto(false);
                setRequested(choice);
              }
            }}
            choices={[
              { label: t('plan.auto'), value: 'auto' as const },
              ...TOKEN_ORDER.map((action) => ({ label: tokenLabel(t, action), value: action })),
            ]}
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {!compact && <SectionTitle>{t('plan.moveTokens')}</SectionTitle>}
        <MoveTokenTray />
      </div>

      <div className="flex flex-col gap-1.5">
        {!compact && (
          <div className="flex items-center justify-between">
            <SectionTitle>{t('plan.plan')}</SectionTitle>
            <CannonballChip />
          </div>
        )}
        <PlannedMoves />
      </div>

      {canLeave && (
        <div className="flex flex-col gap-1.5">
          <Button
            variant={leaving ? 'default' : 'secondary'}
            size={compact ? 'sm' : 'default'}
            aria-pressed={leaving}
            disabled={!canPlan}
            onClick={() => setLeave(!leaving)}
          >
            {leaving ? t('plan.leavingWith', { count: haul }) : t('plan.leave', { count: haul })}
          </Button>
          {!compact && <p className="text-xs text-muted-foreground">{t('plan.leaveHint')}</p>}
        </div>
      )}

      {/* Pinned, so Lock In stays reachable when the plan is taller than the panel. */}
      <div className="sticky bottom-0 flex gap-2 bg-card pt-2 pb-1">
        <Button
          variant="secondary"
          size={compact ? 'sm' : 'default'}
          disabled={!canPlan || !hasPlan}
          onClick={clearPlayerActions}
        >
          {t('plan.clear')}
        </Button>
        <Button size={compact ? 'sm' : 'lg'} className="flex-1" disabled={!canPlan} onClick={lockIn}>
          {lockedIn ? t('hud.lockedIn') : hasPlan ? t('hud.lockIn') : t('hud.passTurn')}
        </Button>
      </div>
    </div>
  );
}
