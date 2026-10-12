import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useGameUIStore } from '../store/useGameUIStore';
import { HullBar } from './ShipStatus';
import { aiLevelLabel } from './menu/aiLevels';

interface FleetListProps {
  /** Tighter rows for the small mobile HUD. */
  compact?: boolean;
}

/**
 * Every ship in the match: the player first, then the others, each with their
 * team colour, name and hull pips. Ships out of the fight say so in words
 * (sunk, escaped, due on a turn), never by dimming alone.
 */
export function FleetList({ compact = false }: FleetListProps) {
  const { t } = useTranslation();
  const hull = useGameUIStore((state) => state.hull);
  const maxHull = useGameUIStore((state) => state.maxHull);
  const selfColor = useGameUIStore((state) => state.selfColor);
  const others = useGameUIStore((state) => state.others);

  const rows = [
    {
      id: 'self',
      name: t('common.you'),
      color: selfColor,
      hull,
      maxHull,
      alive: hull > 0,
      escaped: false,
      arrivesOnTurn: null as number | null,
      you: true,
      bot: false,
      difficulty: null,
    },
    ...others.map((other) => ({
      id: other.playerId,
      name: other.name,
      color: other.color,
      hull: other.hull,
      maxHull: other.maxHull,
      alive: other.alive,
      escaped: other.escaped,
      arrivesOnTurn: other.arrivesOnTurn,
      you: false,
      bot: other.bot,
      difficulty: other.difficulty,
    })),
  ];

  return (
    <ul className={cn('flex flex-col', compact ? 'gap-0.5' : 'gap-2')}>
      {rows.map((row) => {
        const inPlay = row.alive || row.arrivesOnTurn !== null;
        return (
          <li key={row.id} className={cn('flex items-center gap-2', !inPlay && 'opacity-60')}>
            <span
              className={cn(
                'size-3.5 shrink-0 rounded-full ring-2',
                row.you ? 'ring-white/90' : 'ring-black/40',
              )}
              style={{ backgroundColor: row.color }}
              aria-hidden
            />
            <span
              className={cn(
                'truncate font-bold',
                compact ? 'w-[4.5rem] text-xs' : 'w-24 text-sm',
                !inPlay && 'line-through',
              )}
            >
              {row.name}
            </span>
            {row.bot && !compact && (
              <Badge
                variant="secondary"
                className="px-1.5 py-0 text-[10px] uppercase"
                title={
                  row.difficulty
                    ? t('fleet.aiSailingLevel', { level: aiLevelLabel(t, row.difficulty) })
                    : t('fleet.aiSailing')
                }
              >
                {t('fleet.aiTag')}
              </Badge>
            )}
            {row.alive && <HullBar hp={row.hull} maxHp={row.maxHull} small={compact} />}
            <span className="ml-auto text-xs font-bold tabular-nums">
              {row.alive
                ? `${row.hull}/${row.maxHull}`
                : row.arrivesOnTurn !== null
                  ? t('fleet.arrives', { turn: row.arrivesOnTurn })
                  : row.escaped
                    ? t('fleet.escaped')
                    : t('fleet.sunk')}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
