import { Skull } from 'lucide-react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useBossMoment } from '../store/bossMoment';
import { useGameUIStore } from '../store/useGameUIStore';

/** The boss of a hunt: its title and a wide hull bar across the top of the board. */
export function BossBar({ className, style }: { className?: string; style?: CSSProperties }) {
  const { t } = useTranslation();
  const boss = useGameUIStore((state) => state.boss);
  if (!boss) {
    return null;
  }
  const slain = boss.hp <= 0;
  const share = Math.max(0, Math.min(1, boss.hp / boss.maxHp));
  return (
    <div
      role="status"
      aria-label={t('boss.barLabel', { title: boss.title, hp: Math.max(0, boss.hp), max: boss.maxHp })}
      style={style}
      className={cn(
        'pointer-events-none flex w-[min(28rem,calc(100%-1.5rem))] flex-col gap-1 rounded-card bg-card/90 px-3 py-1.5 text-card-foreground shadow-lg backdrop-blur',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 text-sm font-bold">
        <span className="flex items-center gap-1.5 font-head tracking-wide">
          <Skull className="size-4" aria-hidden />
          {boss.title}
        </span>
        <span className="text-xs">{slain ? t('boss.slain') : `${boss.hp} / ${boss.maxHp}`}</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-background/70">
        <div
          className={cn('h-full rounded-full transition-[width] duration-500', share > 0.25 ? 'bg-destructive' : 'bg-gold')}
          style={{ width: `${share * 100}%` }}
        />
      </div>
    </div>
  );
}

/** The name card the board shows when the boss rises, and the line when it is slain. */
export function BossMoment() {
  const { t } = useTranslation();
  const moment = useBossMoment((state) => state.moment);
  if (!moment) {
    return null;
  }
  return (
    <div className="pointer-events-none absolute inset-x-0 top-1/3 z-30 flex justify-center px-4" role="status">
      <div className="flex flex-col items-center gap-1 rounded-card bg-ink/80 px-8 py-4 text-center text-white shadow-2xl backdrop-blur">
        <span className="font-head text-3xl font-bold tracking-widest">{moment.title}</span>
        <span className="text-sm font-bold uppercase tracking-wider">
          {moment.kind === 'rise' ? t('boss.rises') : t('boss.isSlain')}
        </span>
      </div>
    </div>
  );
}
