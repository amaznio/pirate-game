import { useGameUIStore } from '../store/useGameUIStore';
import { HullBar } from './ShipStatus';
import { aiLevelLabel } from './menu/aiLevels';

interface FleetListProps {
  /** Tighter rows for the small mobile HUD. */
  compact?: boolean;
}

/**
 * Every ship in the match: the player first, then the others, each with their
 * team colour, name and hull. Sunk ships stay listed but dimmed.
 */
export function FleetList({ compact = false }: FleetListProps) {
  const hull = useGameUIStore((state) => state.hull);
  const maxHull = useGameUIStore((state) => state.maxHull);
  const selfColor = useGameUIStore((state) => state.selfColor);
  const others = useGameUIStore((state) => state.others);

  const rows = [
    {
      id: 'self',
      name: 'You',
      color: selfColor,
      hull,
      maxHull,
      alive: hull > 0,
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
      you: false,
      bot: other.bot,
      difficulty: other.difficulty,
    })),
  ];

  return (
    <ul className={`flex flex-col ${compact ? 'gap-1' : 'gap-2'}`}>
      {rows.map((row) => (
        <li
          key={row.id}
          className={`flex items-center gap-2 ${row.alive ? '' : 'opacity-40'}`}
        >
          <span
            className={`h-3 w-3 shrink-0 rounded-full ring-2 ${
              row.you ? 'ring-white/90' : 'ring-black/40'
            }`}
            style={{ backgroundColor: row.color }}
            aria-hidden
          />
          <span
            className={`truncate font-bold ${
              compact ? 'w-14 text-[11px]' : 'w-20 text-xs uppercase tracking-wide'
            } ${row.alive ? 'text-parchment' : 'text-parchment/70 line-through'}`}
          >
            {row.name}
          </span>
          {row.bot && (
            <span
              className="rounded bg-parchment/15 px-1 text-[9px] font-bold uppercase tracking-wide text-parchment/70"
              title={
                row.difficulty
                  ? `An AI is sailing this ship (${aiLevelLabel(row.difficulty)})`
                  : 'An AI is sailing this ship'
              }
            >
              AI
            </span>
          )}
          <HullBar hp={row.hull} maxHp={row.maxHull} />
          <span className="ml-auto text-xs font-semibold tabular-nums text-parchment">
            {row.alive ? `${row.hull}/${row.maxHull}` : 'Sunk'}
          </span>
        </li>
      ))}
    </ul>
  );
}
