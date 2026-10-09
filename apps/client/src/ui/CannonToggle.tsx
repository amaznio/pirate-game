interface CannonToggleProps {
  active: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
}

/** A cannonball checkbox for one broadside in one phase. */
export function CannonToggle({
  active,
  disabled,
  label,
  onClick,
}: CannonToggleProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition hover:border-parchment/50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 ${
        active
          ? 'border-black/50 bg-ocean-light'
          : 'border-parchment/25 bg-black/20'
      }`}
    >
      <span
        className={`relative flex h-6 w-6 items-center justify-center rounded-full ${
          active
            ? 'bg-ink shadow-inner'
            : 'border border-parchment/30 bg-black/30'
        }`}
      >
        {active && (
          <span className="absolute top-1 left-1 h-1.5 w-1.5 rounded-full bg-white/60" />
        )}
      </span>
    </button>
  );
}
