import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { EndNote } from '../presentation/objectiveProgress';
import { useGameUIStore, type MatchResult } from '../store/useGameUIStore';
import { ResultSummary } from './ResultSummary';

/** Shown when the battle is over: the result, a few numbers, and what to do next. */
export function GameOverDialog({
  result,
  note,
  canRestart,
  onRestart,
  onExit,
  onContinue,
}: {
  result: MatchResult | null;
  note: EndNote;
  canRestart: boolean;
  onRestart: () => void;
  onExit: () => void;
  /** In a solo voyage: the one way on. The voyage decides what the result means. */
  onContinue?: () => void;
}) {
  const { t } = useTranslation();
  const hunt = useGameUIStore((state) => state.battle?.hunt);
  // A hunt is not a victory over a fleet: you either got out with the haul or went down with it.
  const huntBody = hunt
    ? hunt.ending === 'left'
      ? [
          hunt.haul > 0 ? t('result.hunt.leftBodyHaul', { count: hunt.haul }) : t('result.hunt.leftBodyEmpty'),
          ...(hunt.bossSlain ? [t('result.hunt.leftBodyBoss')] : []),
        ].join(' ')
      : t('result.hunt.sunkBody')
    : null;
  const title = hunt
    ? hunt.ending === 'left'
      ? t('result.hunt.leftTitle')
      : t('result.sunkTitle')
    : result === 'win'
      ? t('result.victoryTitle')
      : result === 'draw'
        ? t('result.drawTitle')
        : note === 'salvageLost'
          ? t('result.salvageLostTitle')
          : t('result.sunkTitle');
  const body =
    huntBody ??
    (note
      ? t(`result.note.${note}`)
      : result === 'win'
        ? t('result.victoryBody')
        : result === 'draw'
          ? t('result.drawBody')
          : t('result.sunkBodyAlt'));

  // A picture for how it ended: a trophy for a win (a hunt left alive is one), a flag of truce for a draw, else a sinking ship.
  const emblem = hunt
    ? hunt.ending === 'left'
      ? 'victory'
      : 'defeat'
    : result === 'win'
      ? 'victory'
      : result === 'draw'
        ? 'draw'
        : 'defeat';

  return (
    <Dialog open>
      <DialogContent showCloseButton={false} onEscapeKeyDown={(event) => event.preventDefault()}>
        <DialogHeader className="items-center text-center">
          <img
            src={`/assets/result/emblem-${emblem}.png`}
            width={96}
            height={96}
            alt=""
            className="[image-rendering:pixelated]"
          />
          <DialogTitle className="font-head text-4xl font-bold">{title}</DialogTitle>
          <DialogDescription className="text-base">{body}</DialogDescription>
        </DialogHeader>
        <ResultSummary />
        <div className="flex flex-col gap-2">
          {onContinue && (
            <Button size="lg" onClick={onContinue}>
              {result === 'win' || note === 'salvageLost' ? t('voyage.continue') : t('voyage.seeResult')}
            </Button>
          )}
          {!onContinue && canRestart && (
            <Button size="lg" onClick={onRestart}>
              {t('result.sailAgain')}
            </Button>
          )}
          {!onContinue && (
            <Button variant={canRestart ? 'secondary' : 'default'} size={canRestart ? 'default' : 'lg'} onClick={onExit}>
              {canRestart ? t('result.mainMenu') : t('result.backToMenu')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** A hunt, with the ship in the exit area: sail off with the haul now, or keep hunting. */
export function ExitDialog({ haul, onLeave, onStay }: { haul: number; onLeave: () => void; onStay: () => void }) {
  const { t } = useTranslation();
  return (
    <Dialog open onOpenChange={(open) => !open && onStay()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader className="items-center text-center">
          <DialogTitle className="font-head text-3xl font-bold">{t('exitDialog.title')}</DialogTitle>
          <DialogDescription className="text-base">
            {haul > 0 ? t('exitDialog.body', { count: haul }) : t('exitDialog.bodyEmpty')}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Button size="lg" onClick={onLeave}>
            {t('exitDialog.leave')}
          </Button>
          <Button variant="secondary" onClick={onStay}>
            {t('exitDialog.stay')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Sunk while others are still fighting: stay and watch, or leave. */
export function SunkDialog({ onKeepWatching, onExit }: { onKeepWatching: () => void; onExit: () => void }) {
  const { t } = useTranslation();
  return (
    <Dialog open>
      <DialogContent showCloseButton={false} onEscapeKeyDown={(event) => event.preventDefault()}>
        <DialogHeader className="items-center text-center">
          <DialogTitle className="font-head text-4xl font-bold">{t('result.sunkTitle')}</DialogTitle>
          <DialogDescription className="text-base">{t('result.sunkBody')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Button size="lg" onClick={onKeepWatching}>
            {t('result.keepWatching')}
          </Button>
          <Button variant="secondary" onClick={onExit}>
            {t('result.leave')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
