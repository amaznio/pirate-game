interface CannonToggleProps {
  active: boolean;
  disabled: boolean;
  label: string;
  onClick: () => void;
  /** Smaller, for a side that has several cannons to show. */
  small?: boolean;
}

/** A cannonball checkbox for one cannon of one broadside in one phase. */
export function CannonToggle({
  active,
  disabled,
  label,
  onClick,
  small = false,
}: CannonToggleProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`flex shrink-0 items-center justify-center rounded-full border transition hover:border-parchment/50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-30 ${
        small ? 'h-6 w-6' : 'h-9 w-9'
      } ${active ? 'border-black/50 bg-ocean-light' : 'border-parchment/25 bg-black/20'}`}
    >
      <span
        className={`relative flex items-center justify-center rounded-full ${
          small ? 'h-3.5 w-3.5' : 'h-6 w-6'
        } ${active ? 'bg-ink shadow-inner' : 'border border-parchment/30 bg-black/30'}`}
      >
        {active && (
          <span
            className={`absolute rounded-full bg-white/60 ${
              small ? 'top-px left-px h-1 w-1' : 'top-1 left-1 h-1.5 w-1.5'
            }`}
          />
        )}
      </span>
    </button>
  );
}
