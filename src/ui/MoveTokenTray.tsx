import { useGameUIStore } from '../store/useGameUIStore';
import { TOKEN_META, TOKEN_ORDER } from './tokenMeta';

/**
 * Available movement tokens. Tapping one moves it into the first empty queue
 * slot and spends it from the pool.
 */
export function MoveTokenTray() {
  const tokens = useGameUIStore((state) => state.tokens);
  const status = useGameUIStore((state) => state.status);
  const queueFull = useGameUIStore((state) =>
    state.queue.every((slot) => slot !== null),
  );
  const queuePlayerAction = useGameUIStore((state) => state.queuePlayerAction);

  const planning = status === 'planning';

  return (
    <div className="grid grid-cols-3 gap-2">
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
            title={`${meta.label} (${meta.key})`}
            className={`${meta.bgClass} flex flex-col items-center justify-center rounded-xl px-3 py-1.5 text-sm font-bold text-white shadow transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35`}
          >
            <span className="leading-tight">{meta.label}</span>
            <span className="text-[10px] font-semibold opacity-90">x{count}</span>
          </button>
        );
      })}
    </div>
  );
}
