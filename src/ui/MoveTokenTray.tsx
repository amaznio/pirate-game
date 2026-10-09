import { useGameUIStore } from '../store/useGameUIStore';
import { TOKEN_META, TOKEN_ORDER } from './tokenMeta';

interface MoveTokenTrayProps {
  compact?: boolean;
}

/**
 * Available movement tokens. Tapping one moves it into the first empty queue
 * slot and spends it from the pool.
 */
export function MoveTokenTray({ compact = false }: MoveTokenTrayProps) {
  const tokens = useGameUIStore((state) => state.tokens);
  const status = useGameUIStore((state) => state.status);
  const queueFull = useGameUIStore((state) =>
    state.queue.every((slot) => slot !== null),
  );
  const queuePlayerAction = useGameUIStore((state) => state.queuePlayerAction);

  const planning = status === 'planning';

  return (
    <div className={compact ? 'flex gap-2' : 'grid grid-cols-3 gap-2'}>
      {TOKEN_ORDER.map((action) => {
        const meta = TOKEN_META[action];
        const count = tokens[action];
        const disabled = !planning || count <= 0 || queueFull;

        return (
          <button
            key={action}
            type="button"
            disabled={disabled}
            onClick={() => queuePlayerAction(action)}
            className={`${meta.bgClass} flex min-w-[64px] flex-col items-center justify-center rounded-xl px-3 py-2 font-bold text-white shadow transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 ${
              compact ? 'text-[11px]' : 'text-sm'
            }`}
          >
            <span className="leading-tight">{compact ? meta.short : meta.label}</span>
            <span className="text-[10px] font-semibold opacity-90">x{count}</span>
          </button>
        );
      })}
    </div>
  );
}
