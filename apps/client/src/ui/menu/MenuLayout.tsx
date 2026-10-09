import type { ReactNode } from 'react';

/** Shared frame for the menu and the lobby: title on the ocean, content in a card. */
export function MenuLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full w-full overflow-y-auto bg-ocean-deep px-4 py-8">
      <div className="m-auto flex w-full max-w-md flex-col gap-5">
        <header className="text-center">
          <h1 className="text-3xl font-black tracking-wide text-parchment">
            Battle Navigation
          </h1>
          <p className="mt-1 text-sm text-parchment/60">
            Plan four moves. Out-sail the fleet.
          </p>
        </header>
        {children}
      </div>
    </div>
  );
}

export function Card({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-parchment/15 bg-ocean p-4 shadow-xl">
      {title && (
        <h2 className="text-xs font-bold uppercase tracking-wide text-parchment/70">
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}

export function PrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`rounded-xl bg-parchment px-4 py-2.5 text-base font-black text-ink shadow-lg transition hover:brightness-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${props.className ?? ''}`}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={`rounded-xl bg-parchment/15 px-4 py-2.5 text-sm font-bold text-parchment transition hover:bg-parchment/25 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${props.className ?? ''}`}
    >
      {children}
    </button>
  );
}

/** A one-line message under a form (errors, hints). */
export function Notice({ children }: { children: ReactNode }) {
  return (
    <p
      role="status"
      className="rounded-xl bg-hull/25 px-3 py-2 text-center text-sm font-semibold text-parchment"
    >
      {children}
    </p>
  );
}

/** A number with minus and plus buttons. */
export function Stepper({
  value,
  min,
  max,
  onChange,
  disabled = false,
  label,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  label: string;
}) {
  const button =
    'flex h-9 w-9 items-center justify-center rounded-lg bg-parchment/15 text-lg font-black text-parchment transition hover:bg-parchment/25 active:scale-95 disabled:opacity-30';
  return (
    <div className="flex items-center gap-3" aria-label={label}>
      <button
        type="button"
        className={button}
        disabled={disabled || value <= min}
        onClick={() => onChange(value - 1)}
        aria-label={`Fewer ${label}`}
      >
        −
      </button>
      <span className="w-8 text-center text-lg font-black tabular-nums text-parchment">
        {value}
      </span>
      <button
        type="button"
        className={button}
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
        aria-label={`More ${label}`}
      >
        +
      </button>
    </div>
  );
}

/** A row of mutually exclusive choices. */
export function Segmented<T extends string | number | null>({
  value,
  choices,
  onChange,
  disabled,
}: {
  value: T;
  choices: ReadonlyArray<{ label: string; value: T }>;
  onChange: (value: T) => void;
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {choices.map((choice) => (
        <button
          key={choice.label}
          type="button"
          disabled={disabled}
          aria-pressed={choice.value === value}
          onClick={() => onChange(choice.value)}
          className={`rounded-lg px-3 py-1.5 text-xs font-bold transition active:scale-95 disabled:cursor-default ${
            choice.value === value
              ? 'bg-parchment text-ink'
              : 'bg-parchment/10 text-parchment hover:bg-parchment/20 disabled:hover:bg-parchment/10'
          }`}
        >
          {choice.label}
        </button>
      ))}
    </div>
  );
}
